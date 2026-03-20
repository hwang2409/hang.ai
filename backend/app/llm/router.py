import json
import logging
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import StreamingResponse

from app.deps import get_db, get_current_user
from app.database import async_session
from app.auth.models import User
from app.notes.models import Document
from app.llm.models import ConversationThread, ConversationMessage
from app.llm.schemas import (
    ChatRequest, ThreadResponse, MessageResponse,
    EvaluateRequest, EvaluateResponse,
    SelectionActionRequest, SelectionActionResponse,
)
from app.llm.service import stream_chat_with_tools, evaluate_text
from app.llm.tools import NOTE_EDIT_TOOL, CANVAS_EDIT_TOOL, MOODBOARD_EDIT_TOOL, WEB_SEARCH_TOOL, SEARCH_IMAGES_TOOL, execute_tool
from app.llm.prompts import (
    GENERAL_CHAT_SYSTEM,
    TASK_PROMPTS,
    SELECTION_ACTION_PROMPTS,
    build_note_system_prompt,
    build_canvas_system_prompt,
    build_moodboard_system_prompt,
    build_file_system_prompt,
)
from app.llm.canvas import parse_canvas_content
from app.files.models import UploadedFile
from app.rate_limit import limiter

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_TOOL_ROUNDS = 5


def _format_sse_event(data: dict) -> bytes:
    return f"data: {json.dumps(data)}\n\n".encode()


async def _get_thread_or_404(
    db: AsyncSession, thread_id: int, user_id: int,
) -> ConversationThread:
    result = await db.execute(
        select(ConversationThread).where(
            ConversationThread.id == thread_id,
            ConversationThread.user_id == user_id,
        )
    )
    thread = result.scalar_one_or_none()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    return thread


async def _execute_tools_and_collect(tool_calls, db, note_id):
    """Execute tool calls and return (tool_results, sse_events)."""
    tool_results = []
    sse_events = []
    for tc in tool_calls:
        result_text, events = await execute_tool(tc, db, note_id)
        sse_events.extend(events)
        tool_results.append({
            "type": "tool_result",
            "tool_use_id": tc.id,
            "content": result_text,
        })
    return tool_results, sse_events


@limiter.limit("20/minute")
@router.post("/chat")
async def chat(
    request: Request,
    body: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Get or create thread
    if body.thread_id:
        thread = await _get_thread_or_404(db, body.thread_id, current_user.id)
    else:
        thread = ConversationThread(
            title=body.message[:80],
            user_id=current_user.id,
            note_id=body.note_id,
            file_id=body.file_id,
        )
        db.add(thread)
        await db.commit()
        await db.refresh(thread)

    # Save user message
    user_msg = ConversationMessage(
        thread_id=thread.id, role="user", content=body.message,
    )
    db.add(user_msg)
    await db.commit()

    # Build system prompt and determine available tools
    images = None
    if thread.file_id:
        result = await db.execute(
            select(UploadedFile).where(
                UploadedFile.id == thread.file_id,
                UploadedFile.user_id == current_user.id,
            )
        )
        uploaded_file = result.scalar_one_or_none()
        if uploaded_file and uploaded_file.extracted_text:
            system_prompt = build_file_system_prompt(
                uploaded_file.file_type,
                uploaded_file.original_name,
                uploaded_file.extracted_text,
                body.selected_text,
            )
            tools = [WEB_SEARCH_TOOL]
        else:
            system_prompt = GENERAL_CHAT_SYSTEM
            tools = [WEB_SEARCH_TOOL]
    elif thread.note_id:
        result = await db.execute(select(Document).where(Document.id == thread.note_id))
        note = result.scalar_one_or_none()
        if note:
            if note.type == "canvas":
                text_summary, images = parse_canvas_content(note.content)
                system_prompt = build_canvas_system_prompt(text_summary, body.selected_text)
                tools = [CANVAS_EDIT_TOOL, SEARCH_IMAGES_TOOL]
            elif note.type == "moodboard":
                # Build items summary for moodboard
                try:
                    import json as _json
                    mb_data = _json.loads(note.content or "{}")
                    mb_items = mb_data.get("items", [])
                    if mb_items:
                        lines = []
                        for item in mb_items:
                            if item.get("type") == "image":
                                lines.append(f"- [id:{item['id']}] Image: {item.get('caption', '(no caption)')} — {item.get('url', '')[:80]}")
                            else:
                                lines.append(f"- [id:{item['id']}] Text: {item.get('content', '')[:60]}")
                        items_summary = "\n".join(lines)
                    else:
                        items_summary = "(empty moodboard)"
                except Exception:
                    items_summary = "(empty moodboard)"
                system_prompt = build_moodboard_system_prompt(items_summary, body.selected_text)
                tools = [MOODBOARD_EDIT_TOOL, SEARCH_IMAGES_TOOL]
            else:
                system_prompt = build_note_system_prompt(note.content, body.selected_text)
                tools = [NOTE_EDIT_TOOL, WEB_SEARCH_TOOL]
        else:
            system_prompt = GENERAL_CHAT_SYSTEM
            tools = [WEB_SEARCH_TOOL]
    else:
        system_prompt = GENERAL_CHAT_SYSTEM
        if body.selected_text:
            system_prompt += f'\n\nThe user has selected this passage to focus on:\n"{body.selected_text}"'
        tools = [WEB_SEARCH_TOOL]

    # Load conversation history
    result = await db.execute(
        select(ConversationMessage)
        .where(ConversationMessage.thread_id == thread.id)
        .order_by(ConversationMessage.created_at)
    )
    messages = [{"role": m.role, "content": m.content} for m in result.scalars().all()]

    thread_id = thread.id
    note_id = thread.note_id

    async def event_generator() -> AsyncGenerator[bytes, None]:
        full_response = ""
        current_messages = list(messages)

        # Own session so the connection lifecycle matches the generator, not the request
        async with async_session() as gen_db:
            try:
                for _ in range(MAX_TOOL_ROUNDS):
                    tool_calls = []
                    round_text = ""
                    assistant_content_from_api = None

                    async for event_type, data in stream_chat_with_tools(
                        current_messages, system_prompt, tools, images=images
                    ):
                        if event_type == "text":
                            round_text += data
                            full_response += data
                            yield _format_sse_event({"type": "token", "content": data})
                        elif event_type == "tool_use":
                            tool_calls.append(data)
                        elif event_type == "assistant_content":
                            assistant_content_from_api = data
                        elif event_type == "search_start":
                            yield _format_sse_event({"type": "search_start", "query": data.get("query", "")})
                        elif event_type == "search_results":
                            yield _format_sse_event({"type": "search_results", "query": data.get("query", ""), "results": data.get("results", [])})

                    if not tool_calls:
                        break

                    # Use full content from API (preserves server_tool_use/web_search blocks)
                    if assistant_content_from_api:
                        current_messages.append({"role": "assistant", "content": assistant_content_from_api})
                    else:
                        assistant_content = []
                        if round_text:
                            assistant_content.append({"type": "text", "text": round_text})
                        for tc in tool_calls:
                            assistant_content.append({
                                "type": "tool_use", "id": tc.id,
                                "name": tc.name, "input": tc.input,
                            })
                        current_messages.append({"role": "assistant", "content": assistant_content})

                    # Execute tools and collect results
                    tool_results, sse_events = await _execute_tools_and_collect(
                        tool_calls, gen_db, note_id,
                    )
                    for evt in sse_events:
                        yield _format_sse_event(evt)
                    current_messages.append({"role": "user", "content": tool_results})

            except Exception as e:
                logger.exception("Chat stream error")
                yield _format_sse_event({"type": "error", "content": str(e)})
                return

            # Save assistant message
            assistant_msg = ConversationMessage(
                thread_id=thread_id, role="assistant", content=full_response,
            )
            gen_db.add(assistant_msg)
            await gen_db.commit()
            await gen_db.refresh(assistant_msg)
            msg_id = assistant_msg.id

        yield _format_sse_event({"type": "done", "thread_id": thread_id, "message_id": msg_id})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


# ── Thread management ─────────────────────────────────────────────────────────


@router.get("/threads", response_model=list[ThreadResponse])
async def list_threads(
    general: bool = Query(False),
    note_id: int | None = Query(None),
    file_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(ConversationThread).where(
        ConversationThread.user_id == current_user.id
    )
    if file_id is not None:
        query = query.where(ConversationThread.file_id == file_id)
    elif note_id is not None:
        query = query.where(ConversationThread.note_id == note_id)
    elif general:
        query = query.where(ConversationThread.note_id.is_(None))
    result = await db.execute(query.order_by(ConversationThread.updated_at.desc()))
    return result.scalars().all()


@router.get("/threads/{thread_id}", response_model=dict)
async def get_thread(
    thread_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    thread = await _get_thread_or_404(db, thread_id, current_user.id)

    result = await db.execute(
        select(ConversationMessage)
        .where(ConversationMessage.thread_id == thread_id)
        .order_by(ConversationMessage.created_at)
    )
    messages = result.scalars().all()

    return {
        "thread": ThreadResponse.model_validate(thread).model_dump(),
        "messages": [MessageResponse.model_validate(m).model_dump() for m in messages],
    }


@router.delete("/threads/{thread_id}", status_code=204)
async def delete_thread(
    thread_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    thread = await _get_thread_or_404(db, thread_id, current_user.id)

    result = await db.execute(
        select(ConversationMessage).where(ConversationMessage.thread_id == thread_id)
    )
    for msg in result.scalars().all():
        await db.delete(msg)

    await db.delete(thread)
    await db.commit()


# ── One-shot evaluation endpoints ─────────────────────────────────────────────


@limiter.limit("20/minute")
@router.post("/evaluate", response_model=EvaluateResponse)
async def evaluate(
    request: Request,
    body: EvaluateRequest,
    current_user: User = Depends(get_current_user),
):
    if body.task not in TASK_PROMPTS:
        raise HTTPException(status_code=400, detail=f"Unknown task: {body.task}. Must be one of: {list(TASK_PROMPTS.keys())}")

    prompt = TASK_PROMPTS[body.task].format(content=body.content)
    result = await evaluate_text(prompt)
    return EvaluateResponse(result=result)


@limiter.limit("20/minute")
@router.post("/selection-action", response_model=SelectionActionResponse)
async def selection_action(
    request: Request,
    body: SelectionActionRequest,
    current_user: User = Depends(get_current_user),
):
    if body.action not in SELECTION_ACTION_PROMPTS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown action: {body.action}. Must be one of: {list(SELECTION_ACTION_PROMPTS.keys())}",
        )

    prompt = SELECTION_ACTION_PROMPTS[body.action].format(text=body.selected_text)
    from app.llm.prompts import VOICE
    system = VOICE
    if body.note_context:
        system += f"\n\nThis passage comes from a larger document:\n{body.note_context[:2000]}"

    result = await evaluate_text(prompt, system_prompt=system)
    return SelectionActionResponse(result=result)
