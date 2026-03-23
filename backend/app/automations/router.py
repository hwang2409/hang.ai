import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, get_current_user
from app.auth.models import User
from app.automations.models import AutomationRule, AutomationLog
from app.automations.engine import TRIGGERS, ACTIONS

router = APIRouter()


class RuleCreate(BaseModel):
    name: str
    trigger_type: str
    trigger_config: dict = {}
    action_type: str
    action_config: dict = {}
    enabled: bool = True


class RuleUpdate(BaseModel):
    name: str | None = None
    trigger_config: dict | None = None
    action_config: dict | None = None
    enabled: bool | None = None


@router.get("/triggers")
async def list_triggers():
    """Available trigger types."""
    return {"triggers": TRIGGERS}


@router.get("/actions")
async def list_actions():
    """Available action types."""
    return {"actions": ACTIONS}


@router.get("")
async def list_rules(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List user's automation rules."""
    result = await db.execute(
        select(AutomationRule)
        .where(AutomationRule.user_id == current_user.id)
        .order_by(desc(AutomationRule.created_at))
    )
    rules = result.scalars().all()
    return {"rules": [
        {
            "id": r.id,
            "name": r.name,
            "trigger_type": r.trigger_type,
            "trigger_config": json.loads(r.trigger_config) if r.trigger_config else {},
            "action_type": r.action_type,
            "action_config": json.loads(r.action_config) if r.action_config else {},
            "enabled": r.enabled,
            "trigger_count": r.trigger_count,
            "last_triggered_at": r.last_triggered_at.isoformat() if r.last_triggered_at else None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rules
    ]}


@router.post("")
async def create_rule(
    body: RuleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create an automation rule."""
    if body.trigger_type not in TRIGGERS:
        raise HTTPException(status_code=400, detail=f"Unknown trigger: {body.trigger_type}")
    if body.action_type not in ACTIONS:
        raise HTTPException(status_code=400, detail=f"Unknown action: {body.action_type}")

    rule = AutomationRule(
        user_id=current_user.id,
        name=body.name,
        trigger_type=body.trigger_type,
        trigger_config=json.dumps(body.trigger_config),
        action_type=body.action_type,
        action_config=json.dumps(body.action_config),
        enabled=body.enabled,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return {
        "id": rule.id,
        "name": rule.name,
        "trigger_type": rule.trigger_type,
        "trigger_config": body.trigger_config,
        "action_type": rule.action_type,
        "action_config": body.action_config,
        "enabled": rule.enabled,
    }


@router.put("/{rule_id}")
async def update_rule(
    rule_id: int,
    body: RuleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an automation rule."""
    result = await db.execute(
        select(AutomationRule).where(
            AutomationRule.id == rule_id,
            AutomationRule.user_id == current_user.id,
        )
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    if body.name is not None:
        rule.name = body.name
    if body.trigger_config is not None:
        rule.trigger_config = json.dumps(body.trigger_config)
    if body.action_config is not None:
        rule.action_config = json.dumps(body.action_config)
    if body.enabled is not None:
        rule.enabled = body.enabled

    await db.commit()
    return {"ok": True}


@router.delete("/{rule_id}")
async def delete_rule(
    rule_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete an automation rule."""
    result = await db.execute(
        select(AutomationRule).where(
            AutomationRule.id == rule_id,
            AutomationRule.user_id == current_user.id,
        )
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    await db.delete(rule)
    await db.commit()
    return {"ok": True}


@router.get("/logs")
async def list_logs(
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Recent automation execution logs."""
    result = await db.execute(
        select(AutomationLog, AutomationRule.name)
        .join(AutomationRule, AutomationLog.rule_id == AutomationRule.id)
        .where(AutomationLog.user_id == current_user.id)
        .order_by(desc(AutomationLog.created_at))
        .limit(limit)
    )
    rows = result.all()
    return {"logs": [
        {
            "id": log.id,
            "rule_name": name,
            "trigger_data": json.loads(log.trigger_data) if log.trigger_data else {},
            "action_result": json.loads(log.action_result) if log.action_result else {},
            "status": log.status,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }
        for log, name in rows
    ]}
