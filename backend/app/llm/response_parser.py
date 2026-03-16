import json
import re


def parse_llm_json(text: str):
    """Parse JSON from an LLM response, stripping markdown code fences if present.

    Raises json.JSONDecodeError on failure.
    """
    text = text.strip()
    fence_match = re.search(r"```(?:json)?\s*\n?(.*?)```", text, re.DOTALL)
    if fence_match:
        text = fence_match.group(1).strip()
    return json.loads(text)
