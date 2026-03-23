"""Tests for the /auth endpoints (register, login, me)."""

import pytest
from httpx import AsyncClient


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------

async def test_register_success(client: AsyncClient):
    resp = await client.post("/auth/register", json={
        "email": "new@example.com",
        "username": "newuser",
        "password": "securepass1",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


async def test_register_duplicate_email(client: AsyncClient):
    payload = {
        "email": "dup@example.com",
        "username": "user1",
        "password": "securepass1",
    }
    resp1 = await client.post("/auth/register", json=payload)
    assert resp1.status_code == 201

    # Same email, different username
    resp2 = await client.post("/auth/register", json={
        "email": "dup@example.com",
        "username": "user2",
        "password": "securepass1",
    })
    assert resp2.status_code == 400
    assert "email" in resp2.json()["detail"].lower()


async def test_register_duplicate_username(client: AsyncClient):
    await client.post("/auth/register", json={
        "email": "a@example.com",
        "username": "samename",
        "password": "securepass1",
    })
    resp = await client.post("/auth/register", json={
        "email": "b@example.com",
        "username": "samename",
        "password": "securepass1",
    })
    assert resp.status_code == 400
    assert "username" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

async def test_login_success(client: AsyncClient):
    await client.post("/auth/register", json={
        "email": "login@example.com",
        "username": "loginuser",
        "password": "securepass1",
    })
    resp = await client.post("/auth/login", json={
        "email": "login@example.com",
        "password": "securepass1",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


async def test_login_wrong_password(client: AsyncClient):
    await client.post("/auth/register", json={
        "email": "wrong@example.com",
        "username": "wrongpwuser",
        "password": "securepass1",
    })
    resp = await client.post("/auth/login", json={
        "email": "wrong@example.com",
        "password": "badpassword",
    })
    assert resp.status_code == 401
    assert "invalid" in resp.json()["detail"].lower()


async def test_login_nonexistent_email(client: AsyncClient):
    resp = await client.post("/auth/login", json={
        "email": "ghost@example.com",
        "password": "whatever123",
    })
    assert resp.status_code == 401
    assert "invalid" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# GET /auth/me
# ---------------------------------------------------------------------------

async def test_get_me(client: AsyncClient, auth_headers: dict):
    resp = await client.get("/auth/me", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "test@example.com"
    assert data["username"] == "testuser"
    assert "id" in data
    assert "created_at" in data


async def test_get_me_no_auth(client: AsyncClient):
    resp = await client.get("/auth/me")
    assert resp.status_code == 401


async def test_get_me_invalid_token(client: AsyncClient):
    resp = await client.get("/auth/me", headers={
        "Authorization": "Bearer this.is.garbage",
    })
    assert resp.status_code == 401
