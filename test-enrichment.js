const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function run() {
  const testId = 7255; // replace if you want

  try {
    const result = await pool.query(
      `
      UPDATE number_one_songs
      SET
        chosen_image_url = $1,
        enrichment_status = $2,
        enrichment_source = $3,
        enriched_at = NOW()
      WHERE id = $4
      RETURNING id, title, chosen_image_url, enrichment_status
      `,
      [
        'https://via.placeholder.com/300x300.png?text=Node+Test',
        'complete',
        'test-script',
        testId
      ]
    );

    console.log('Updated row:');
    console.log(result.rows[0]);
  } catch (err) {
    console.error('Error updating row:', err);
  } finally {
    await pool.end();
  }
}

run();
