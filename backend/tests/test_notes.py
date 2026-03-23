"""Tests for the /notes endpoints (CRUD, search, trash, copy)."""

from unittest.mock import patch, AsyncMock

import pytest
from httpx import AsyncClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _create_note(
    client: AsyncClient,
    headers: dict,
    title: str = "Test Note",
    content: str = "Some content",
    note_type: str = "text",
) -> dict:
    """Create a note and return the response JSON."""
    resp = await client.post("/notes", json={
        "title": title,
        "content": content,
        "type": note_type,
    }, headers=headers)
    assert resp.status_code == 201, f"Failed to create note: {resp.text}"
    return resp.json()


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------

async def test_create_note(client: AsyncClient, auth_headers: dict):
    data = await _create_note(client, auth_headers, title="My Note", content="Hello world")
    assert data["title"] == "My Note"
    assert data["content"] == "Hello world"
    assert data["type"] == "text"
    assert data["deleted"] is False
    assert "id" in data
    assert "created_at" in data
    assert "updated_at" in data


async def test_create_note_no_auth(client: AsyncClient):
    resp = await client.post("/notes", json={
        "title": "Unauthorized",
        "content": "Should fail",
    })
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------

async def test_list_notes(client: AsyncClient, auth_headers: dict):
    await _create_note(client, auth_headers, title="First")
    await _create_note(client, auth_headers, title="Second")

    resp = await client.get("/notes", headers=auth_headers)
    assert resp.status_code == 200
    notes = resp.json()
    assert len(notes) == 2
    titles = {n["title"] for n in notes}
    assert titles == {"First", "Second"}


# ---------------------------------------------------------------------------
# Get by ID
# ---------------------------------------------------------------------------

async def test_get_note(client: AsyncClient, auth_headers: dict):
    created = await _create_note(client, auth_headers, title="Read Me", content="Body text")
    note_id = created["id"]

    resp = await client.get(f"/notes/{note_id}", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == note_id
    assert data["title"] == "Read Me"
    assert data["content"] == "Body text"


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------

async def test_update_note(client: AsyncClient, auth_headers: dict):
    created = await _create_note(client, auth_headers, title="Original", content="Old")
    note_id = created["id"]

    resp = await client.put(f"/notes/{note_id}", json={
        "title": "Updated",
        "content": "New content",
    }, headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "Updated"
    assert data["content"] == "New content"


# ---------------------------------------------------------------------------
# Delete (soft)
# ---------------------------------------------------------------------------

async def test_delete_note(client: AsyncClient, auth_headers: dict):
    created = await _create_note(client, auth_headers, title="To Delete")
    note_id = created["id"]

    # Soft-delete
    resp = await client.delete(f"/notes/{note_id}", headers=auth_headers)
    assert resp.status_code == 204

    # Should no longer appear in normal list
    resp = await client.get(f"/notes/{note_id}", headers=auth_headers)
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Ownership isolation
# ---------------------------------------------------------------------------

async def test_note_ownership(
    client: AsyncClient,
    auth_headers: dict,
    second_user_headers: dict,
):
    created = await _create_note(client, auth_headers, title="Private")
    note_id = created["id"]

    # Second user cannot read the first user's note
    resp = await client.get(f"/notes/{note_id}", headers=second_user_headers)
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------

async def test_search_notes(client: AsyncClient, auth_headers: dict):
    await _create_note(client, auth_headers, title="Quantum Physics", content="Wave-particle duality")
    await _create_note(client, auth_headers, title="Cooking Tips", content="How to make pasta")

    resp = await client.post("/notes/search", json={"query": "quantum"}, headers=auth_headers)
    assert resp.status_code == 200
    results = resp.json()
    assert len(results) == 1
    assert results[0]["title"] == "Quantum Physics"


# ---------------------------------------------------------------------------
# Trash and Restore
# ---------------------------------------------------------------------------

async def test_trash_and_restore(client: AsyncClient, auth_headers: dict):
    created = await _create_note(client, auth_headers, title="Trashable")
    note_id = created["id"]

    # Delete
    resp = await client.delete(f"/notes/{note_id}", headers=auth_headers)
    assert resp.status_code == 204

    # Should appear in trash
    resp = await client.get("/notes/trash", headers=auth_headers)
    assert resp.status_code == 200
    trash = resp.json()
    assert any(n["id"] == note_id for n in trash)

    # Restore
    resp = await client.post(f"/notes/{note_id}/restore", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["deleted"] is False

    # Should be accessible again
    resp = await client.get(f"/notes/{note_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["title"] == "Trashable"


# ---------------------------------------------------------------------------
# Duplicate (copy)
# ---------------------------------------------------------------------------

async def test_duplicate_note(client: AsyncClient, auth_headers: dict):
    created = await _create_note(client, auth_headers, title="Original", content="Clone me")
    note_id = created["id"]

    resp = await client.post(f"/notes/{note_id}/copy", headers=auth_headers)
    assert resp.status_code == 201
    copy = resp.json()
    assert copy["title"] == "Copy of Original"
    assert copy["content"] == "Clone me"
    assert copy["id"] != note_id
