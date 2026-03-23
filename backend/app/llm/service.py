import asyncio
from typing import AsyncGenerator

import anthropic

from app.config import settings


class ApiKeyRequiredError(Exception):
    """Raised when no API key is available for LLM calls."""
    pass


_default_client: anthropic.AsyncAnthropic | None = None
if settings.ANTHROPIC_API_KEY:
    _default_client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

_llm_semaphore = asyncio.Semaphore(20)

from app.llm.prompts import VOICE

DEFAULT_SYSTEM = VOICE


def _get_client(api_key: str | None = None) -> anthropic.AsyncAnthropic:
    if api_key:
        return anthropic.AsyncAnthropic(api_key=api_key)
    if _default_client is not None:
        return _default_client
    raise ApiKeyRequiredError("An Anthropic API key is required. Add your key in Settings.")


async def stream_chat(
    messages: list[dict], system_prompt: str = "", api_key: str | None = None,
) -> AsyncGenerator[str, None]:
    """Yield text chunks from Claude streaming response."""
    system = system_prompt or DEFAULT_SYSTEM
    c = _get_client(api_key)
    async with _llm_semaphore:
        async with c.messages.stream(
            model=settings.CLAUDE_MODEL,
            max_tokens=4096,
            system=system,
            messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                yield text


async def stream_chat_with_tools(
    messages: list[dict],
    system_prompt: str = "",
    tools: list[dict] | None = None,
    images: list[dict] | None = None,
    api_key: str | None = None,
) -> AsyncGenerator[tuple[str, object], None]:
    """Yield (event_type, data) tuples — 'text' for chunks, 'tool_use' for tool calls,
    'search_start'/'search_results' for built-in web search lifecycle."""
    system = system_prompt or DEFAULT_SYSTEM
    kwargs = {
        "model": settings.CLAUDE_MODEL,
        "max_tokens": 4096,
        "messages": messages,
    }
    kwargs["system"] = system
    if images:
        # Anthropic API only supports images in user messages, not system.
        # Prepend image blocks to the first user message's content.
        messages = list(messages)  # shallow copy to avoid mutating caller's list
        for i, msg in enumerate(messages):
            if msg["role"] == "user":
                original_content = msg["content"]
                image_blocks = []
                for img in images:
                    if img.get("label"):
                        image_blocks.append({"type": "text", "text": f"[{img['label']}]"})
                    image_blocks.append({
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": img["media_type"],
                            "data": img["data"],
                        },
                    })
                # Combine image blocks + original text
                if isinstance(original_content, str):
                    image_blocks.append({"type": "text", "text": original_content})
                elif isinstance(original_content, list):
                    image_blocks.extend(original_content)
                messages[i] = {**msg, "content": image_blocks}
                break  # only inject into the first user message
        kwargs["messages"] = messages
    if tools:
        kwargs["tools"] = tools

    c = _get_client(api_key)
    final_message = None
    async with _llm_semaphore:
        async with c.messages.stream(**kwargs) as stream:
            async for event in stream:
                # Built-in web search: server_tool_use starts a search
                if event.type == "content_block_start":
                    block = getattr(event, "content_block", None)
                    if block and block.type == "server_tool_use":
                        query = ""
                        if hasattr(block, "input") and isinstance(block.input, dict):
                            query = block.input.get("query", "")
                        yield ("search_start", {"query": query})
                # Built-in web search: result block
                elif event.type == "content_block_stop":
                    pass  # results extracted from final_message below
                # Text deltas
                elif event.type == "content_block_delta":
                    delta = getattr(event, "delta", None)
                    if delta and hasattr(delta, "text"):
                        yield ("text", delta.text)
            final_message = await stream.get_final_message()

    if final_message:
        for block in final_message.content:
            if block.type == "tool_use":
                yield ("tool_use", block)
            elif block.type == "web_search_tool_result":
                search_results = []
                for item in getattr(block, "content", []):
                    if getattr(item, "type", None) == "web_search_result":
                        search_results.append({
                            "title": getattr(item, "title", ""),
                            "url": getattr(item, "url", ""),
                        })
                yield ("search_results", {
                    "query": "",
                    "results": search_results,
                })

        # Yield full content blocks for accurate conversation history reconstruction
        # (includes server_tool_use, web_search_tool_result blocks that must be preserved)
        has_tool_use = any(b.type == "tool_use" for b in final_message.content)
        if has_tool_use:
            serialized = []
            for block in final_message.content:
                serialized.append(block.model_dump())
            yield ("assistant_content", serialized)


async def evaluate_text(prompt: str, system_prompt: str = "", api_key: str | None = None) -> str:
    """Non-streaming single response from Claude."""
    system = system_prompt or DEFAULT_SYSTEM
    c = _get_client(api_key)
    async with _llm_semaphore:
        response = await c.messages.create(
            model=settings.CLAUDE_MODEL,
            max_tokens=4096,
            system=system,
            messages=[{"role": "user", "content": prompt}],
        )
    return response.content[0].text
