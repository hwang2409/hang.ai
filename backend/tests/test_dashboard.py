"""Tests for the dashboard endpoints (/dashboard)."""

from httpx import AsyncClient


# ── Helpers ──────────────────────────────────────────────────────────────────


async def _create_flashcard(
    client: AsyncClient, headers: dict, front: str = "Q", back: str = "A"
) -> dict:
    resp = await client.post(
        "/flashcards", json={"front": front, "back": back}, headers=headers
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _create_note(
    client: AsyncClient, headers: dict, title: str = "Note", content: str = "Content"
) -> dict:
    resp = await client.post(
        "/notes", json={"title": title, "content": content}, headers=headers
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


# ── /dashboard/review ────────────────────────────────────────────────────────


async def test_dashboard_review(client: AsyncClient, auth_headers: dict):
    resp = await client.get("/dashboard/review", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()

    # Verify expected top-level keys exist
    assert "greeting" in data
    assert "due_flashcards" in data
    assert "due_flashcard_count" in data
    assert "brief_items" in data
    assert "current_streak" in data
    assert "estimated_minutes" in data
    assert "stale_notes" in data
    assert "overdue_todos" in data
    assert "upcoming_todos" in data
    assert "due_review_count" in data

    # With no data, everything should be empty/zero
    assert data["due_flashcard_count"] == 0
    assert data["current_streak"] == 0
    assert isinstance(data["brief_items"], list)
    assert isinstance(data["greeting"], str)
    assert len(data["greeting"]) > 0  # always has a greeting


async def test_dashboard_review_with_flashcards(
    client: AsyncClient, auth_headers: dict
):
    """After creating flashcards, the dashboard should reflect them."""
    await _create_flashcard(client, auth_headers, front="Dash Q1", back="A1")
    await _create_flashcard(client, auth_headers, front="Dash Q2", back="A2")

    resp = await client.get("/dashboard/review", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()

    # New cards are immediately due (next_review defaults to now)
    assert data["due_flashcard_count"] >= 2
    assert len(data["due_flashcards"]) >= 2

    # Brief items should include a flashcard_review entry
    types = [item["type"] for item in data["brief_items"]]
    assert "flashcard_review" in types

    # Greeting should mention flashcards
    assert "flashcard" in data["greeting"].lower()


async def test_dashboard_review_with_notes(client: AsyncClient, auth_headers: dict):
    """Creating notes should not break the dashboard (notes data is optional)."""
    await _create_note(client, auth_headers, title="Dashboard Note", content="x" * 100)

    resp = await client.get("/dashboard/review", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    # Stale notes won't appear yet (need 14+ days), but the endpoint should succeed
    assert isinstance(data["stale_notes"], list)


# ── /dashboard/trends ────────────────────────────────────────────────────────


async def test_dashboard_trends(client: AsyncClient, auth_headers: dict):
    resp = await client.get("/dashboard/trends", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()

    assert "quiz_accuracy" in data
    assert "flashcard_retention" in data
    assert "study_minutes" in data

    # Default is 8 weeks
    assert len(data["quiz_accuracy"]) == 8
    assert len(data["flashcard_retention"]) == 8
    assert len(data["study_minutes"]) == 8


async def test_dashboard_trends_custom_weeks(client: AsyncClient, auth_headers: dict):
    resp = await client.get("/dashboard/trends?weeks=4", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["quiz_accuracy"]) == 4


# ── /dashboard/mastery ───────────────────────────────────────────────────────


async def test_dashboard_mastery_empty(client: AsyncClient, auth_headers: dict):
    resp = await client.get("/dashboard/mastery", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "topics" in data
    assert data["topics"] == []


# ── /dashboard/habits ────────────────────────────────────────────────────────


async def test_dashboard_habits(client: AsyncClient, auth_headers: dict):
    resp = await client.get("/dashboard/habits", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "insights" in data
    assert "study_days_last_30" in data
    assert "avg_daily_minutes" in data
    assert data["study_days_last_30"] == 0
    assert data["avg_daily_minutes"] == 0.0
