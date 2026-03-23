"""Tests for the todo CRUD endpoints (/todos)."""

from httpx import AsyncClient


# ── Helpers ──────────────────────────────────────────────────────────────────


async def _create_todo(
    client: AsyncClient,
    headers: dict,
    text: str = "Buy milk",
    priority: int = 0,
    due_date: str | None = None,
) -> dict:
    payload: dict = {"text": text, "priority": priority}
    if due_date is not None:
        payload["due_date"] = due_date
    resp = await client.post("/todos", json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ── CRUD ─────────────────────────────────────────────────────────────────────


async def test_create_todo(client: AsyncClient, auth_headers: dict):
    data = await _create_todo(client, auth_headers, text="Write tests")
    assert data["text"] == "Write tests"
    assert data["completed"] is False
    assert data["priority"] == 0
    assert data["id"] is not None


async def test_create_todo_with_due_date(client: AsyncClient, auth_headers: dict):
    data = await _create_todo(
        client, auth_headers, text="Submit report", due_date="2026-04-01"
    )
    assert data["due_date"] == "2026-04-01"


async def test_list_todos(client: AsyncClient, auth_headers: dict):
    await _create_todo(client, auth_headers, text="Task 1")
    await _create_todo(client, auth_headers, text="Task 2")

    resp = await client.get("/todos", headers=auth_headers)
    assert resp.status_code == 200
    todos = resp.json()
    assert len(todos) == 2
    texts = {t["text"] for t in todos}
    assert texts == {"Task 1", "Task 2"}


async def test_list_todos_filter_completed(client: AsyncClient, auth_headers: dict):
    todo = await _create_todo(client, auth_headers, text="Done task")
    await client.put(
        f"/todos/{todo['id']}",
        json={"completed": True},
        headers=auth_headers,
    )
    await _create_todo(client, auth_headers, text="Open task")

    # Only completed
    resp = await client.get("/todos?completed=true", headers=auth_headers)
    assert resp.status_code == 200
    assert all(t["completed"] for t in resp.json())

    # Only incomplete
    resp = await client.get("/todos?completed=false", headers=auth_headers)
    assert resp.status_code == 200
    assert all(not t["completed"] for t in resp.json())


async def test_complete_todo(client: AsyncClient, auth_headers: dict):
    todo = await _create_todo(client, auth_headers, text="Finish homework")

    resp = await client.put(
        f"/todos/{todo['id']}",
        json={"completed": True},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["completed"] is True
    assert updated["text"] == "Finish homework"


async def test_update_todo_text(client: AsyncClient, auth_headers: dict):
    todo = await _create_todo(client, auth_headers, text="Old text")

    resp = await client.put(
        f"/todos/{todo['id']}",
        json={"text": "New text"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["text"] == "New text"


async def test_delete_todo(client: AsyncClient, auth_headers: dict):
    todo = await _create_todo(client, auth_headers, text="Delete me")

    resp = await client.delete(f"/todos/{todo['id']}", headers=auth_headers)
    assert resp.status_code == 204

    # Confirm gone
    resp = await client.get("/todos", headers=auth_headers)
    assert resp.status_code == 200
    ids = [t["id"] for t in resp.json()]
    assert todo["id"] not in ids


async def test_delete_nonexistent_todo(client: AsyncClient, auth_headers: dict):
    resp = await client.delete("/todos/999999", headers=auth_headers)
    assert resp.status_code == 404


async def test_update_nonexistent_todo(client: AsyncClient, auth_headers: dict):
    resp = await client.put(
        "/todos/999999",
        json={"text": "Nope"},
        headers=auth_headers,
    )
    assert resp.status_code == 404


async def test_todo_ownership(
    client: AsyncClient, auth_headers: dict, second_user_headers: dict
):
    """User2 should not be able to update or delete user1's todos."""
    todo = await _create_todo(client, auth_headers, text="Private task")

    # User2 cannot update
    resp = await client.put(
        f"/todos/{todo['id']}",
        json={"completed": True},
        headers=second_user_headers,
    )
    assert resp.status_code == 404

    # User2 cannot delete
    resp = await client.delete(f"/todos/{todo['id']}", headers=second_user_headers)
    assert resp.status_code == 404

    # User2 list is empty
    resp = await client.get("/todos", headers=second_user_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 0
