import json

import httpx
import anthropic
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.config import settings
from app.deps import get_admin_user
from app.auth.models import User

router = APIRouter()

client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY) if settings.ANTHROPIC_API_KEY else None


class ImageSearchRequest(BaseModel):
    prompt: str
    num_results: int = 20
    pinterest_first: bool = True


class ImageResult(BaseModel):
    img_src: str
    title: str
    source_url: str
    thumbnail: str = ""


class ImageSearchResponse(BaseModel):
    query: str
    keywords: list[str]
    results: list[ImageResult]


async def _search_searxng(query: str, num_results: int = 20) -> list[dict]:
    """Search SearXNG for images."""
    params = {
        "q": query,
        "format": "json",
        "categories": "images",
        "pageno": 1,
    }
    headers = {"X-Forwarded-For": "127.0.0.1"}
    async with httpx.AsyncClient(timeout=15) as http:
        resp = await http.get(f"{settings.SEARXNG_URL}/search", params=params, headers=headers)
        resp.raise_for_status()
        data = resp.json()

    results = []
    for item in data.get("results", []):
        img_src = item.get("img_src", "")
        if not img_src or not img_src.startswith("http"):
            continue
        results.append({
            "img_src": img_src,
            "title": item.get("title", ""),
            "source_url": item.get("url", ""),
            "thumbnail": item.get("thumbnail_src", item.get("img_src", "")),
        })
        if len(results) >= num_results:
            break
    return results


def _extract_keywords(prompt: str) -> list[str]:
    """Use Claude to extract image search keywords from a natural language prompt."""
    if not client:
        return [prompt]

    response = client.messages.create(
        model=settings.CLAUDE_MODEL,
        max_tokens=256,
        system=(
            "You extract image search keywords from user prompts. "
            "Return a JSON array of 1-3 search query strings, optimized for Google Images. "
            "Keep queries concise (2-5 words each). "
            "Return ONLY the JSON array, no other text."
        ),
        messages=[{"role": "user", "content": prompt}],
    )
    text = response.content[0].text.strip()
    try:
        keywords = json.loads(text)
        if isinstance(keywords, list):
            return [str(k) for k in keywords[:3]]
    except json.JSONDecodeError:
        pass
    return [prompt]


@router.post("/imagesearch", response_model=ImageSearchResponse)
async def search_images(
    body: ImageSearchRequest,
    admin: User = Depends(get_admin_user),
):
    """AI-powered image search (admin only)."""
    keywords = _extract_keywords(body.prompt)

    all_results = []
    seen_urls = set()
    per_query = max(body.num_results // len(keywords), 5)

    for kw in keywords:
        query = f"{kw} site:pinterest.com" if body.pinterest_first else kw
        results = await _search_searxng(query, per_query)

        if body.pinterest_first and len(results) < 3:
            results = await _search_searxng(kw, per_query)

        for r in results:
            if r["img_src"] not in seen_urls:
                seen_urls.add(r["img_src"])
                all_results.append(r)

    return ImageSearchResponse(
        query=body.prompt,
        keywords=keywords,
        results=all_results[:body.num_results],
    )


@router.get("/imagesearch/direct")
async def direct_search(
    q: str = Query(..., description="Search query"),
    n: int = Query(20, description="Number of results"),
    admin: User = Depends(get_admin_user),
):
    """Direct SearXNG image search, no LLM (admin only)."""
    results = await _search_searxng(q, n)
    return {"query": q, "results": results}
