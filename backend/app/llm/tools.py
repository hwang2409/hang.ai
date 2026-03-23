import json
import re
import secrets
from urllib.parse import urlparse

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.notes.models import Document
from app.llm.canvas import (
    generate_text_element,
    generate_image_element,
    fetch_image_as_dataurl,
    find_non_overlapping_position,
    _estimate_text_dimensions,
)


_BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def _is_pinterest_cdn_url(url: str) -> bool:
    """Check if URL is a Pinterest CDN direct image URL."""
    parsed = urlparse(url)
    hostname = parsed.hostname or ""
    return hostname == "i.pinimg.com"

WEB_SEARCH_TOOL = {
    "type": "web_search_20250305",
    "name": "web_search",
    "max_uses": 5,
}

SEARCH_IMAGES_TOOL = {
    "name": "search_images",
    "description": "Search for images on the web. Returns direct image URLs. Use site:pinterest.com for best visual results.",
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Search query"},
            "num_results": {"type": "integer", "description": "Number of results (default 10, max 20)"},
        },
        "required": ["query"],
    },
}

SEARCH_NOTES_TOOL = {
    "name": "search_notes",
    "description": "Search the user's notes and flashcards for relevant information. Use when the user asks about something they may have studied, or when you need to reference their existing knowledge base.",
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Search query to find relevant notes"}
        },
        "required": ["query"]
    }
}


async def _handle_search_images(tool_call) -> tuple[str, list[dict]]:
    """Query SearXNG for image results and return direct image URLs."""
    query = tool_call.input.get("query", "")
    num_results = min(tool_call.input.get("num_results", 10), 20)

    url = f"{settings.SEARXNG_URL}/search"
    params = {
        "q": query,
        "format": "json",
        "categories": "images",
        "pageno": 1,
    }

    try:
        headers = {"X-Forwarded-For": "127.0.0.1"}
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url, params=params, headers=headers)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        return json.dumps({"error": f"Search failed: {e}"}), []

    results = []
    for item in data.get("results", []):
        img_src = item.get("img_src", "")
        if not img_src or not img_src.startswith("http"):
            continue
        results.append({
            "img_src": img_src,
            "title": item.get("title", ""),
            "source_url": item.get("url", ""),
        })
        if len(results) >= num_results:
            break

    return json.dumps(results), []

CANVAS_EDIT_TOOL = {
    "name": "edit_canvas",
    "description": (
        "Edit the user's canvas (whiteboard) by adding text, adding images, updating, or deleting elements. "
        "Provide an array of operations to perform."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "operations": {
                "type": "array",
                "description": "List of operations to perform on the canvas",
                "items": {
                    "type": "object",
                    "properties": {
                        "type": {
                            "type": "string",
                            "enum": ["add_text", "add_image", "update_text", "delete"],
                            "description": "The operation type",
                        },
                        "text": {
                            "type": "string",
                            "description": "Text content (for add_text and update_text)",
                        },
                        "url": {
                            "type": "string",
                            "description": "Direct image URL (for add_image). Must be a direct link to an image file.",
                        },
                        "element_id": {
                            "type": "string",
                            "description": "ID of existing element (for update_text and delete)",
                        },
                        "x": {
                            "type": "number",
                            "description": "X coordinate (for add_text and add_image)",
                        },
                        "y": {
                            "type": "number",
                            "description": "Y coordinate (for add_text and add_image)",
                        },
                        "width": {
                            "type": "number",
                            "description": "Width in pixels (for add_image, default 400)",
                        },
                        "height": {
                            "type": "number",
                            "description": "Height in pixels (for add_image, default 300)",
                        },
                        "fontSize": {
                            "type": "integer",
                            "description": "Font size in pixels (for add_text, default 20)",
                        },
                    },
                    "required": ["type"],
                },
            },
        },
        "required": ["operations"],
    },
}

MOODBOARD_EDIT_TOOL = {
    "name": "edit_moodboard",
    "description": (
        "Edit the user's moodboard by adding images, adding text cards, removing items, or updating captions. "
        "Provide an array of operations to perform."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "operations": {
                "type": "array",
                "description": "List of operations to perform on the moodboard",
                "items": {
                    "type": "object",
                    "properties": {
                        "type": {
                            "type": "string",
                            "enum": ["add_image", "add_text", "remove", "update_caption"],
                            "description": "The operation type",
                        },
                        "url": {
                            "type": "string",
                            "description": "Direct image URL (for add_image). Use img_src URLs from search_images results.",
                        },
                        "caption": {
                            "type": "string",
                            "description": "Caption for the image (for add_image, update_caption)",
                        },
                        "content": {
                            "type": "string",
                            "description": "Text content (for add_text)",
                        },
                        "color": {
                            "type": "string",
                            "description": "Background color hex (for add_text, default #1a1a2e)",
                        },
                        "width": {
                            "type": "integer",
                            "enum": [1, 2],
                            "description": "Width: 1 for normal, 2 for full-width (default 1)",
                        },
                        "item_id": {
                            "type": "string",
                            "description": "ID of existing item (for remove, update_caption)",
                        },
                    },
                    "required": ["type"],
                },
            },
        },
        "required": ["operations"],
    },
}

NOTE_EDIT_TOOL = {
    "name": "edit_note",
    "description": (
        "Edit the user's note by replacing its content with updated markdown. "
        "Use this when the user asks you to add a section, modify content, "
        "or make any changes to their note. Provide the COMPLETE updated note content."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "content": {
                "type": "string",
                "description": "The complete updated note content in markdown format",
            }
        },
        "required": ["content"],
    },
}


async def _handle_edit_note(tool_call, db: AsyncSession, note_id: int) -> tuple[str, list[dict]]:
    new_content = tool_call.input.get("content", "")
    result = await db.execute(select(Document).where(Document.id == note_id))
    doc = result.scalar_one_or_none()
    if doc:
        doc.content = new_content
        await db.commit()
    sse_events = [{"type": "note_edit", "content": new_content}]
    return "Note updated successfully.", sse_events


def _apply_add_text(op, canvas_elements, result_ops, summaries):
    """Handle an add_text canvas operation."""
    text = op.get("text", "")
    x = op.get("x", 100)
    y = op.get("y", 100)
    font_size = op.get("fontSize", 20)
    est_w, est_h = _estimate_text_dimensions(text, font_size)
    x, y = find_non_overlapping_position(canvas_elements, x, y, est_w, est_h)
    element = generate_text_element(text, x, y, font_size=font_size)
    # Track so subsequent adds in same batch don't overlap each other
    canvas_elements.append({"x": x, "y": y, "width": est_w, "height": est_h, "isDeleted": False})
    result_ops.append({"op": "add", "element": element})
    summaries.append(f"Added text \"{text}\" at ({x:.0f}, {y:.0f})")


async def _apply_add_image(op, canvas_elements, result_ops, summaries):
    """Handle an add_image canvas operation."""
    url = op.get("url", "")
    x = op.get("x", 100)
    y = op.get("y", 100)
    width = op.get("width", 400)
    height = op.get("height", 300)
    try:
        data_url, mime_type = await fetch_image_as_dataurl(url)
        file_id = secrets.token_hex(8)
        x, y = find_non_overlapping_position(canvas_elements, x, y, width, height)
        element = generate_image_element(file_id, x, y, width, height)
        file_entry = {
            file_id: {
                "id": file_id,
                "dataURL": data_url,
                "mimeType": mime_type,
                "created": 1,
            }
        }
        canvas_elements.append({"x": x, "y": y, "width": width, "height": height, "isDeleted": False})
        result_ops.append({"op": "add", "element": element, "files": file_entry})
        summaries.append(f"Added image at ({x:.0f}, {y:.0f})")
    except Exception as e:
        summaries.append(f"Failed to add image: {e}")


def _apply_update_text(op, result_ops, summaries):
    """Handle an update_text canvas operation."""
    element_id = op.get("element_id", "")
    text = op.get("text")
    updates = {}
    if text is not None:
        updates["text"] = text
        updates["originalText"] = text
    result_ops.append({"op": "update", "element_id": element_id, "updates": updates})
    summaries.append(f"Updated element {element_id}")


def _apply_delete(op, result_ops, summaries):
    """Handle a delete canvas operation."""
    element_id = op.get("element_id", "")
    result_ops.append({"op": "delete", "element_id": element_id})
    summaries.append(f"Deleted element {element_id}")


async def _handle_edit_canvas(tool_call, db: AsyncSession, note_id: int) -> tuple[str, list[dict]]:
    operations = tool_call.input.get("operations", [])

    # Read current canvas state for collision avoidance
    result = await db.execute(select(Document).where(Document.id == note_id))
    doc = result.scalar_one_or_none()
    canvas_elements = []
    if doc and doc.content:
        try:
            canvas = json.loads(doc.content)
            canvas_elements = list(canvas.get("elements", []))
        except (json.JSONDecodeError, TypeError):
            pass

    result_ops = []
    summaries = []

    for op in operations:
        if not isinstance(op, dict):
            continue
        op_type = op.get("type")

        if op_type == "add_text":
            _apply_add_text(op, canvas_elements, result_ops, summaries)
        elif op_type == "add_image":
            await _apply_add_image(op, canvas_elements, result_ops, summaries)
        elif op_type == "update_text":
            _apply_update_text(op, result_ops, summaries)
        elif op_type == "delete":
            _apply_delete(op, result_ops, summaries)

    sse_events = [{"type": "canvas_edit", "operations": result_ops}]
    return "; ".join(summaries) or "No operations performed.", sse_events


async def _handle_edit_moodboard(tool_call, db: AsyncSession, note_id: int) -> tuple[str, list[dict]]:
    operations = tool_call.input.get("operations", [])

    result = await db.execute(select(Document).where(Document.id == note_id))
    doc = result.scalar_one_or_none()
    if not doc:
        return "Moodboard not found.", []

    try:
        data = json.loads(doc.content or "{}")
    except (json.JSONDecodeError, TypeError):
        data = {}
    items = list(data.get("items", []))
    settings = data.get("settings", {"columns": 3, "gap": 12})

    result_ops = []
    summaries = []

    for op in operations:
        if not isinstance(op, dict):
            continue
        op_type = op.get("type")

        if op_type == "add_image":
            url = op.get("url", "")
            # SSRF checks
            parsed = urlparse(url)
            if parsed.scheme not in ("http", "https"):
                summaries.append(f"Skipped invalid URL scheme: {parsed.scheme}")
                continue
            hostname = parsed.hostname or ""
            if hostname in ("localhost", "127.0.0.1", "0.0.0.0", "::1") or hostname.startswith(("10.", "192.168.", "172.16.")):
                summaries.append("Skipped private network URL")
                continue

            # Skip server-side validation for Pinterest CDN (browser loads them fine)
            if not _is_pinterest_cdn_url(url):
                # Verify image is actually fetchable
                try:
                    async with httpx.AsyncClient(follow_redirects=True, timeout=10) as client:
                        fetch_headers = {
                            "User-Agent": _BROWSER_HEADERS["User-Agent"],
                            "Accept": "image/*,*/*",
                        }
                        resp = await client.head(url, headers=fetch_headers)
                        if resp.status_code >= 400:
                            fetch_headers["Range"] = "bytes=0-1023"
                            resp = await client.get(url, headers=fetch_headers)
                        if resp.status_code >= 400:
                            summaries.append(f"FAILED to fetch image (HTTP {resp.status_code}): {url[:60]} — try a different URL from a different source")
                            continue
                        ct = resp.headers.get("content-type", "").split(";")[0].strip()
                        if ct and not ct.startswith("image/") and ct != "application/octet-stream":
                            summaries.append(f"FAILED: URL returned {ct}, not an image: {url[:60]} — use a direct image URL")
                            continue
                except Exception as e:
                    summaries.append(f"FAILED to fetch image ({e}): {url[:60]} — try a different URL")
                    continue

            item_id = secrets.token_hex(4)
            item = {
                "id": item_id,
                "type": "image",
                "url": url,
                "caption": op.get("caption", ""),
                "width": op.get("width", 1),
                "order": len(items),
            }
            items.append(item)
            result_ops.append({"type": "add_image", "id": item_id, "url": url, "caption": item["caption"], "width": item["width"]})
            summaries.append(f"Added image: {url[:60]}")

        elif op_type == "add_text":
            item_id = secrets.token_hex(4)
            item = {
                "id": item_id,
                "type": "text",
                "content": op.get("content", ""),
                "color": op.get("color", "#1a1a2e"),
                "width": op.get("width", 1),
                "order": len(items),
            }
            items.append(item)
            result_ops.append({"type": "add_text", "id": item_id, "content": item["content"], "color": item["color"], "width": item["width"]})
            summaries.append(f"Added text card: {item['content'][:40]}")

        elif op_type == "remove":
            item_id = op.get("item_id", "")
            before_len = len(items)
            items = [i for i in items if i["id"] != item_id]
            if len(items) < before_len:
                result_ops.append({"type": "remove", "item_id": item_id})
                summaries.append(f"Removed item {item_id}")
            else:
                summaries.append(f"Item {item_id} not found")

        elif op_type == "update_caption":
            item_id = op.get("item_id", "")
            caption = op.get("caption", "")
            found = False
            for item in items:
                if item["id"] == item_id:
                    item["caption"] = caption
                    found = True
                    break
            if found:
                result_ops.append({"type": "update_caption", "item_id": item_id, "caption": caption})
                summaries.append(f"Updated caption for {item_id}")
            else:
                summaries.append(f"Item {item_id} not found")

    doc.content = json.dumps({"items": items, "settings": settings})
    await db.commit()

    sse_events = [{"type": "moodboard_edit", "operations": result_ops}]
    return "; ".join(summaries) or "No operations performed.", sse_events


async def _handle_search_notes(tool_call, db: AsyncSession, user_id: int) -> tuple[str, list[dict]]:
    """Search user's notes via RAG retrieval and return results."""
    from app.llm.context import retrieve_relevant_notes

    query = tool_call.input.get("query", "")
    results = await retrieve_relevant_notes(db, user_id, query, limit=5)

    if not results:
        return "No matching notes found.", []

    lines = []
    for n in results:
        lines.append(f"[Note: {n['title']}] (id:{n['id']}, score:{n['score']})\n{n['snippet']}")
    result_text = "\n\n".join(lines)

    sse_events = [{"type": "notes_search", "results": results}]
    return result_text, sse_events


async def execute_tool(
    tool_call, db: AsyncSession, note_id: int | None, user_id: int | None = None,
) -> tuple[str, list[dict]]:
    """Execute a tool call. Returns (result_text, sse_events_to_emit)."""
    if tool_call.name == "edit_note" and note_id:
        return await _handle_edit_note(tool_call, db, note_id)
    if tool_call.name == "edit_canvas" and note_id:
        return await _handle_edit_canvas(tool_call, db, note_id)
    if tool_call.name == "edit_moodboard" and note_id:
        return await _handle_edit_moodboard(tool_call, db, note_id)
    if tool_call.name == "search_images":
        return await _handle_search_images(tool_call)
    if tool_call.name == "search_notes" and user_id:
        return await _handle_search_notes(tool_call, db, user_id)
    return "Unknown tool.", []
