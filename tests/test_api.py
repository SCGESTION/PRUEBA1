"""Integration checks for Vector's roles, persistent data and competition rules.

Every result entering the leaderboard goes through the authenticated human
review endpoint. Tests never manufacture approved AI scores in the database.
"""

from contextlib import ExitStack
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
import sqlite3
from threading import Barrier
import time

from fastapi.testclient import TestClient
import pytest


PASSWORD = "VectorDemo2026!"
# An ISO-BMFF MP4 signature. No pose runtime is configured during these tests;
# accepted uploads must remain provisional and require a real human review.
MP4 = b"\x00\x00\x00\x18ftypisom\x00\x00\x02\x00isomiso2" + b"\x00" * 128
ACCOUNTS = {
    "admin": "admin@vector.local",
    "official": "forge@vector.local",
    "standard": "norte@vector.local",
    "athlete": "atleta@vector.local",
    "free": "libre@vector.local",
}


@pytest.fixture
def database(tmp_path, monkeypatch):
    monkeypatch.setenv("VECTOR_DATA_DIR", str(tmp_path / "vector-data"))
    monkeypatch.delenv("VECTOR_POSE_MODEL", raising=False)
    from vector.db import init_db
    from vector.seed import seed_demo

    init_db()
    seed_demo()
    return tmp_path / "vector-data"


@pytest.fixture
def clients(database):
    from vector.app import app

    with ExitStack() as stack:
        public = stack.enter_context(TestClient(app))
        result = {"public": public}
        for role, email in ACCOUNTS.items():
            client = TestClient(app)
            stack.callback(client.close)
            response = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
            assert response.status_code == 200, response.text
            result[role] = client
        yield result


def successful(response):
    assert response.status_code in (200, 201, 202), response.text
    return response.json()


def user(client):
    return successful(client.get("/api/bootstrap"))["user"]


def challenge(clients, *, offset_days=0, target_reps=30):
    now = datetime.now(timezone.utc) + timedelta(days=offset_days)
    return successful(clients["admin"].post("/api/challenges", json={
        "title": "30 sentadillas · prueba", "track": "forge", "movement": "squat",
        "target_reps": target_reps, "opens_at": (now - timedelta(hours=1)).isoformat(),
        "closes_at": (now + timedelta(days=2)).isoformat(),
        "description": "Completar el objetivo con extensión y profundidad válidas.",
    }))


def event(client, *, brand="independent", title="Vector test event", offset_days=10):
    return successful(client.post("/api/events", json={
        "title": title, "track": "both", "city": "Madrid", "brand": brand,
        "date": (date.today() + timedelta(days=offset_days)).isoformat(),
        "description": "Prueba presencial de CrossFit y competición híbrida.",
    }))


def workout(client, *, scope="vector", title="Entrenamiento de prueba", box_id=None):
    payload = {
        "title": title, "track": "forge", "scope": scope,
        "scheduled_date": date.today().isoformat(), "format": "for_time",
        "duration_minutes": 8, "level": "all", "notes": "Técnica antes que velocidad.",
        "exercises": [{"movement": "squat", "reps": 30, "load_kg": 0}],
    }
    if box_id is not None:
        payload["box_id"] = box_id
    return client.post("/api/workouts", json=payload)


def upload(client, challenge_id, *, data=MP4, consent="true", filename="squats.mp4", mime="video/mp4"):
    fields = {} if consent is None else {"consent": consent}
    return client.post(f"/api/challenges/{challenge_id}/submissions", data=fields,
                       files={"video": (filename, data, mime)})


def reviewed_submission(clients, challenge_id, *, actor="free", seconds=25):
    submission = successful(upload(clients[actor], challenge_id))
    # Wait for the independent worker to finish before the human decision.
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        submission = successful(clients[actor].get(f"/api/submissions/{submission['id']}"))
        if submission["status"] not in ("queued", "processing"):
            break
        time.sleep(0.02)
    assert submission["status"] == "review", submission
    assert submission["reps"] in (None, 0), "Missing Pose runtime must never invent a score"
    return successful(clients["admin"].post(f"/api/submissions/{submission['id']}/review", json={
        "decision": "approved", "reps": 30, "time_seconds": seconds,
        "reason": "Juez humano: 30 repeticiones completas verificadas en el vídeo.",
    }))


def rental(client, event_id, equipment_id, quantity, start_date, end_date=None):
    return client.post("/api/rentals", json={
        "event_id": event_id, "start_date": start_date.isoformat(),
        "end_date": (end_date or start_date).isoformat(), "notes": "Recogida en almacén.",
        "items": [{"equipment_id": equipment_id, "quantity": quantity}],
    })


def test_public_catalogue_and_authenticated_boundaries(clients):
    public = clients["public"]
    bootstrap = successful(public.get("/api/bootstrap"))
    assert bootstrap["demo"] is True
    assert bootstrap["user"] is None
    assert {track["id"] for track in bootstrap["tracks"]} == {"forge", "apex"}
    for route in ("/api/health", "/api/boxes"):
        assert public.get(route).status_code == 200, route
    for route in ("/api/workouts", "/api/challenges", "/api/events", "/api/equipment"):
        assert clients["athlete"].get(route).status_code == 200, route
        assert public.get(route).status_code == 401, route
    for route in ("/api/dashboard", "/api/submissions", "/api/rentals", "/api/admin/overview"):
        assert public.get(route).status_code == 401, route
    assert workout(public).status_code == 401
    health = successful(public.get("/api/health"))
    assert health["database"] == "ok"
    assert health["ai"]["available"] is False
    for item in successful(clients["athlete"].get("/api/challenges")):
        assert public.get(f"/api/challenges/{item['id']}/leaderboard").status_code == 401
        assert successful(clients["athlete"].get(f"/api/challenges/{item['id']}/leaderboard"))["athletes"] == []


def test_cross_origin_writes_are_rejected_and_session_is_private(clients):
    admin = clients["admin"]
    before = len(successful(admin.get("/api/workouts")))
    payload = {
        "title": "Entrenamiento desde otro origen", "track": "forge", "scope": "vector",
        "scheduled_date": date.today().isoformat(), "format": "for_time", "duration_minutes": 10,
        "level": "all", "notes": "", "exercises": [{"movement": "squat", "reps": 30, "load_kg": 0}],
    }
    response = admin.post("/api/workouts", json=payload, headers={"Origin": "https://untrusted.example"})
    assert response.status_code == 403
    assert len(successful(admin.get("/api/workouts"))) == before
    successful(admin.post("/api/workouts", json=payload, headers={"Origin": "http://localhost:5173"}))
    login = clients["public"].post("/api/auth/login", json={"email": ACCOUNTS["free"], "password": PASSWORD})
    assert login.status_code == 200
    assert "httponly" in login.headers["set-cookie"].lower()
    assert "samesite=lax" in login.headers["set-cookie"].lower()
    assert login.headers["cache-control"] == "no-store"
    invalid = clients["public"].post("/api/auth/login", json={
        "email": ACCOUNTS["free"], "password": "NeverEchoThisSecret" * 10,
    })
    assert invalid.status_code == 422
    assert "NeverEchoThisSecret" not in invalid.text


def test_session_logout_expiry_and_no_role_forgery(clients):
    athlete = clients["athlete"]
    assert user(athlete)["role"] == "athlete"
    assert athlete.get("/api/admin/overview").status_code == 403
    assert workout(athlete).status_code == 403
    assert clients["public"].get("/api/admin/overview", headers={"X-Vector-Role": "admin"}).status_code == 401
    assert clients["public"].post("/api/auth/login", json={"email": ACCOUNTS["admin"], "password": "incorrect"}).status_code == 401
    registered = successful(clients["public"].post("/api/auth/register", json={
        "name": "Nueva atleta", "email": "new@vector.test", "password": "SafePassword2026!", "box_id": None,
    }))
    assert registered["role"] == "athlete"
    assert registered["box_id"] is None
    assert clients["public"].get("/api/admin/overview").status_code == 403
    forge = clients["standard"].post("/api/auth/register", json={
        "name": "Forged administrator", "email": "forged@vector.test", "password": PASSWORD,
        "box_id": None, "role": "admin",
    })
    assert forge.status_code == 422
    successful(athlete.post("/api/auth/logout"))
    assert user(athlete) is None
    assert athlete.post("/api/events/1/register", json={}).status_code == 401
    # An expired cookie must not authorize requests after a database restart.
    from vector.db import connect
    from vector.security import token_hash
    token = clients["free"].cookies.get("vector_session")
    assert token
    with connect() as connection:
        connection.execute("UPDATE sessions SET expires_at=0 WHERE token_hash=?", (token_hash(token),))
    assert clients["free"].get("/api/submissions").status_code == 401


def test_box_brand_policy_and_changed_membership_permissions(clients):
    official = event(clients["official"], brand="vector")
    assert official["box_id"] == user(clients["official"])["box_id"]
    assert official["brand"] == "vector"
    denied = clients["standard"].post("/api/events", json={
        "title": "Uso indebido de marca", "track": "forge", "city": "Bilbao",
        "date": (date.today() + timedelta(days=10)).isoformat(), "brand": "vector", "description": "",
    })
    assert denied.status_code == 403
    independent = event(clients["standard"])
    assert independent["brand"] == "independent"
    assert clients["athlete"].post("/api/events", json={
        "title": "Sin permiso", "track": "forge", "city": "Madrid",
        "date": date.today().isoformat(), "brand": "independent", "description": "",
    }).status_code == 403
    box_id = user(clients["official"])["box_id"]
    successful(clients["admin"].patch(f"/api/boxes/{box_id}", json={"type": "standard"}))
    assert user(clients["official"])["box_type"] == "standard"
    denied_again = clients["official"].post("/api/events", json={
        "title": "Marca después de la baja", "track": "both", "city": "Madrid",
        "date": date.today().isoformat(), "brand": "vector", "description": "",
    })
    assert denied_again.status_code == 403


def test_admin_creates_box_and_owner_atomically(clients):
    admin = clients["admin"]
    initial = len(successful(admin.get("/api/boxes")))
    payload = {"name": "Vector Sur", "city": "Málaga", "type": "official", "owner_name": "Dueña Sur",
               "owner_email": "sur@vector.test", "owner_password": "SafePassword2026!"}
    created = successful(admin.post("/api/boxes", json=payload))
    assert created["type"] == "official"
    assert len(successful(admin.get("/api/boxes"))) == initial + 1
    owner = successful(clients["public"].post("/api/auth/login", json={
        "email": payload["owner_email"], "password": payload["owner_password"],
    }))
    assert owner["role"] == "box_owner"
    assert owner["box_id"] == created["id"]
    duplicate = admin.post("/api/boxes", json={**payload, "name": "Box que no debe quedar huérfano"})
    assert duplicate.status_code in (400, 409)
    assert len(successful(admin.get("/api/boxes"))) == initial + 1
    assert clients["athlete"].patch(f"/api/boxes/{created['id']}", json={"type": "standard"}).status_code == 403


def test_private_box_workouts_and_server_owned_author_fields(clients):
    vector = successful(workout(clients["admin"]))
    own = successful(workout(clients["official"], scope="box", title="Sesión privada de Forge"))
    own_box_id = user(clients["official"])["box_id"]
    foreign_box_id = user(clients["standard"])["box_id"]
    assert own["box_id"] == own_box_id
    assert vector["scope"] == "vector" and vector["box_id"] is None
    for actor in ("free", "standard"):
        ids = {row["id"] for row in successful(clients[actor].get("/api/workouts"))}
        assert vector["id"] in ids
        assert own["id"] not in ids
    for actor in ("athlete", "official", "admin"):
        assert own["id"] in {row["id"] for row in successful(clients[actor].get("/api/workouts"))}
    forged = workout(clients["official"], scope="box", box_id=foreign_box_id)
    if forged.status_code in (200, 201):
        assert forged.json()["box_id"] == own_box_id
    else:
        assert forged.status_code in (400, 403, 422)
    assert workout(clients["official"], scope="vector").status_code == 403
    assert clients["free"].post(f"/api/workouts/{own['id']}/complete", json={}).status_code in (403, 404)
    assert all(row["track"] == "forge" for row in successful(clients["athlete"].get("/api/workouts?track=forge")))


def test_challenge_enrollment_dates_and_free_athlete_submission(clients):
    created = challenge(clients)
    challenge_id = created["id"]
    assert upload(clients["athlete"], challenge_id).status_code == 403
    assert clients["athlete"].post(f"/api/challenges/{challenge_id}/enroll", json={}).status_code == 403
    successful(clients["official"].post(f"/api/challenges/{challenge_id}/enroll", json={}))
    successful(clients["official"].post(f"/api/challenges/{challenge_id}/enroll", json={}))
    mine = next(item for item in successful(clients["official"].get("/api/challenges")) if item["id"] == challenge_id)
    assert mine["enrolled"] is True
    assert mine["box_count"] == 1
    associated = successful(upload(clients["athlete"], challenge_id))
    assert associated["box_name"] == user(clients["athlete"])["box_name"]
    free = successful(upload(clients["free"], challenge_id))
    assert free["box_name"] is None
    future = challenge(clients, offset_days=10)
    successful(clients["standard"].post(f"/api/challenges/{future['id']}/enroll", json={}))
    assert upload(clients["free"], future["id"]).status_code in (400, 409)
    closed = challenge(clients, offset_days=-10)
    assert clients["standard"].post(f"/api/challenges/{closed['id']}/enroll", json={}).status_code in (400, 409)
    assert upload(clients["free"], closed["id"]).status_code in (400, 409)


def test_upload_validation_consent_signature_and_size(clients, monkeypatch, database):
    created = challenge(clients)
    challenge_id = created["id"]
    free = clients["free"]
    before = len(successful(free.get("/api/submissions")))
    for consent in (None, "false"):
        assert upload(free, challenge_id, consent=consent).status_code in (400, 422)
    assert upload(free, challenge_id, data=b"not an mp4", filename="video.mp4").status_code in (400, 415, 422)
    assert upload(free, challenge_id, filename="malware.exe", mime="application/octet-stream").status_code in (400, 415, 422)
    from vector import app as app_module
    # Exercise the actual streaming size check with a small deterministic cap.
    monkeypatch.setattr(app_module, "MAX_VIDEO_BYTES", 1024)
    assert upload(free, challenge_id, data=MP4 + b"x" * 2048).status_code == 413
    assert len(successful(free.get("/api/submissions"))) == before
    assert list((database / "videos").iterdir()) == []


def test_submission_and_video_ownership_isolation(clients):
    created = challenge(clients)
    successful(clients["official"].post(f"/api/challenges/{created['id']}/enroll", json={}))
    own = successful(upload(clients["athlete"], created["id"]))
    free = successful(upload(clients["free"], created["id"]))
    for actor in ("athlete", "official", "admin"):
        response = clients[actor].get(f"/api/submissions/{own['id']}/video")
        assert response.status_code == 200, response.text
        assert response.content == MP4
        assert own["id"] in {item["id"] for item in successful(clients[actor].get("/api/submissions"))}
    for actor in ("free", "standard"):
        assert clients[actor].get(f"/api/submissions/{own['id']}").status_code in (403, 404)
        assert clients[actor].get(f"/api/submissions/{own['id']}/video").status_code in (403, 404)
        assert own["id"] not in {item["id"] for item in successful(clients[actor].get("/api/submissions"))}
    assert clients["official"].get(f"/api/submissions/{free['id']}/video").status_code in (403, 404)
    assert clients["public"].get(f"/api/submissions/{own['id']}/video").status_code == 401


def test_only_reviewed_best_results_enter_athlete_and_box_rankings(clients):
    created = challenge(clients)
    challenge_id = created["id"]
    successful(clients["official"].post(f"/api/challenges/{challenge_id}/enroll", json={}))
    slow = reviewed_submission(clients, challenge_id, seconds=31)
    fast = reviewed_submission(clients, challenge_id, seconds=22)
    box_result = reviewed_submission(clients, challenge_id, actor="athlete", seconds=27)
    provisional = successful(upload(clients["free"], challenge_id))
    leaderboard = successful(clients["athlete"].get(f"/api/challenges/{challenge_id}/leaderboard"))
    assert [row["time_seconds"] for row in leaderboard["athletes"]] == [22, 27]
    assert [row["rank"] for row in leaderboard["athletes"]] == [1, 2]
    assert {row["submission_id"] for row in leaderboard["athletes"]} == {fast["id"], box_result["id"]}
    assert slow["id"] not in {row["submission_id"] for row in leaderboard["athletes"]}
    assert provisional["id"] not in {row["submission_id"] for row in leaderboard["athletes"]}
    assert len(leaderboard["boxes"]) == 1
    assert leaderboard["boxes"][0]["athletes"] == 1
    assert leaderboard["boxes"][0]["best_seconds"] == 27


def test_review_requires_admin_valid_target_time_and_reason(clients):
    created = challenge(clients)
    submission = successful(upload(clients["free"], created["id"]))
    endpoint = f"/api/submissions/{submission['id']}/review"
    review = {"decision": "approved", "reps": 30, "time_seconds": 20, "reason": "Revisado por juez humano."}
    assert clients["free"].post(endpoint, json=review).status_code == 403
    assert clients["official"].post(endpoint, json=review).status_code == 403
    for invalid in ({"reps": 29}, {"time_seconds": 0}, {"time_seconds": -1}, {"reason": ""}, {"decision": "queued"}):
        assert clients["admin"].post(endpoint, json={**review, **invalid}).status_code in (400, 422)
    assert successful(clients["free"].get(f"/api/challenges/{created['id']}/leaderboard"))["athletes"] == []
    successful(clients["admin"].post(endpoint, json={**review, "decision": "rejected", "reps": 12}))
    assert successful(clients["free"].get(f"/api/submissions/{submission['id']}"))["status"] == "rejected"
    assert successful(clients["free"].get(f"/api/challenges/{created['id']}/leaderboard"))["athletes"] == []
    from vector.db import connect
    with connect() as connection:
        audit = connection.execute("SELECT decision,reason FROM review_audit WHERE submission_id=?", (submission["id"],)).fetchall()
    assert len(audit) == 1
    assert audit[0]["decision"] == "rejected"
    assert audit[0]["reason"] == review["reason"]


def test_rental_confirmation_checks_overlap_without_partial_mutation(clients):
    first_event = event(clients["official"], title="Primera competición")
    second_event = event(clients["standard"], title="Segunda competición", offset_days=11)
    later_event = event(clients["standard"], title="Competición posterior", offset_days=12)
    equipment = next(item for item in successful(clients["official"].get("/api/equipment")) if item["stock"] > 0)
    start = date.today() + timedelta(days=10)
    end = start + timedelta(days=1)
    first = successful(rental(clients["official"], first_event["id"], equipment["id"], equipment["stock"], start, end))
    second = successful(rental(clients["standard"], second_event["id"], equipment["id"], equipment["stock"], end))
    assert first["status"] == second["status"] == "pending"
    assert first["total"] == pytest.approx(equipment["price_per_day"] * equipment["stock"] * 2)
    assert clients["official"].post(f"/api/rentals/{first['id']}/status", json={"status": "confirmed"}).status_code == 403
    successful(clients["admin"].post(f"/api/rentals/{first['id']}/status", json={"status": "confirmed"}))
    assert clients["admin"].post(f"/api/rentals/{second['id']}/status", json={"status": "confirmed"}).status_code == 409
    remaining = next(item for item in successful(clients["standard"].get("/api/rentals")) if item["id"] == second["id"])
    assert remaining["status"] == "pending"
    later = successful(rental(clients["standard"], later_event["id"], equipment["id"], equipment["stock"], end + timedelta(days=1)))
    successful(clients["admin"].post(f"/api/rentals/{later['id']}/status", json={"status": "confirmed"}))
    successful(clients["admin"].post(f"/api/rentals/{second['id']}/status", json={"status": "declined"}))


def test_concurrent_confirmations_cannot_oversell_stock(clients):
    first_event = event(clients["official"], title="Competición simultánea oficial")
    second_event = event(clients["standard"], title="Competición simultánea independiente")
    equipment = next(item for item in successful(clients["official"].get("/api/equipment")) if item["stock"] > 0)
    when = date.today() + timedelta(days=10)
    requests = [
        successful(rental(clients["official"], first_event["id"], equipment["id"], equipment["stock"], when)),
        successful(rental(clients["standard"], second_event["id"], equipment["id"], equipment["stock"], when)),
    ]
    token = clients["admin"].cookies.get("vector_session")
    barrier = Barrier(2)
    from vector.app import app

    def confirm(request):
        with TestClient(app) as client:
            client.cookies.set("vector_session", token)
            barrier.wait(timeout=5)
            return client.post(f"/api/rentals/{request['id']}/status", json={"status": "confirmed"}).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = list(pool.map(confirm, requests))
    assert sorted(statuses) == [200, 409]
    ids = {request["id"] for request in requests}
    saved = [item for item in successful(clients["admin"].get("/api/rentals")) if item["id"] in ids]
    assert sorted(item["status"] for item in saved) == ["confirmed", "pending"]


def test_multiday_rental_uses_peak_daily_inventory_not_sum_of_disjoint_bookings(clients):
    first_event = event(clients["official"], title="Competición del primer día", offset_days=10)
    second_event = event(clients["standard"], title="Competición del segundo día", offset_days=11)
    equipment = next(item for item in successful(clients["official"].get("/api/equipment")) if item["stock"] >= 3)
    daily_quantity = equipment["stock"] * 2 // 3
    remaining = equipment["stock"] - daily_quantity
    first_date = date.today() + timedelta(days=10)
    second_date = first_date + timedelta(days=1)
    first = successful(rental(clients["official"], first_event["id"], equipment["id"], daily_quantity, first_date))
    second = successful(rental(clients["standard"], second_event["id"], equipment["id"], daily_quantity, second_date))
    admin = clients["admin"]
    for reservation in (first, second):
        successful(admin.post(f"/api/rentals/{reservation['id']}/status", json={"status": "confirmed"}))
    spanning = successful(rental(clients["official"], first_event["id"], equipment["id"], remaining, first_date, second_date))
    too_large = successful(rental(clients["standard"], second_event["id"], equipment["id"], remaining + 1, first_date, second_date))
    # Each day has the same spare capacity. Adding together reservations on
    # different days would wrongly reject the valid spanning reservation.
    assert admin.post(f"/api/rentals/{too_large['id']}/status", json={"status": "confirmed"}).status_code == 409
    successful(admin.post(f"/api/rentals/{spanning['id']}/status", json={"status": "confirmed"}))
    assert admin.post(f"/api/rentals/{too_large['id']}/status", json={"status": "confirmed"}).status_code == 409
    saved = {item["id"]: item for item in successful(admin.get("/api/rentals"))}
    assert saved[spanning["id"]]["status"] == "confirmed"
    assert saved[too_large["id"]]["status"] == "pending"


def test_rental_ownership_dates_and_duplicate_items(clients):
    own_event = event(clients["official"])
    foreign_event = event(clients["standard"])
    equipment = successful(clients["official"].get("/api/equipment"))[0]
    start = date.today() + timedelta(days=10)
    assert rental(clients["official"], foreign_event["id"], equipment["id"], 1, start).status_code == 403
    assert rental(clients["athlete"], own_event["id"], equipment["id"], 1, start).status_code == 403
    assert rental(clients["official"], own_event["id"], equipment["id"], 1, start, start - timedelta(days=1)).status_code == 422
    payload = {"event_id": own_event["id"], "start_date": start.isoformat(), "end_date": start.isoformat(), "notes": "",
               "items": [{"equipment_id": equipment["id"], "quantity": 1}] * 2}
    assert clients["official"].post("/api/rentals", json=payload).status_code == 422
    own = successful(rental(clients["official"], own_event["id"], equipment["id"], 1, start))
    assert own["id"] not in {row["id"] for row in successful(clients["standard"].get("/api/rentals"))}
    assert own["id"] in {row["id"] for row in successful(clients["admin"].get("/api/rentals"))}


def test_event_registration_and_workout_completion_are_idempotent(clients):
    created_event = event(clients["official"], brand="vector")
    created_workout = successful(workout(clients["admin"]))
    athlete = clients["athlete"]
    for _ in range(2):
        successful(athlete.post(f"/api/events/{created_event['id']}/register", json={}))
        successful(athlete.post(f"/api/workouts/{created_workout['id']}/complete", json={}))
    saved_event = next(item for item in successful(athlete.get("/api/events")) if item["id"] == created_event["id"])
    assert saved_event["registration_count"] == 1
    assert saved_event["registered"] is True
    assert clients["official"].post(f"/api/events/{created_event['id']}/register", json={}).status_code == 403
    from vector.db import connect
    with connect() as connection:
        assert connection.execute("SELECT count(*) FROM completions WHERE user_id=? AND workout_id=?", (user(athlete)["id"], created_workout["id"])).fetchone()[0] == 1
        assert connection.execute("SELECT count(*) FROM event_registrations WHERE event_id=?", (created_event["id"],)).fetchone()[0] == 1
    dashboard = successful(athlete.get("/api/dashboard"))
    assert any(created_workout["title"] in item["title"] for item in dashboard["activity"])


def test_database_restart_preserves_account_and_data_without_auto_demo_seed(database):
    from vector.app import app
    from vector.db import connect

    with TestClient(app) as first:
        successful(first.post("/api/auth/login", json={"email": ACCOUNTS["admin"], "password": PASSWORD}))
        created = successful(workout(first, title="Persistencia de entrenamiento"))
        token = first.cookies.get("vector_session")
    with TestClient(app) as restarted:
        restarted.cookies.set("vector_session", token)
        assert user(restarted)["role"] == "admin"
        assert created["id"] in {item["id"] for item in successful(restarted.get("/api/workouts"))}
    with connect() as connection:
        assert connection.execute("PRAGMA foreign_keys").fetchone()[0] == 1
        assert connection.execute("PRAGMA foreign_key_check").fetchall() == []
        assert connection.execute("SELECT count(*) FROM users WHERE email=?", (ACCOUNTS["admin"],)).fetchone()[0] == 1
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute("INSERT INTO completions(user_id,workout_id,completed_at) VALUES (999999,999999,'2026-01-01')")


def test_clean_database_start_does_not_enable_demo_logins(tmp_path, monkeypatch):
    monkeypatch.setenv("VECTOR_DATA_DIR", str(tmp_path / "empty-data"))
    monkeypatch.delenv("VECTOR_POSE_MODEL", raising=False)
    from vector.app import app

    with TestClient(app) as client:
        assert successful(client.get("/api/bootstrap"))["demo"] is False
        assert client.post("/api/auth/login", json={"email": ACCOUNTS["admin"], "password": PASSWORD}).status_code == 401
        assert successful(client.get("/api/health"))["database"] == "ok"
