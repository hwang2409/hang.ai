import logging
import os
import re
import tempfile

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from starlette.responses import Response, FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db
from app.notes.models import Document

logger = logging.getLogger(__name__)

router = APIRouter()

IMAGE_RE = re.compile(r"!\[.*?\]\((.*?)\)")

_BLOCKED_HOSTS = {"localhost", "127.0.0.1", "0.0.0.0", "::1"}
_BLOCKED_PREFIXES = ("10.", "192.168.", "172.16.")
MAX_PROXY_BYTES = 10 * 1024 * 1024  # 10MB


@router.get("/image-proxy")
async def image_proxy(
    url: str = Query(...),
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Proxy external images to avoid hotlink blocking and CORS issues.

    Uses token as query param since <img src> can't send Authorization headers.
    """
    import httpx
    from jose import JWTError, jwt as jose_jwt
    from app.config import settings
    from urllib.parse import urlparse

    try:
        payload = jose_jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        user_id = int(payload.get("sub", 0))
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
    except (JWTError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="Invalid URL scheme")
    hostname = parsed.hostname or ""
    if hostname in _BLOCKED_HOSTS or hostname.startswith(_BLOCKED_PREFIXES):
        raise HTTPException(status_code=400, detail="Blocked host")

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
            resp = await client.get(url, headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "image/*,*/*",
                "Referer": parsed.scheme + "://" + parsed.netloc + "/",
            })
            resp.raise_for_status()

            content_type = resp.headers.get("content-type", "").split(";")[0].strip()
            # Allow image/* and application/octet-stream (some CDNs use this for images)
            if not content_type.startswith("image/") and content_type != "application/octet-stream":
                raise HTTPException(status_code=400, detail=f"Not an image: {content_type}")
            # Default to image/jpeg for octet-stream
            if content_type == "application/octet-stream":
                content_type = "image/jpeg"

            data = resp.content
            if len(data) > MAX_PROXY_BYTES:
                raise HTTPException(status_code=400, detail="Image too large")

            return Response(
                content=data,
                media_type=content_type,
                headers={
                    "Cache-Control": "public, max-age=86400",
                    "Access-Control-Allow-Origin": "*",
                },
            )
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Upstream error: {e.response.status_code}")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch: {str(e)}")


@router.get("/export/markdown-zip")
async def export_markdown_zip(
    background_tasks: BackgroundTasks,
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Export all user notes as a zip of markdown files."""
    import zipfile
    from jose import JWTError, jwt as jose_jwt
    from app.config import settings

    try:
        payload = jose_jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        user_id = int(payload.get("sub", 0))
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
    except (JWTError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")

    result = await db.execute(
        select(Document).where(
            Document.user_id == user_id,
            Document.deleted == False,  # noqa: E712
            Document.type == "text",
        )
    )
    docs = result.scalars().all()

    if not docs:
        raise HTTPException(status_code=404, detail="No text notes to export")

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
    try:
        with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as zf:
            seen_names = {}
            for doc in docs:
                safe_title = re.sub(r'[^\w\s-]', '', doc.title or 'Untitled').strip().replace(' ', '_')[:60]
                if not safe_title:
                    safe_title = f"note_{doc.id}"
                # Handle duplicate names
                if safe_title in seen_names:
                    seen_names[safe_title] += 1
                    safe_title = f"{safe_title}_{seen_names[safe_title]}"
                else:
                    seen_names[safe_title] = 0
                filename = f"{safe_title}.md"

                # Build markdown content with frontmatter
                content_parts = [f"# {doc.title or 'Untitled'}\n\n"]
                if doc.content:
                    content_parts.append(doc.content)
                zf.writestr(filename, "".join(content_parts))
        tmp.close()
    except Exception:
        tmp.close()
        os.unlink(tmp.name)
        raise HTTPException(status_code=500, detail="Failed to create zip")

    background_tasks.add_task(os.unlink, tmp.name)
    return FileResponse(
        tmp.name,
        media_type="application/zip",
        filename="hang-notes-export.zip",
        headers={"Content-Disposition": 'attachment; filename="hang-notes-export.zip"'},
    )


_PDF_CSS = """
body { font-family: Georgia, 'Times New Roman', serif; font-size: 11pt; color: #1a1a1a; line-height: 1.5; margin: 0; padding: 36px; }
h1 { font-size: 20pt; font-weight: 600; margin-top: 0; margin-bottom: 2px; color: #111; }
h2 { font-size: 15pt; font-weight: 600; margin-top: 16px; margin-bottom: 4px; color: #222; }
h3 { font-size: 12pt; font-weight: 600; margin-top: 12px; margin-bottom: 4px; color: #333; }
h4, h5, h6 { font-size: 11pt; font-weight: 600; margin-top: 10px; margin-bottom: 2px; }
p { margin: 4px 0; }
div { margin: 4px 0; }
.subtitle { font-size: 9pt; color: #888; margin-bottom: 16px; border-bottom: 1px solid #ddd; padding-bottom: 8px; }
table { border-collapse: collapse; width: 100%; margin: 8px 0; }
th, td { border: 1px solid #ccc; padding: 5px 8px; text-align: left; font-size: 10pt; }
th { background-color: #f5f5f5; font-weight: 600; }
pre { background-color: #f5f5f5; padding: 8px 10px; border-radius: 4px; font-size: 9pt; overflow-x: auto; margin: 6px 0; }
code { font-family: 'Courier New', monospace; font-size: 9pt; background-color: #f0f0f0; padding: 1px 4px; border-radius: 2px; }
pre code { background: none; padding: 0; }
blockquote { border-left: 3px solid #ccc; margin: 8px 0; padding: 2px 14px; color: #555; }
ul, ol { padding-left: 20px; margin: 4px 0; }
li { margin: 2px 0; }
hr { border: none; border-top: 1px solid #ddd; margin: 12px 0; }
img { margin: 2px 0; }
"""


def _latex_to_img(latex_str: str, display: bool = False) -> str:
    """Render a LaTeX expression to a base64 PNG <img> tag."""
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        from io import BytesIO
        import base64

        fontsize = 13 if display else 10
        dpi = 120

        fig, ax = plt.subplots(figsize=(0.01, 0.01))
        ax.axis('off')
        ax.text(0, 0, f"${latex_str.strip()}$", fontsize=fontsize,
                ha='left', va='bottom', transform=ax.transAxes)

        buf = BytesIO()
        fig.savefig(buf, format='png', dpi=dpi, bbox_inches='tight',
                    pad_inches=0.03, transparent=False, facecolor='white')
        plt.close(fig)
        buf.seek(0)
        b64 = base64.b64encode(buf.read()).decode('ascii')
        uri = f'data:image/png;base64,{b64}'

        if display:
            return f'<div style="text-align:center;margin:4px 0;padding:0"><img src="{uri}" style="max-width:80%"></div>'
        else:
            return f'<img src="{uri}" style="vertical-align:middle;height:14px">'
    except Exception:
        escaped = latex_str.strip().replace('<', '&lt;').replace('>', '&gt;')
        if display:
            return f'<div style="text-align:center;margin:8px 0;font-family:monospace">{escaped}</div>'
        return f'<code>{escaped}</code>'


def _preprocess_latex(content: str) -> str:
    """Convert LaTeX $$...$$ and $...$ to rendered PNG images."""
    # Block math: $$...$$ (including multiline)
    content = re.sub(
        r'\$\$(.*?)\$\$',
        lambda m: _latex_to_img(m.group(1), display=True),
        content,
        flags=re.DOTALL,
    )
    # Inline math: $...$ (not $$)
    content = re.sub(
        r'(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)',
        lambda m: _latex_to_img(m.group(1), display=False),
        content,
    )
    return content


@router.get("/{doc_id}/export/pdf")
async def export_pdf(
    doc_id: int,
    background_tasks: BackgroundTasks,
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Export a text note as a styled PDF."""
    try:
        from jose import JWTError, jwt as jose_jwt
        from app.config import settings
        try:
            payload = jose_jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
            user_id = int(payload.get("sub", 0))
            if not user_id:
                raise HTTPException(status_code=401, detail="Invalid token")
        except (JWTError, ValueError):
            raise HTTPException(status_code=401, detail="Invalid token")

        result = await db.execute(
            select(Document).where(
                Document.id == doc_id,
                Document.user_id == user_id,
                Document.deleted == False,  # noqa: E712
            )
        )
        doc = result.scalar_one_or_none()
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        if doc.type in ("canvas", "moodboard"):
            raise HTTPException(status_code=400, detail="PDF export is only available for text notes")

        import markdown as md
        from xhtml2pdf import pisa

        processed = _preprocess_latex(doc.content or "")
        html_body = md.markdown(
            processed,
            extensions=["tables", "fenced_code", "codehilite"],
        )

        title = doc.title or "Untitled"
        html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>{_PDF_CSS}</style></head>
<body>
<h1>{title}</h1>
<div class="subtitle">Exported from Hang.ai</div>
{html_body}
</body></html>"""

        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
        pisa_status = pisa.CreatePDF(html, dest=tmp)
        tmp.close()
        if pisa_status.err:
            os.unlink(tmp.name)
            raise HTTPException(status_code=500, detail="PDF generation failed")

        safe_title = re.sub(r'[^\w\s-]', '', title).strip().replace(' ', '_')[:60]
        filename = f"{safe_title}.pdf"

        background_tasks.add_task(os.unlink, tmp.name)
        return FileResponse(
            tmp.name,
            media_type="application/pdf",
            filename=filename,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"PDF export failed for doc {doc_id}")
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {e}")
