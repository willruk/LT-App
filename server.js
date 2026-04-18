import express from "express";
import helmet from "helmet";
import compression from "compression";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);

if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL environment variable.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false
});

app.disable("x-powered-by");

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:", "https://i.scdn.co"],
        "connect-src": ["'self'"],
        "frame-src": ["'self'", "https://open.spotify.com"],
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
        "form-action": ["'self'"],
        "frame-ancestors": ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

app.use(compression());
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public"), { etag: true, maxAge: "1h" }));

function parseBirthday(input) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input || ""))) {
    return null;
  }

  const date = new Date(`${input}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function fmtDate(date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function safeBirthdayForYear(month, day, year) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}

/* -----------------------------
   DATABASE HELPERS
----------------------------- */

async function getDateRange() {
  const sql = `
    SELECT
      MIN(was_number_one_from) AS min_date,
      MAX(was_number_one_from) AS max_date
    FROM number_one_songs
    WHERE was_number_one_from IS NOT NULL
      AND COALESCE(artist, '') <> ''
      AND COALESCE(title, '') <> ''
  `;

  const { rows } = await pool.query(sql);
  return rows[0] || null;
}

async function getSongForDate(targetDate) {
  const sql = `
    SELECT
      was_number_one_from,
      artist,
      title,
      openai_blurb,
      blurb_status
    FROM number_one_songs
    WHERE was_number_one_from <= $1::date
      AND was_number_one_from IS NOT NULL
      AND COALESCE(artist, '') <> ''
      AND COALESCE(title, '') <> ''
    ORDER BY was_number_one_from DESC
    LIMIT 1
  `;

  const isoDate = toIsoDate(targetDate);
  console.log("getSongForDate target:", isoDate);

  const { rows } = await pool.query(sql, [isoDate]);
  console.log("getSongForDate result:", rows[0]);

  return rows[0] || null;
}

/* -----------------------------
   SPOTIFY HELPERS
----------------------------- */

const hasSpotifyCredentials =
  Boolean(process.env.SPOTIFY_CLIENT_ID) &&
  Boolean(process.env.SPOTIFY_CLIENT_SECRET);

let spotifyAccessToken = "";
let spotifyAccessTokenExpiresAt = 0;

async function getSpotifyAccessToken() {
  if (!hasSpotifyCredentials) {
    return null;
  }

  const now = Date.now();
  if (spotifyAccessToken && now < spotifyAccessTokenExpiresAt - 60_000) {
    return spotifyAccessToken;
  }

  const basicAuth = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString("base64");

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Spotify token request failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  spotifyAccessToken = data.access_token || "";
  spotifyAccessTokenExpiresAt = now + Number(data.expires_in || 3600) * 1000;

  return spotifyAccessToken || null;
}

function cleanSpotifyText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/&/g, " and ")
    .replace(/\b(feat\.?|ft\.?)\b.*$/i, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[^a-zA-Z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function tokenizeSpotifyText(value) {
  const cleaned = cleanSpotifyText(value);
  return cleaned ? cleaned.split(" ").filter(Boolean) : [];
}

function tokenOverlapScore(expected, candidate) {
  const expectedTokens = tokenizeSpotifyText(expected);
  const candidateTokens = new Set(tokenizeSpotifyText(candidate));

  if (!expectedTokens.length) {
    return 0;
  }

  let matched = 0;
  for (const token of expectedTokens) {
    if (candidateTokens.has(token)) {
      matched += 1;
    }
  }

  return matched / expectedTokens.length;
}

function phraseBonus(expected, candidate) {
  const a = cleanSpotifyText(expected);
  const b = cleanSpotifyText(candidate);

  if (!a || !b) {
    return 0;
  }
  if (a === b) {
    return 0.55;
  }
  if (b.includes(a)) {
    return 0.25;
  }
  if (a.includes(b)) {
    return 0.12;
  }
  return 0;
}

function startsWithBonus(expected, candidate) {
  const a = cleanSpotifyText(expected);
  const b = cleanSpotifyText(candidate);

  if (!a || !b) {
    return 0;
  }
  if (b.startsWith(a)) {
    return 0.18;
  }
  return 0;
}

function versionPenalty(trackName) {
  const cleaned = cleanSpotifyText(trackName);
  if (!cleaned) {
    return 0;
  }

  let penalty = 0;
  const patterns = [
    /\blive\b/,
    /\bkaraoke\b/,
    /\binstrumental\b/,
    /\bremix\b/,
    /\brecorded\b/,
    /\bdeluxe\b/,
    /\bremaster\b/,
    /\bmono\b/,
    /\bstereo\b/,
    /\bbonus\b/,
    /\bedit\b/,
    /\bversion\b/,
    /\breissue\b/,
    /\bacoustic\b/,
    /\bextended\b/
  ];

  for (const pattern of patterns) {
    if (pattern.test(cleaned)) {
      penalty += 0.1;
    }
  }

  return penalty;
}

function exactArtistBonus(expectedArtist, spotifyArtists) {
  const expected = cleanSpotifyText(expectedArtist);
  const joined = cleanSpotifyText(spotifyArtists);

  if (!expected || !joined) {
    return 0;
  }

  return joined === expected ? 0.22 : 0;
}

function scoreSpotifyCandidate(expectedTitle, expectedArtist, track) {
  const trackArtists = Array.isArray(track.artists)
    ? track.artists.map((artist) => artist.name).join(" ")
    : "";

  const titleScore =
    tokenOverlapScore(expectedTitle, track.name) +
    phraseBonus(expectedTitle, track.name) +
    startsWithBonus(expectedTitle, track.name);

  const artistScore =
    tokenOverlapScore(expectedArtist, trackArtists) +
    phraseBonus(expectedArtist, trackArtists) +
    exactArtistBonus(expectedArtist, trackArtists);

  const popularityBonus = Math.min(Number(track.popularity || 0) / 100, 0.12);
  const penalty = versionPenalty(track.name);

  return (titleScore * 0.68) + (artistScore * 0.32) + popularityBonus - penalty;
}

async function findBestSpotifyTrack(title, artist) {
  if (!hasSpotifyCredentials) {
    return null;
  }

  try {
    const accessToken = await getSpotifyAccessToken();
    if (!accessToken) {
      return null;
    }

    const cleanedTitle = cleanSpotifyText(title);
    const cleanedArtist = cleanSpotifyText(artist);

    const queries = [
      `track:${cleanedTitle} artist:${cleanedArtist}`,
      `"${cleanedTitle}" "${cleanedArtist}"`,
      `${cleanedTitle} ${cleanedArtist}`
    ];

    let bestTrack = null;
    let bestScore = -Infinity;

    for (const query of queries) {
      const response = await fetch(
        `https://api.spotify.com/v1/search?type=track&limit=12&q=${encodeURIComponent(query)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      );

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Spotify search failed (${response.status}): ${body}`);
      }

      const data = await response.json();
      const items =
        data &&
        data.tracks &&
        Array.isArray(data.tracks.items)
          ? data.tracks.items
          : [];

      for (const track of items) {
        const score = scoreSpotifyCandidate(title, artist, track);
        if (score > bestScore) {
          bestScore = score;
          bestTrack = track;
        }
      }
    }

    if (!bestTrack || bestScore < 0.82) {
      console.log("No confident Spotify match:", {
        title,
        artist,
        bestScore
      });
      return null;
    }

    return {
      id: bestTrack.id,
      url:
        bestTrack.external_urls && bestTrack.external_urls.spotify
          ? bestTrack.external_urls.spotify
          : "",
      embedUrl: `https://open.spotify.com/embed/track/${bestTrack.id}`,
      name: bestTrack.name,
      artists: Array.isArray(bestTrack.artists)
        ? bestTrack.artists.map((item) => item.name)
        : []
    };
  } catch (error) {
    console.error("Spotify lookup failed:", error);
    return null;
  }
}

/* -----------------------------
   ROUTES
----------------------------- */

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false });
  }
});

app.get("/api/birthday", async (req, res) => {
  try {
    const birthday = parseBirthday(String(req.query.date || ""));
    console.log("Raw birthday query:", req.query.date);
console.log("Parsed birthday ISO:", birthday ? toIsoDate(birthday) : null);
    if (!birthday) {
      return res.status(400).json({
        error: "Please provide a valid date in YYYY-MM-DD format."
      });
    }

    const rangeRow = await getDateRange();
    if (!rangeRow || !rangeRow.min_date || !rangeRow.max_date) {
      return res.status(500).json({
        error: "No chart data found in the database."
      });
    }

    const minDate = new Date(rangeRow.min_date);
    const maxDate = new Date(rangeRow.max_date);

    if (birthday < minDate || birthday > maxDate) {
      return res.status(400).json({
        error: `That date is outside the available chart data. Range: ${fmtDate(minDate)} to ${fmtDate(maxDate)}.`
      });
    }

    const birthRow = await getSongForDate(birthday);
    if (!birthRow) {
      return res.status(404).json({
        error: "No chart entry was found for that date."
      });
    }

    const spotify = await findBestSpotifyTrack(birthRow.title, birthRow.artist);

    const birthSong = {
      title: birthRow.title,
      artist: birthRow.artist,
      blurb: birthRow.openai_blurb || "",
      blurbStatus: birthRow.blurb_status || "",
      startDate: toIsoDate(new Date(birthRow.was_number_one_from)),
      startDateFormatted: fmtDate(new Date(birthRow.was_number_one_from)),
      spotify
    };

    const month = birthday.getUTCMonth() + 1;
    const day = birthday.getUTCDate();
    const birthYear = birthday.getUTCFullYear();
    const maxYear = maxDate.getUTCFullYear();

    const yearly = [];
    for (let year = birthYear + 1; year <= maxYear; year += 1) {
      const anniv = safeBirthdayForYear(month, day, year);
      if (!anniv) {
        continue;
      }

      const row = await getSongForDate(anniv);
      if (!row) {
        continue;
      }

      yearly.push({
        age: year - birthYear,
        year,
        title: row.title,
        artist: row.artist
      });
    }

    return res.json({
      requestedDate: toIsoDate(birthday),
      range: {
        min: toIsoDate(minDate),
        max: toIsoDate(maxDate),
        minFormatted: fmtDate(minDate),
        maxFormatted: fmtDate(maxDate)
      },
      birthSong,
      yearly
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "Something went wrong while loading the chart data."
    });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Life Tracks listening on port ${PORT}`);
});
