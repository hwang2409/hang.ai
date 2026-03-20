import json

import anthropic

from app.config import settings

client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

CONVERT_PROMPT = """Convert the raw source material below into well-structured study notes.

Rules:

1. ANALYZE the content and identify the major concepts/topics.
2. If there are MULTIPLE distinct concepts (3+), create SEPARATE notes for each concept. If the content covers a single topic, create ONE comprehensive note.
3. For each note:
   - Give it a clear, descriptive title
   - Write well-structured markdown with headers, bullet points, and key definitions
   - Include important details, formulas, examples from the source
   - Keep it concise but thorough — study-friendly
4. Add BACKLINKS between related notes using [[Note Title]] syntax. For example, if a note about "Mitosis" references cell division concepts covered in a "Cell Cycle" note, write [[Cell Cycle]].
5. Suggest a folder name that captures the overall topic.

Return ONLY valid JSON in this exact format:
{
  "folder_name": "Topic Name",
  "notes": [
    {
      "title": "Note Title",
      "content": "# Note Title\\n\\nMarkdown content here...\\n\\nRelated: [[Other Note Title]]"
    }
  ]
}

If the content is short or covers one topic, return a single note (no folder needed):
{
  "folder_name": null,
  "notes": [
    {
      "title": "Note Title",
      "content": "# Note Title\\n\\nMarkdown content..."
    }
  ]
}

SOURCE MATERIAL:
"""


def convert_to_notes(text: str, source_name: str = "") -> dict:
    """Use Claude to convert extracted text into structured study notes."""
    # Truncate very long content to avoid token limits
    max_chars = 80000
    if len(text) > max_chars:
        text = text[:max_chars] + "\n\n[Content truncated due to length...]"

    prompt = CONVERT_PROMPT + text
    if source_name:
        prompt += f"\n\nSource: {source_name}"

    response = client.messages.create(
        model=settings.CLAUDE_MODEL,
        max_tokens=8192,
        messages=[{"role": "user", "content": prompt}],
    )

    result_text = response.content[0].text.strip()

    # Extract JSON from response (handle markdown code blocks)
    if result_text.startswith("```"):
        lines = result_text.split("\n")
        # Remove first and last lines (```json and ```)
        json_lines = []
        in_block = False
        for line in lines:
            if line.startswith("```") and not in_block:
                in_block = True
                continue
            elif line.startswith("```") and in_block:
                break
            elif in_block:
                json_lines.append(line)
        result_text = "\n".join(json_lines)

    return json.loads(result_text)
