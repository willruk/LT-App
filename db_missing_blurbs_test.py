from pathlib import Path
import os

from dotenv import load_dotenv
import psycopg2


# -------------------------
# CONFIG
# -------------------------
BASE_DIR = Path(__file__).resolve().parent
ENV_FILE = BASE_DIR / ".env"

TEST_LIMIT = 5

load_dotenv(ENV_FILE)


def get_connection():
    database_url = os.getenv("DATABASE_URL")

    if not database_url:
        raise ValueError("DATABASE_URL not found in .env file")

    return psycopg2.connect(database_url)


def main():
    conn = None

    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute(
            """
            SELECT id, was_number_one_from, artist, title
            FROM number_one_songs
            WHERE openai_blurb IS NULL
               OR TRIM(openai_blurb) = ''
            ORDER BY was_number_one_from ASC
            LIMIT %s;
            """,
            (TEST_LIMIT,)
        )

        rows = cur.fetchall()

        print(f"Found {len(rows)} row(s):")
        print()

        for row in rows:
            row_id, was_number_one_from, artist, title = row
            print(f"ID: {row_id}")
            print(f"Date: {was_number_one_from}")
            print(f"Artist: {artist}")
            print(f"Title: {title}")
            print("-" * 40)

        cur.close()

    except Exception as e:
        print(f"ERROR: {e}")

    finally:
        if conn is not None:
            conn.close()


if __name__ == "__main__":
    main()
