console.log(process.env.DATABASE_URL);

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
        "img-src": ["'self'", "data:", "https:", "http:"],
        "connect-src": ["'self'", "https:"],
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

function buildFallbackArtwork() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
      <rect width="640" height="640" rx="36" fill="#0b0b0f"/>
      <circle cx="320" cy="320" r="240" fill="#111217"/>
      <circle cx="320" cy="320" r="200" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="2"/>
      <circle cx="320" cy="320" r="165" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="2"/>
      <circle cx="320" cy="320" r="130" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="2"/>
      <circle cx="320" cy="320" r="90" fill="#0a0f1c"/>
      <circle cx="320" cy="320" r="14" fill="#f5f5f5"/>
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function buildSpotifySearchUrl(title, artist) {
  const q = encodeURIComponent(`${title} ${artist}`.trim());
  return `https://open.spotify.com/search/${q}`;
}

function buildAppleMusicSearchUrl(title, artist) {
  const q = encodeURIComponent(`${title} ${artist}`.trim());
  return `https://music.apple.com/us/search?term=${q}`;
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/\b(feat\.?|ft\.?)\b.*$/i, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const hasSpotify =
  Boolean(process.env.SPOTIFY_CLIENT_ID) &&
  Boolean(process.env.SPOTIFY_CLIENT_SECRET);

let spotifyToken = "";
let spotifyExpiresAt = 0;

async function getSpotifyToken() {
  if (!hasSpotify) return null;

  const now = Date.now();
  if (spotifyToken && now < spotifyExpiresAt - 60000) {
    return spotifyToken;
  }

  const auth = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString("base64");

  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: "grant_type=client_credentials"
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Spotify token request failed:", res.status, text);
      return null;
    }

    const data = await res.json();
    spotifyToken = data.access_token || "";
    spotifyExpiresAt = now + Number(data.expires_in || 3600) * 1000;

    return spotifyToken || null;
  } catch (error) {
    console.error("Spotify token failed:", error);
    return null;
  }
}

async function spotifyFetchJson(url, token) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Spotify request failed:", res.status, text);
    return null;
  }

  return res.json();
}

function scoreSpotifyTrack(track, wantedTitle, wantedArtist) {
  const trackName = normalizeName(track?.name);
  const artistNames = (track?.artists || []).map((a) => normalizeName(a?.name)).join(" ");
  const normTitle = normalizeName(wantedTitle);
  const normArtist = normalizeName(wantedArtist);

  let score = 0;
  if (trackName === normTitle) score += 6;
  if (trackName.includes(normTitle)) score += 3;
  if (artistNames.includes(normArtist)) score += 5;

  return score;
}

async function getSpotifyArtistImageById(artistId, token) {
  try {
    if (!artistId || !token) return null;
    const data = await spotifyFetchJson(`https://api.spotify.com/v1/artists/${artistId}`, token);
    return data?.images?.[0]?.url || null;
  } catch (error) {
    console.error("Spotify artist-by-id lookup failed:", error);
    return null;
  }
}

async function searchSpotifyArtistImage(artistName, token) {
  try {
    if (!artistName || !token) return null;
    const q = encodeURIComponent(String(artistName).trim());
    const data = await spotifyFetchJson(
      `https://api.spotify.com/v1/search?q=${q}&type=artist&limit=5`,
      token
    );
    const items = data?.artists?.items || [];
    if (!items.length) return null;

    const wanted = normalizeName(artistName);
    items.sort((a, b) => {
      const aName = normalizeName(a?.name);
      const bName = normalizeName(b?.name);
      const aScore = (aName === wanted ? 10 : aName.includes(wanted) ? 5 : 0);
      const bScore = (bName === wanted ? 10 : bName.includes(wanted) ? 5 : 0);
      return bScore - aScore;
    });

    return items[0]?.images?.[0]?.url || null;
  } catch (error) {
    console.error("Spotify artist image lookup failed:", error);
    return null;
  }
}

async function getWikipediaArtistImage(artistName) {
  try {
    if (!artistName) return null;

    const searchUrl =
      `https://en.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(artistName)}&limit=5`;

    const searchRes = await fetch(searchUrl, {
      headers: {
        "User-Agent": "LifeTracks/1.0 (artist image lookup)"
      }
    });

    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const pages = searchData?.pages || [];
    if (!pages.length) return null;

    const wanted = normalizeName(artistName);

    pages.sort((a, b) => {
      const aTitle = normalizeName(a?.title);
      const bTitle = normalizeName(b?.title);
      const aScore = (aTitle === wanted ? 10 : aTitle.includes(wanted) ? 5 : 0);
      const bScore = (bTitle === wanted ? 10 : bTitle.includes(wanted) ? 5 : 0);
      return bScore - aScore;
    });

    const bestTitle = pages[0]?.title;
    if (!bestTitle) return null;

    const summaryUrl =
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(bestTitle)}`;

    const summaryRes = await fetch(summaryUrl, {
      headers: {
        "User-Agent": "LifeTracks/1.0 (artist image lookup)"
      }
    });

    if (!summaryRes.ok) return null;
    const summaryData = await summaryRes.json();

    return (
      summaryData?.originalimage?.source ||
      summaryData?.thumbnail?.source ||
      null
    );
  } catch (error) {
    console.error("Wikipedia artist image lookup failed:", error);
    return null;
  }
}

async function getArtworkAndLinks(title, artist) {
  const fallbackSpotifyUrl = buildSpotifySearchUrl(title, artist);
  const fallbackAppleUrl = buildAppleMusicSearchUrl(title, artist);

  try {
    const token = await getSpotifyToken();
    if (!token) {
      const webArtistImage = await getWikipediaArtistImage(artist);
      return {
        albumImage: webArtistImage || buildFallbackArtwork(),
        spotifyUrl: fallbackSpotifyUrl,
        appleMusicUrl: fallbackAppleUrl,
        embedUrl: null
      };
    }

    const q = encodeURIComponent(`${title} ${artist}`.trim());
    const trackData = await spotifyFetchJson(
      `https://api.spotify.com/v1/search?q=${q}&type=track&limit=10`,
      token
    );

    const tracks = trackData?.tracks?.items || [];
    let bestTrack = null;

    if (tracks.length) {
      tracks.sort((a, b) => scoreSpotifyTrack(b, title, artist) - scoreSpotifyTrack(a, title, artist));
      bestTrack = tracks[0];
    }

    if (bestTrack) {
      const albumImage = bestTrack?.album?.images?.[0]?.url || null;
      let artistImage = null;

      if (!albumImage) {
        artistImage =
          await getSpotifyArtistImageById(bestTrack?.artists?.[0]?.id, token) ||
          await searchSpotifyArtistImage(artist, token);
      }

      const webArtistImage =
        !albumImage && !artistImage
          ? await getWikipediaArtistImage(artist)
          : null;

      return {
        albumImage: albumImage || artistImage || webArtistImage || buildFallbackArtwork(),
        spotifyUrl: bestTrack?.external_urls?.spotify || fallbackSpotifyUrl,
        appleMusicUrl: fallbackAppleUrl,
        embedUrl: bestTrack?.id ? `https://open.spotify.com/embed/track/${bestTrack.id}` : null
      };
    }

    const spotifyArtistImage = await searchSpotifyArtistImage(artist, token);
    const webArtistImage = spotifyArtistImage ? null : await getWikipediaArtistImage(artist);

    return {
      albumImage: spotifyArtistImage || webArtistImage || buildFallbackArtwork(),
      spotifyUrl: fallbackSpotifyUrl,
      appleMusicUrl: fallbackAppleUrl,
      embedUrl: null
    };
  } catch (error) {
    console.error("Artwork lookup failed:", error);

    const webArtistImage = await getWikipediaArtistImage(artist).catch(() => null);

    return {
      albumImage: webArtistImage || buildFallbackArtwork(),
      spotifyUrl: fallbackSpotifyUrl,
      appleMusicUrl: fallbackAppleUrl,
      embedUrl: null
    };
  }
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

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
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

    const birthArtwork = await getArtworkAndLinks(birthRow.title, birthRow.artist);

    const birthSong = {
      title: birthRow.title,
      artist: birthRow.artist,
      blurb: birthRow.openai_blurb || "",
      blurbStatus: birthRow.blurb_status || "",
      startDate: toIsoDate(new Date(birthRow.was_number_one_from)),
      startDateFormatted: fmtDate(new Date(birthRow.was_number_one_from)),
      albumImage: birthArtwork.albumImage,
      spotify: birthArtwork.embedUrl
        ? {
            url: birthArtwork.spotifyUrl,
            embedUrl: birthArtwork.embedUrl
          }
        : null,
      spotifyUrl: birthArtwork.spotifyUrl,
      appleMusicUrl: birthArtwork.appleMusicUrl
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

      const artwork = await getArtworkAndLinks(row.title, row.artist);

      yearly.push({
        age: year - birthYear,
        year,
        title: row.title,
        artist: row.artist,
        blurb: row.openai_blurb || "",
        albumImage: artwork.albumImage,
        spotifyUrl: artwork.spotifyUrl,
        appleMusicUrl: artwork.appleMusicUrl
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
    console.error("Birthday route failed:", error);
    return res.status(500).json({
      error: "Something went wrong while loading the chart data.",
      detail: error.message
    });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Life Tracks listening on port ${PORT}`);
});
