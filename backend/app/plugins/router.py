import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, get_current_user
from app.auth.models import User
from app.plugins.loader import PLUGIN_REGISTRY
from app.plugins.models import UserPluginState

router = APIRouter()


class ToggleRequest(BaseModel):
    enabled: bool


class SettingsRequest(BaseModel):
    settings: dict


@router.get("")
async def list_plugins(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all plugins with user's enable/disable state."""
    result = await db.execute(
        select(UserPluginState).where(UserPluginState.user_id == current_user.id)
    )
    states = {s.plugin_id: s for s in result.scalars().all()}

    plugins = []
    for pid, info in PLUGIN_REGISTRY.items():
        state = states.get(pid)
        plugins.append({
            "id": info.id,
            "name": info.name,
            "description": info.description,
            "version": info.version,
            "author": info.author,
            "enabled": state.enabled if state else True,
            "settings": json.loads(state.settings_json) if state else {},
            "frontend": info.frontend,
        })
    return plugins


@router.patch("/{plugin_id}/toggle")
async def toggle_plugin(
    plugin_id: str,
    body: ToggleRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if plugin_id not in PLUGIN_REGISTRY:
        raise HTTPException(status_code=404, detail="Plugin not found")

    result = await db.execute(
        select(UserPluginState).where(
            UserPluginState.user_id == current_user.id,
            UserPluginState.plugin_id == plugin_id,
        )
    )
    state = result.scalar_one_or_none()
    if state:
        state.enabled = body.enabled
    else:
        state = UserPluginState(
            user_id=current_user.id,
            plugin_id=plugin_id,
            enabled=body.enabled,
        )
        db.add(state)
    await db.commit()
    return {"plugin_id": plugin_id, "enabled": body.enabled}


@router.put("/{plugin_id}/settings")
async def update_plugin_settings(
    plugin_id: str,
    body: SettingsRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if plugin_id not in PLUGIN_REGISTRY:
        raise HTTPException(status_code=404, detail="Plugin not found")

    result = await db.execute(
        select(UserPluginState).where(
            UserPluginState.user_id == current_user.id,
            UserPluginState.plugin_id == plugin_id,
        )
    )
    state = result.scalar_one_or_none()
    if state:
        state.settings_json = json.dumps(body.settings)
    else:
        state = UserPluginState(
            user_id=current_user.id,
            plugin_id=plugin_id,
            settings_json=json.dumps(body.settings),
        )
        db.add(state)
    await db.commit()
    return {"plugin_id": plugin_id, "settings": body.settings}
