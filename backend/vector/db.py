from contextlib import contextmanager
import os
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[2]

def data_dir() -> Path:
    root = Path(os.environ.get("VECTOR_DATA_DIR", str(ROOT / "data"))).resolve()
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    return root

@contextmanager
def connect():
    connection = sqlite3.connect(data_dir() / "vector.sqlite3", timeout=30)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys=ON")
    connection.execute("PRAGMA busy_timeout=30000")
    try:
        yield connection
        connection.commit()
    except BaseException:
        connection.rollback()
        raise
    finally:
        connection.close()

SCHEMA = """
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS boxes (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, city TEXT NOT NULL,
 type TEXT NOT NULL CHECK(type IN ('official','standard')), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','box_owner','athlete')),
 box_id INTEGER REFERENCES boxes(id), created_at TEXT NOT NULL,
 CHECK(role != 'box_owner' OR box_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS box_single_owner ON users(box_id) WHERE role='box_owner';
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS workouts (
 id INTEGER PRIMARY KEY, title TEXT NOT NULL, track TEXT NOT NULL CHECK(track IN ('forge','apex')),
 scope TEXT NOT NULL CHECK(scope IN ('vector','box')), box_id INTEGER REFERENCES boxes(id),
 scheduled_date TEXT NOT NULL, format TEXT NOT NULL CHECK(format IN ('for_time','amrap','emom','strength')),
 duration_minutes INTEGER NOT NULL CHECK(duration_minutes BETWEEN 1 AND 180),
 level TEXT NOT NULL CHECK(level IN ('all','scaled','rx')), notes TEXT NOT NULL DEFAULT '',
 author_id INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 CHECK((scope='vector' AND box_id IS NULL) OR (scope='box' AND box_id IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS workout_exercises (
 id INTEGER PRIMARY KEY, workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
 position INTEGER NOT NULL, movement TEXT NOT NULL, reps INTEGER NOT NULL CHECK(reps>0),
 load_kg REAL NOT NULL CHECK(load_kg>=0)
);
CREATE TABLE IF NOT EXISTS completions (
 user_id INTEGER REFERENCES users(id), workout_id INTEGER REFERENCES workouts(id),
 completed_at TEXT NOT NULL, PRIMARY KEY(user_id,workout_id)
);
CREATE TABLE IF NOT EXISTS challenges (
 id INTEGER PRIMARY KEY, title TEXT NOT NULL, track TEXT NOT NULL CHECK(track IN ('forge','apex')),
 movement TEXT NOT NULL CHECK(movement='squat'), target_reps INTEGER NOT NULL CHECK(target_reps BETWEEN 1 AND 100),
 opens_at TEXT NOT NULL, closes_at TEXT NOT NULL, description TEXT NOT NULL,
 author_id INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS challenge_boxes (
 challenge_id INTEGER REFERENCES challenges(id), box_id INTEGER REFERENCES boxes(id),
 created_at TEXT NOT NULL, PRIMARY KEY(challenge_id,box_id)
);
CREATE TABLE IF NOT EXISTS submissions (
 id INTEGER PRIMARY KEY, challenge_id INTEGER NOT NULL REFERENCES challenges(id),
 athlete_id INTEGER NOT NULL REFERENCES users(id), box_id INTEGER REFERENCES boxes(id),
 status TEXT NOT NULL CHECK(status IN ('queued','processing','review','approved','rejected','failed')),
 video_path TEXT NOT NULL, reps INTEGER, time_seconds REAL, confidence REAL,
 analysis_note TEXT NOT NULL DEFAULT '', consent_at TEXT NOT NULL,
 reviewer_id INTEGER REFERENCES users(id), review_reason TEXT, reviewed_at TEXT,
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS review_audit (
 id INTEGER PRIMARY KEY, submission_id INTEGER REFERENCES submissions(id), reviewer_id INTEGER REFERENCES users(id),
 decision TEXT NOT NULL, reps INTEGER NOT NULL, time_seconds REAL NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
 id INTEGER PRIMARY KEY, title TEXT NOT NULL, track TEXT NOT NULL CHECK(track IN ('forge','apex','both')),
 city TEXT NOT NULL, date TEXT NOT NULL, brand TEXT NOT NULL CHECK(brand IN ('vector','independent')),
 box_id INTEGER REFERENCES boxes(id), description TEXT NOT NULL, author_id INTEGER REFERENCES users(id), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS event_registrations (
 event_id INTEGER REFERENCES events(id), athlete_id INTEGER REFERENCES users(id),
 created_at TEXT NOT NULL, PRIMARY KEY(event_id,athlete_id)
);
CREATE TABLE IF NOT EXISTS equipment (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL CHECK(category IN ('forge','apex','both')),
 stock INTEGER NOT NULL CHECK(stock>=0), price_cents INTEGER NOT NULL CHECK(price_cents>=0),
 image_key TEXT NOT NULL, description TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rentals (
 id INTEGER PRIMARY KEY, event_id INTEGER NOT NULL REFERENCES events(id), box_id INTEGER NOT NULL REFERENCES boxes(id),
 start_date TEXT NOT NULL, end_date TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','confirmed','declined')),
 total_cents INTEGER NOT NULL, notes TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rental_items (
 rental_id INTEGER REFERENCES rentals(id), equipment_id INTEGER REFERENCES equipment(id),
 quantity INTEGER NOT NULL CHECK(quantity>0), price_cents INTEGER NOT NULL,
 PRIMARY KEY(rental_id,equipment_id)
);
CREATE INDEX IF NOT EXISTS submissions_challenge ON submissions(challenge_id,status);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS rentals_dates ON rentals(status,start_date,end_date);
"""

def init_db():
    with connect() as c:
        c.executescript(SCHEMA)
        c.execute("INSERT OR IGNORE INTO settings VALUES ('schema_version','1')")
    (data_dir() / "videos").mkdir(exist_ok=True, mode=0o700)
