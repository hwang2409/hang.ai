"""Parse Excalidraw canvas JSON into text summaries and extracted images."""

import json
import base64
import random
import secrets
from typing import Optional
from urllib.parse import urlparse

import httpx


MAX_IMAGES = 5
MAX_IMAGE_BYTES = 2 * 1024 * 1024  # 2 MB


def parse_canvas_content(canvas_json_str: str) -> tuple[str, list[dict]]:
    """Extract readable text and images from Excalidraw JSON.

    Returns (text_summary, images) where images is a list of
    {"media_type": str, "data": str (base64), "label": str}.
    """
    try:
        canvas = json.loads(canvas_json_str)
    except (json.JSONDecodeError, TypeError):
        return ("(Could not parse canvas content)", [])

    elements = canvas.get("elements", [])
    files = canvas.get("files", {})

    text_summary = _extract_text(elements)
    images = _extract_images(elements, files)

    return (text_summary, images)


_SHAPE_TYPES = {"rectangle", "diamond", "ellipse", "arrow", "line", "image", "freedraw"}


def _extract_text(elements: list[dict]) -> str:
    """Collect text and layout info from non-deleted elements, sorted in reading order."""
    text_elements = []
    shape_elements = []
    for el in elements:
        if el.get("isDeleted"):
            continue
        text = el.get("text")
        if text and text.strip():
            y = el.get("y", 0)
            x = el.get("x", 0)
            w = el.get("width", 0)
            h = el.get("height", 0)
            # Quantize Y to nearest 100px for band-based reading order
            y_band = round(y / 100) * 100
            el_id = el.get("id", "")
            text_elements.append((y_band, x, text.strip(), el.get("type", "text"), el_id, w, h))
        elif el.get("type") in _SHAPE_TYPES:
            x = el.get("x", 0)
            y = el.get("y", 0)
            w = el.get("width", 0)
            h = el.get("height", 0)
            shape_elements.append((el.get("type"), x, y, w, h))

    if not text_elements and not shape_elements:
        return "(Empty canvas)"

    lines = []

    if text_elements:
        text_elements.sort(key=lambda t: (t[0], t[1]))
        lines.append("Text elements (top to bottom, left to right):")
        current_band: Optional[int] = None
        for y_band, x, text, el_type, el_id, w, h in text_elements:
            if current_band is not None and y_band != current_band:
                lines.append("")  # visual separator between Y-bands
            current_band = y_band
            lines.append(f'- [id:{el_id}] "{text}" at ({x}, {y_band}) size {w:.0f}x{h:.0f}')
    else:
        lines.append("(No text on canvas)")

    if shape_elements:
        lines.append("")
        lines.append("Other elements (shapes/drawings):")
        for etype, x, y, w, h in shape_elements:
            lines.append(f"- {etype} at ({x:.0f}, {y:.0f}) size {w:.0f}x{h:.0f}")

    return "\n".join(lines)


def _extract_images(elements: list[dict], files: dict) -> list[dict]:
    """Extract base64 image data from Excalidraw files, with position context."""
    if not files:
        return []

    # Build a map from fileId -> nearest text label
    image_elements = {}
    text_elements = []
    for el in elements:
        if el.get("isDeleted"):
            continue
        if el.get("type") == "image" and el.get("fileId"):
            image_elements[el["fileId"]] = {
                "x": el.get("x", 0),
                "y": el.get("y", 0),
            }
        if el.get("text") and el["text"].strip():
            text_elements.append({
                "x": el.get("x", 0),
                "y": el.get("y", 0),
                "text": el["text"].strip(),
            })

    images = []
    for file_id, file_data in files.items():
        if len(images) >= MAX_IMAGES:
            break

        data_url = file_data.get("dataURL", "")
        if not data_url or "base64," not in data_url:
            continue

        # Parse "data:image/png;base64,XXXX"
        header, b64_data = data_url.split("base64,", 1)
        media_type = header.split("data:", 1)[-1].rstrip(";").strip()
        if not media_type:
            media_type = "image/png"

        # Size check
        try:
            raw = base64.b64decode(b64_data)
            if len(raw) > MAX_IMAGE_BYTES:
                continue
        except Exception:
            continue

        # Find nearest text for label
        label = _find_nearest_text(file_id, image_elements, text_elements)

        images.append({
            "media_type": media_type,
            "data": b64_data,
            "label": label,
        })

    return images


def _find_nearest_text(
    file_id: str,
    image_elements: dict[str, dict],
    text_elements: list[dict],
) -> str:
    """Find the nearest text element to an image for labeling."""
    pos = image_elements.get(file_id)
    if not pos or not text_elements:
        return "Canvas image"

    ix, iy = pos["x"], pos["y"]
    best_text = "Canvas image"
    best_dist = float("inf")
    for te in text_elements:
        dist = ((te["x"] - ix) ** 2 + (te["y"] - iy) ** 2) ** 0.5
        if dist < best_dist:
            best_dist = dist
            best_text = f"Image near '{te['text'][:50]}'"

    return best_text


def _estimate_text_dimensions(text: str, font_size: int = 20) -> tuple[float, float]:
    """Rough estimate of text element dimensions for collision detection."""
    lines = text.split("\n")
    max_chars = max((len(line) for line in lines), default=1)
    width = max_chars * font_size * 0.6
    height = len(lines) * font_size * 1.25
    return max(width, 20), max(height, font_size * 1.25)


def find_non_overlapping_position(
    elements: list[dict],
    x: float,
    y: float,
    est_w: float,
    est_h: float,
    padding: float = 20,
) -> tuple[float, float]:
    """Nudge (x, y) downward until it doesn't overlap any existing element."""
    bboxes = []
    for el in elements:
        if el.get("isDeleted"):
            continue
        ex = el.get("x", 0)
        ey = el.get("y", 0)
        ew = el.get("width", 0)
        eh = el.get("height", 0)
        if ew <= 0 and eh <= 0:
            continue
        bboxes.append((ex - padding, ey - padding, ew + 2 * padding, eh + 2 * padding))

    def overlaps(nx: float, ny: float) -> bool:
        for bx, by, bw, bh in bboxes:
            if nx < bx + bw and nx + est_w > bx and ny < by + bh and ny + est_h > by:
                return True
        return False

    if not overlaps(x, y):
        return x, y

    # Nudge downward in increments
    for dy in range(0, 2000, 40):
        if not overlaps(x, y + dy):
            return x, y + dy

    # Fallback: place below everything
    max_bottom = max((by + bh for bx, by, bw, bh in bboxes), default=0)
    return x, max_bottom + padding


def _base_element(x: float, y: float, width: float, height: float) -> dict:
    """Common Excalidraw element fields."""
    return {
        "id": secrets.token_hex(4),
        "x": x,
        "y": y,
        "width": width,
        "height": height,
        "angle": 0,
        "strokeColor": "transparent",
        "backgroundColor": "transparent",
        "fillStyle": "solid",
        "strokeWidth": 1,
        "strokeStyle": "solid",
        "roughness": 1,
        "opacity": 100,
        "groupIds": [],
        "frameId": None,
        "index": None,
        "roundness": None,
        "seed": random.randint(1, 2_000_000_000),
        "version": 1,
        "versionNonce": random.randint(1, 2_000_000_000),
        "isDeleted": False,
        "boundElements": None,
        "updated": 1,
        "link": None,
        "locked": False,
    }


def generate_text_element(
    text: str,
    x: float,
    y: float,
    font_size: int = 20,
    color: str = "#1e1e1e",
) -> dict:
    """Return a complete valid Excalidraw text element dict."""
    est_w, est_h = _estimate_text_dimensions(text, font_size)
    element = _base_element(x, y, est_w, est_h)
    element.update({
        "type": "text",
        "strokeColor": color,
        "text": text,
        "originalText": text,
        "autoResize": True,
        "fontSize": font_size,
        "fontFamily": 5,
        "textAlign": "left",
        "verticalAlign": "top",
        "containerId": None,
        "lineHeight": 1.25,
    })
    return element


async def fetch_image_as_dataurl(url: str) -> tuple[str, str]:
    """Fetch image from URL. Returns (dataURL, mimeType).

    Raises ValueError on non-image responses or oversized files.
    """
    # Validate URL scheme
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"Invalid URL scheme: {parsed.scheme}")

    # Block private/internal IPs
    hostname = parsed.hostname or ""
    if hostname in ("localhost", "127.0.0.1", "0.0.0.0", "::1") or hostname.startswith("10.") or hostname.startswith("192.168.") or hostname.startswith("172.16."):
        raise ValueError("Cannot fetch images from private networks")

    async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
        resp = await client.get(url)
        resp.raise_for_status()

        content_type = resp.headers.get("content-type", "").split(";")[0].strip()
        if not content_type.startswith("image/"):
            raise ValueError(f"URL is not an image ({content_type})")

        data = resp.content
        if len(data) > MAX_IMAGE_BYTES:
            raise ValueError(f"Image too large ({len(data)} bytes, max {MAX_IMAGE_BYTES})")

        b64 = base64.b64encode(data).decode()
        data_url = f"data:{content_type};base64,{b64}"
        return data_url, content_type


def generate_image_element(
    file_id: str,
    x: float,
    y: float,
    width: float = 400,
    height: float = 300,
) -> dict:
    """Return a complete valid Excalidraw image element dict."""
    element = _base_element(x, y, width, height)
    element.update({
        "type": "image",
        "fileId": file_id,
        "status": "saved",
        "scale": [1, 1],
    })
    return element
