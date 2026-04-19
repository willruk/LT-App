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
    contentSecurityPolicy: false,
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

/* 👇 ADD THIS HERE */

function escapeSvgText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildFallbackArtwork(title, artist) {
  const safeTitle = escapeSvgText(title).slice(0, 28);
  const safeArtist = escapeSvgText(artist).slice(0, 32);

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="640">
      <rect width="100%" height="100%" fill="#0b0b0f"/>
      <circle cx="320" cy="320" r="240" fill="#111"/>
      <circle cx="320" cy="320" r="100" fill="#ff3be2"/>
      <text x="320" y="300" text-anchor="middle" fill="#111">${safeTitle}</text>
      <text x="320" y="330" text-anchor="middle" fill="#111">${safeArtist}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
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

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, stage: "birthday-route-test" });
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

    const birthSong = {
      title: birthRow.title,
      artist: birthRow.artist,
      blurb: birthRow.openai_blurb || "",
      blurbStatus: birthRow.blurb_status || "",
      startDate: toIsoDate(new Date(birthRow.was_number_one_from)),
      startDateFormatted: fmtDate(new Date(birthRow.was_number_one_from))
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

      yearly.push({
        age: year - birthYear,
        year,
        title: row.title,
        artist: row.artist,
        blurb: row.openai_blurb || "",
        albumImage: buildFallbackArtwork(row.title, row.artist)
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
  console.log(`Birthday route test listening on port ${PORT}`);
});
