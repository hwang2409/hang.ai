"""Tests for the spaced-repetition review queue endpoints (/reviews)."""

from httpx import AsyncClient


# ── Helpers ──────────────────────────────────────────────────────────────────


async def _create_note(
    client: AsyncClient,
    headers: dict,
    title: str = "Test Note",
    content: str = "Some study content for testing.",
) -> dict:
    resp = await client.post(
        "/notes",
        json={"title": title, "content": content},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _seed_review_schedule(
    client: AsyncClient,
    headers: dict,
    note_title: str = "Review Note",
) -> tuple[dict, int]:
    """Create a note and directly insert a ReviewSchedule via the service function.

    Returns (note_data, review_schedule_id).

    Because there is no POST /reviews endpoint, we use the internal service
    function ``ensure_note_review_schedule`` via a small helper that reaches
    into the app's DB session.  The conftest ``client`` fixture ensures we are
    using the same in-memory DB, so the rows are visible to subsequent HTTP
    requests.
    """
    from datetime import datetime, timedelta, timezone

    from app.database import async_session
    from app.reviews.service import ensure_note_review_schedule

    note = await _create_note(client, headers, title=note_title)
    note_id = note["id"]

    # We need the user_id — decode it from the JWT in the headers
    from jose import jwt as jose_jwt
    from app.config import settings

    token = headers["Authorization"].split(" ", 1)[1]
    payload = jose_jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    user_id = int(payload["sub"])

    async with async_session() as db:
        schedule = await ensure_note_review_schedule(db, user_id, note_id, note_title)
        # Make it immediately due by pushing next_review into the past
        schedule.next_review = datetime.now(timezone.utc) - timedelta(hours=1)
        await db.commit()
        await db.refresh(schedule)
        schedule_id = schedule.id

    return note, schedule_id


# ── Tests ────────────────────────────────────────────────────────────────────


async def test_get_due_reviews_empty(client: AsyncClient, auth_headers: dict):
    resp = await client.get("/reviews/due", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == []


async def test_get_due_reviews(client: AsyncClient, auth_headers: dict):
    _note, schedule_id = await _seed_review_schedule(client, auth_headers)

    resp = await client.get("/reviews/due", headers=auth_headers)
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) >= 1
    ids = [i["id"] for i in items]
    assert schedule_id in ids


async def test_complete_review(client: AsyncClient, auth_headers: dict):
    _note, schedule_id = await _seed_review_schedule(client, auth_headers)

    resp = await client.post(
        f"/reviews/{schedule_id}/complete",
        json={"quality": 4},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["repetitions"] == 1
    assert data["interval"] == 1
    assert data["last_reviewed"] is not None
    assert data["ease_factor"] >= 1.3


async def test_complete_review_again(client: AsyncClient, auth_headers: dict):
    """A quality=0 review should reset repetitions and interval."""
    _note, schedule_id = await _seed_review_schedule(client, auth_headers)

    # First, complete with quality=4 to advance the schedule
    await client.post(
        f"/reviews/{schedule_id}/complete",
        json={"quality": 4},
        headers=auth_headers,
    )

    # Then fail with quality=0 — this should reset
    resp = await client.post(
        f"/reviews/{schedule_id}/complete",
        json={"quality": 0},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["repetitions"] == 0
    assert data["interval"] == 1  # SM2 resets to 1 on failure


async def test_review_stats(client: AsyncClient, auth_headers: dict):
    resp = await client.get("/reviews/stats", headers=auth_headers)
    assert resp.status_code == 200
    stats = resp.json()
    assert "total_scheduled" in stats
    assert "due_now" in stats
    assert "reviewed_today" in stats
    assert "mastered" in stats


async def test_review_stats_with_data(client: AsyncClient, auth_headers: dict):
    _note, schedule_id = await _seed_review_schedule(client, auth_headers)

    resp = await client.get("/reviews/stats", headers=auth_headers)
    assert resp.status_code == 200
    stats = resp.json()
    assert stats["total_scheduled"] >= 1
    assert stats["due_now"] >= 1


async def test_delete_review(client: AsyncClient, auth_headers: dict):
    _note, schedule_id = await _seed_review_schedule(client, auth_headers)

    resp = await client.delete(f"/reviews/{schedule_id}", headers=auth_headers)
    assert resp.status_code == 204

    # Confirm gone from due list
    resp = await client.get("/reviews/due", headers=auth_headers)
    assert resp.status_code == 200
    ids = [i["id"] for i in resp.json()]
    assert schedule_id not in ids


async def test_review_ownership(
    client: AsyncClient, auth_headers: dict, second_user_headers: dict
):
    """User2 should not be able to complete or delete user1's review."""
    _note, schedule_id = await _seed_review_schedule(client, auth_headers)

    # User2 cannot complete
    resp = await client.post(
        f"/reviews/{schedule_id}/complete",
        json={"quality": 4},
        headers=second_user_headers,
    )
    assert resp.status_code == 404

    # User2 cannot delete
    resp = await client.delete(f"/reviews/{schedule_id}", headers=second_user_headers)
    assert resp.status_code == 404

    # User2's due list should be empty
    resp = await client.get("/reviews/due", headers=second_user_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 0


async def test_complete_nonexistent_review(client: AsyncClient, auth_headers: dict):
    resp = await client.post(
        "/reviews/999999/complete",
        json={"quality": 3},
        headers=auth_headers,
    )
    assert resp.status_code == 404


async def test_delete_nonexistent_review(client: AsyncClient, auth_headers: dict):
    resp = await client.delete("/reviews/999999", headers=auth_headers)
    assert resp.status_code == 404
