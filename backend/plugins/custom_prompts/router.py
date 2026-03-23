from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, get_current_user
from app.auth.models import User
from plugins.custom_prompts.models import CustomPrompt
from app.llm.service import evaluate_text
from app.llm.prompts import VOICE

router = APIRouter()


class CreatePromptRequest(BaseModel):
    name: str
    label: str
    prompt_template: str


class ExecutePromptRequest(BaseModel):
    prompt_id: int
    selected_text: str
    note_context: str | None = None


@router.get("")
async def list_prompts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(CustomPrompt)
        .where(CustomPrompt.user_id == current_user.id)
        .order_by(CustomPrompt.created_at.desc())
    )
    prompts = result.scalars().all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "label": p.label,
            "prompt_template": p.prompt_template,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
        for p in prompts
    ]


@router.post("", status_code=201)
async def create_prompt(
    body: CreatePromptRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    prompt = CustomPrompt(
        user_id=current_user.id,
        name=body.name,
        label=body.label,
        prompt_template=body.prompt_template,
    )
    db.add(prompt)
    await db.commit()
    await db.refresh(prompt)
    return {
        "id": prompt.id,
        "name": prompt.name,
        "label": prompt.label,
        "prompt_template": prompt.prompt_template,
    }


@router.delete("/{prompt_id}", status_code=204)
async def delete_prompt(
    prompt_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(CustomPrompt).where(
            CustomPrompt.id == prompt_id,
            CustomPrompt.user_id == current_user.id,
        )
    )
    prompt = result.scalar_one_or_none()
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    await db.delete(prompt)
    await db.commit()


@router.post("/execute")
async def execute_prompt(
    body: ExecutePromptRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(CustomPrompt).where(
            CustomPrompt.id == body.prompt_id,
            CustomPrompt.user_id == current_user.id,
        )
    )
    prompt = result.scalar_one_or_none()
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")

    rendered = prompt.prompt_template.replace("{text}", body.selected_text)
    system = VOICE
    if body.note_context:
        system += f"\n\nThis passage comes from a larger document:\n{body.note_context[:2000]}"

    # Import crypto helper for user API key
    from app.crypto import decrypt_api_key
    user_api_key = None
    if current_user.encrypted_anthropic_key:
        try:
            user_api_key = decrypt_api_key(current_user.encrypted_anthropic_key)
        except Exception:
            pass

    text_result = await evaluate_text(rendered, system_prompt=system, api_key=user_api_key)
    return {"result": text_result}
