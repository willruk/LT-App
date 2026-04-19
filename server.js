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
        "object-src": ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

app.use(compression());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function parseBirthday(input) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input || ""))) return null;
  const d = new Date(`${input}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function fmtDate(date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

function safeBirthdayForYear(month, day, year) {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d;
}

async function getDateRange() {
  const { rows } = await pool.query(`
    SELECT
      MIN(was_number_one_from) AS min_date,
      MAX(was_number_one_from) AS max_date
    FROM number_one_songs
    WHERE was_number_one_from IS NOT NULL
      AND COALESCE(artist, '') <> ''
      AND COALESCE(title, '') <> ''
  `);
  return rows[0] || null;
}

async function getSongForDate(targetDate) {
  const { rows } = await pool.query(
    `
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
    `,
    [toIsoDate(targetDate)]
  );
  return rows[0] || null;
}

const hasSpotifyCredentials =
  Boolean(process.env.SPOTIFY_CLIENT_ID) &&
  Boolean(process.env.SPOTIFY_CLIENT_SECRET);

let spotifyAccessToken = "";
let spotifyAccessTokenExpiresAt = 0;
const spotifyCache = new Map();

async function getSpotifyAccessToken() {
  if (!hasSpotifyCredentials) return null;

  const now = Date.now();
  if (spotifyAccessToken && now < spotifyAccessTokenExpiresAt - 60000) {
    return spotifyAccessToken;
  }

  const auth = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString("base64");

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
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

async function findBestSpotifyTrack(title, artist) {
  if (!hasSpotifyCredentials) return null;

  const key = `${title}|||${artist}`;
  if (spotifyCache.has(key)) return spotifyCache.get(key);

  try {
    const token = await getSpotifyAccessToken();
    if (!token) {
      spotifyCache.set(key, null);
      return null;
    }

    const q = `track:${cleanSpotifyText(title)} artist:${cleanSpotifyText(artist)}`;

    const response = await fetch(
      `https://api.spotify.com/v1/search?type=track&limit=10&q=${encodeURIComponent(q)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Spotify search failed (${response.status}): ${body}`);
    }

    const data = await response.json();
    const items = data?.tracks?.items || [];
    const track = items[0] || null;

    if (!track) {
      spotifyCache.set(key, null);
      return null;
    }

    const result = {
      id: track.id,
      url: track.external_urls?.spotify || "",
      embedUrl: `https://open.spotify.com/embed/track/${track.id}`,
      albumImage: track.album?.images?.[0]?.url || ""
    };

    spotifyCache.set(key, result);
    return result;
  } catch (error) {
    console.error("Spotify lookup failed:", error);
    spotifyCache.set(key, null);
    return null;
  }
}

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
    if (!birthday) {
      return res.status(400).json({
        error: "Please provide a valid date in YYYY-MM-DD format."
      });
    }

    const rangeRow = await getDateRange();
    if (!rangeRow?.min_date || !rangeRow?.max_date) {
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

    const birthSpotify = await findBestSpotifyTrack(birthRow.title, birthRow.artist);

    const birthSong = {
      title: birthRow.title,
      artist: birthRow.artist,
      blurb: birthRow.openai_blurb || "",
      blurbStatus: birthRow.blurb_status || "",
      startDate: toIsoDate(new Date(birthRow.was_number_one_from)),
      startDateFormatted: fmtDate(new Date(birthRow.was_number_one_from)),
      spotify: birthSpotify
    };

    const month = birthday.getUTCMonth() + 1;
    const day = birthday.getUTCDate();
    const birthYear = birthday.getUTCFullYear();
    const maxYear = maxDate.getUTCFullYear();

    const yearly = [];
    for (let year = birthYear + 1; year <= maxYear; year += 1) {
      const anniv = safeBirthdayForYear(month, day, year);
      if (!anniv) continue;

      const row = await getSongForDate(anniv);
      if (!row) continue;

      const spotify = await findBestSpotifyTrack(row.title, row.artist);

      yearly.push({
        age: year - birthYear,
        year,
        title: row.title,
        artist: row.artist,
        blurb: row.openai_blurb || "",
        albumImage: spotify?.albumImage || ""
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
