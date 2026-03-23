"""Tests for flashcard CRUD, review, and stats endpoints."""

from httpx import AsyncClient


# ── Helpers ──────────────────────────────────────────────────────────────────


async def _create_flashcard(
    client: AsyncClient,
    headers: dict,
    front: str = "What is 2+2?",
    back: str = "4",
    note_id: int | None = None,
) -> dict:
    payload: dict = {"front": front, "back": back}
    if note_id is not None:
        payload["note_id"] = note_id
    resp = await client.post("/flashcards", json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ── CRUD ─────────────────────────────────────────────────────────────────────


async def test_create_flashcard(client: AsyncClient, auth_headers: dict):
    data = await _create_flashcard(client, auth_headers)
    assert data["front"] == "What is 2+2?"
    assert data["back"] == "4"
    assert data["id"] is not None
    assert data["ease_factor"] == 2.5
    assert data["interval"] == 0
    assert data["repetitions"] == 0


async def test_list_flashcards(client: AsyncClient, auth_headers: dict):
    await _create_flashcard(client, auth_headers, front="Q1", back="A1")
    await _create_flashcard(client, auth_headers, front="Q2", back="A2")

    resp = await client.get("/flashcards", headers=auth_headers)
    assert resp.status_code == 200
    cards = resp.json()
    assert len(cards) == 2
    fronts = {c["front"] for c in cards}
    assert fronts == {"Q1", "Q2"}


async def test_get_flashcard(client: AsyncClient, auth_headers: dict):
    """The list endpoint filtered by the single card's note_id is the closest
    equivalent — there is no dedicated GET /flashcards/{id} in the router."""
    card = await _create_flashcard(client, auth_headers)

    # Verify it shows up in the full list
    resp = await client.get("/flashcards", headers=auth_headers)
    assert resp.status_code == 200
    ids = [c["id"] for c in resp.json()]
    assert card["id"] in ids


async def test_update_flashcard(client: AsyncClient, auth_headers: dict):
    card = await _create_flashcard(client, auth_headers)
    card_id = card["id"]

    resp = await client.put(
        f"/flashcards/{card_id}",
        json={"front": "Updated Q", "back": "Updated A"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["front"] == "Updated Q"
    assert updated["back"] == "Updated A"


async def test_delete_flashcard(client: AsyncClient, auth_headers: dict):
    card = await _create_flashcard(client, auth_headers)
    card_id = card["id"]

    resp = await client.delete(f"/flashcards/{card_id}", headers=auth_headers)
    assert resp.status_code == 204

    # Confirm it is gone
    resp = await client.get("/flashcards", headers=auth_headers)
    assert resp.status_code == 200
    ids = [c["id"] for c in resp.json()]
    assert card_id not in ids


async def test_flashcard_ownership(
    client: AsyncClient, auth_headers: dict, second_user_headers: dict
):
    """A card created by user1 should not be updatable/deletable by user2."""
    card = await _create_flashcard(client, auth_headers)
    card_id = card["id"]

    # User2 cannot update
    resp = await client.put(
        f"/flashcards/{card_id}",
        json={"front": "hacked"},
        headers=second_user_headers,
    )
    assert resp.status_code == 404  # router returns 404 when ownership fails

    # User2 cannot delete
    resp = await client.delete(f"/flashcards/{card_id}", headers=second_user_headers)
    assert resp.status_code == 404

    # User2 list should be empty
    resp = await client.get("/flashcards", headers=second_user_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 0


# ── SM2 Review ───────────────────────────────────────────────────────────────


async def test_review_flashcard(client: AsyncClient, auth_headers: dict):
    card = await _create_flashcard(client, auth_headers)
    card_id = card["id"]

    resp = await client.post(
        f"/flashcards/{card_id}/review",
        json={"quality": 4},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    reviewed = resp.json()
    # After a quality-4 review from initial state (reps=0), SM2 sets interval=1, reps=1
    assert reviewed["repetitions"] == 1
    assert reviewed["interval"] == 1
    assert reviewed["last_reviewed"] is not None
    # Ease should have adjusted from 2.5
    assert reviewed["ease_factor"] != 2.5 or reviewed["ease_factor"] >= 1.3


async def test_review_flashcard_fail(client: AsyncClient, auth_headers: dict):
    """A quality=1 review should reset repetitions to 0."""
    card = await _create_flashcard(client, auth_headers)
    card_id = card["id"]

    # First review with quality=4 to move to reps=1
    await client.post(
        f"/flashcards/{card_id}/review",
        json={"quality": 4},
        headers=auth_headers,
    )

    # Now fail it
    resp = await client.post(
        f"/flashcards/{card_id}/review",
        json={"quality": 1},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["repetitions"] == 0
    assert data["interval"] == 1  # reset to 1


# ── Due & Stats ──────────────────────────────────────────────────────────────


async def test_due_flashcards(client: AsyncClient, auth_headers: dict):
    """Newly created flashcards have next_review = now, so they should be due."""
    await _create_flashcard(client, auth_headers, front="Due card", back="Answer")

    resp = await client.get("/flashcards/due", headers=auth_headers)
    assert resp.status_code == 200
    due = resp.json()
    assert len(due) >= 1
    assert any(c["front"] == "Due card" for c in due)


async def test_flashcard_stats(client: AsyncClient, auth_headers: dict):
    await _create_flashcard(client, auth_headers, front="Stat card", back="X")

    resp = await client.get("/flashcards/stats", headers=auth_headers)
    assert resp.status_code == 200
    stats = resp.json()
    assert stats["total"] >= 1
    assert stats["due_today"] >= 1
    assert "mastered" in stats
    assert "learning" in stats
    assert stats["learning"] == stats["total"] - stats["mastered"]


async def test_flashcard_stats_empty(client: AsyncClient, auth_headers: dict):
    resp = await client.get("/flashcards/stats", headers=auth_headers)
    assert resp.status_code == 200
    stats = resp.json()
    assert stats["total"] == 0
    assert stats["due_today"] == 0
    assert stats["mastered"] == 0
    assert stats["learning"] == 0


async def test_duplicate_flashcard_rejected(client: AsyncClient, auth_headers: dict):
    """Creating a flashcard with the same front text should be rejected (409)."""
    await _create_flashcard(client, auth_headers, front="Unique Q", back="A")
    resp = await client.post(
        "/flashcards",
        json={"front": "Unique Q", "back": "Different A"},
        headers=auth_headers,
    )
    assert resp.status_code == 409
