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

  const { rows } = await pool.query(sql, [toIsoDate(targetDate)]);
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
    throw new Error(`Spotify token request
