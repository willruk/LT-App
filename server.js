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
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
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
        "img-src": ["'self'", "data:"],
        "connect-src": ["'self'"],
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;
  const date = new Date(`${input}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function fmtDate(date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function safeBirthdayForYear(month, day, year) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

async function getChartRows() {
  const sql = `
    SELECT
      was_number_one_from,
      EXTRACT(YEAR FROM was_number_one_from)::int AS year,
      artist,
      title,
      openai_blurb,
      blurb_status
    FROM number_one_songs
    WHERE was_number_one_from IS NOT NULL
      AND COALESCE(artist, '') <> ''
      AND COALESCE(title, '') <> ''
    ORDER BY was_number_one_from ASC
  `;

  const { rows } = await pool.query(sql);
  return rows.map((row) => ({
    date: row.was_number_one_from.toISOString().slice(0, 10),
    start: new Date(row.was_number_one_from),
    year: row.year,
    artist: row.artist,
    title: row.title,
    openai_blurb: row.openai_blurb || "",
    blurb_status: row.blurb_status || ""
  }));
}

function findSongForDate(parsed, target) {
  for (let i = 0; i < parsed.length; i += 1) {
    const start = parsed[i].start;
    const nextStart = i < parsed.length - 1 ? parsed[i + 1].start : null;
    if (target >= start && (!nextStart || target < nextStart)) {
      return { song: parsed[i], index: i };
    }
  }
  return null;
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
      return res.status(400).json({ error: "Please provide a valid date in YYYY-MM-DD format." });
    }

    const parsed = await getChartRows();
    if (!parsed.length) {
      return res.status(500).json({ error: "No chart data found in the database." });
    }

    const minDate = parsed[0].start;
    const maxDate = parsed[parsed.length - 1].start;

    if (birthday < minDate || birthday > maxDate) {
      return res.status(400).json({
        error: `That date is outside the available chart data. Range: ${fmtDate(minDate)} to ${fmtDate(maxDate)}.`
      });
    }

    const birthMatch = findSongForDate(parsed, birthday);
    if (!birthMatch) {
      return res.status(404).json({ error: "No chart entry was found for that date." });
    }

    const nextBirthSong = birthMatch.index < parsed.length - 1 ? parsed[birthMatch.index + 1] : null;
    const birthEnd = nextBirthSong ? addDays(nextBirthSong.start, -1) : null;

    const birthSong = {
      title: birthMatch.song.title,
      artist: birthMatch.song.artist,
      blurb: birthMatch.song.openai_blurb || "",
      blurbStatus: birthMatch.song.blurb_status || "",
      startDate: toIsoDate(birthMatch.song.start),
      startDateFormatted: fmtDate(birthMatch.song.start),
      endDate: birthEnd ? toIsoDate(birthEnd) : null,
      endDateFormatted: birthEnd ? fmtDate(birthEnd) : null
    };

    const month = birthday.getUTCMonth() + 1;
    const day = birthday.getUTCDate();
    const birthYear = birthday.getUTCFullYear();
    const maxYear = parsed[parsed.length - 1].year;

    const yearly = [];
    for (let year = birthYear + 1; year <= maxYear; year += 1) {
      const anniv = safeBirthdayForYear(month, day, year);
      if (!anniv) continue;
      const match = findSongForDate(parsed, anniv);
      if (!match) continue;
      yearly.push({
        age: year - birthYear,
        year,
        title: match.song.title,
        artist: match.song.artist
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
    return res.status(500).json({ error: "Something went wrong while loading the chart data." });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Tracks of My Years listening on port ${PORT}`);
});
