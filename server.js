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
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function toIsoDate(d) {
  return d.toISOString().slice(0, 10);
}

function fmtDate(date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

function parseBirthday(input) {
  const d = new Date(`${input}T00:00:00Z`);
  return isNaN(d) ? null : d;
}

function safeBirthdayForYear(month, day, year) {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCMonth() === month - 1 ? d : null;
}

/* ---------------- DATABASE ---------------- */

async function getSongForDate(date) {
  const { rows } = await pool.query(`
    SELECT * FROM number_one_songs
    WHERE was_number_one_from <= $1
    ORDER BY was_number_one_from DESC
    LIMIT 1
  `, [toIsoDate(date)]);
  return rows[0];
}

async function getDateRange() {
  const { rows } = await pool.query(`
    SELECT MIN(was_number_one_from) AS min, MAX(was_number_one_from) AS max
    FROM number_one_songs
  `);
  return rows[0];
}

/* ---------------- SPOTIFY ---------------- */

let cachedToken = null;
let tokenExpiry = 0;

async function getSpotifyToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Authorization": "Basic " + Buffer.from(
        process.env.SPOTIFY_CLIENT_ID + ":" + process.env.SPOTIFY_CLIENT_SECRET
      ).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000);

  return cachedToken;
}

function clean(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9\s']/g, "")
    .trim();
}

function score(title, artist, track) {
  const t = clean(track.name);
  const a = clean(track.artists.map(x => x.name).join(" "));

  let s = 0;
  if (t.includes(clean(title))) s += 2;
  if (a.includes(clean(artist))) s += 2;

  if (/live|remix|edit|version/.test(t)) s -= 1;

  return s;
}

async function findSpotify(title, artist) {
  const token = await getSpotifyToken();

  const q = `track:${clean(title)} artist:${clean(artist)}`;

  const res = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=10`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const data = await res.json();
  let best = null;
  let bestScore = -999;

  for (const t of data.tracks.items) {
    const s = score(title, artist, t);
    if (s > bestScore) {
      bestScore = s;
      best = t;
    }
  }

  if (!best || bestScore < 2) return null;

  return {
    embed: `https://open.spotify.com/embed/track/${best.id}`,
    url: best.external_urls.spotify
  };
}

/* ---------------- API ---------------- */

app.get("/api/birthday", async (req, res) => {
  const birthday = parseBirthday(req.query.date);
  if (!birthday) return res.status(400).json({ error: "Invalid date" });

  const range = await getDateRange();
  const min = new Date(range.min);
  const max = new Date(range.max);

  if (birthday < min || birthday > max) {
    return res.json({ error: "Out of range" });
  }

  const birthRow = await getSongForDate(birthday);

  const spotify = await findSpotify(birthRow.title, birthRow.artist);

  const birthSong = {
    title: birthRow.title,
    artist: birthRow.artist,
    startDateFormatted: fmtDate(new Date(birthRow.was_number_one_from)),
    spotify
  };

  const yearly = [];
  const month = birthday.getUTCMonth() + 1;
  const day = birthday.getUTCDate();
  const birthYear = birthday.getUTCFullYear();

  for (let y = birthYear + 1; y <= max.getUTCFullYear(); y++) {
    const d = safeBirthdayForYear(month, day, y);
    if (!d) continue;
    const row = await getSongForDate(d);
    yearly.push({
      age: y - birthYear,
      year: y,
      title: row.title,
      artist: row.artist
    });
  }

  res.json({ birthSong, yearly, range });
});

app.get("*", (_, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html"))
);

app.listen(PORT, () => console.log("Server running"));
