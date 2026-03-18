# hang.ai

An AI-powered study platform that transforms passive note-taking into active learning. Drop in messy notes, PDFs, and recordings — get summaries, flashcards, quizzes, explanations, and a personalized study plan.

## What it does

**Capture** — Markdown notes, canvas diagrams, moodboards, PDF/image/video/audio uploads, URL imports (YouTube, arXiv, webpages), in-app voice recording with transcription.

**Understand** — AI-extracted concepts, definitions, formulas, summaries, and prerequisites. Select any text to define, research, or summarize. Chat with AI about your notes and files.

**Organize** — Folders, tags, wiki links (`[[Note Title]]`), bidirectional links, knowledge graph visualization, hybrid semantic + keyword search (Cmd+K).

**Retain** — Spaced repetition flashcards (SM2 algorithm), AI-generated quizzes (multiple choice, fill-blank, true/false), Feynman technique with AI scoring, Socratic dialogue mode (AI probes your understanding), weak-area detection.

**Act** — Todo lists with priorities, Pomodoro timer with session tracking, AI study plans from syllabi, daily study briefs, "study this next" recommendations.

**Track** — Dashboard with activity heatmap, flashcard/quiz stats, performance trends, study time analytics (hours/week with trends), stale note detection, weak topic surfacing.

## Tech stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, Vite, Tailwind CSS 4, React Router 7 |
| Backend | FastAPI, SQLAlchemy (async), SQLite (WAL mode) |
| AI | Anthropic Claude API (chat, generation, tool use) |
| Transcription | OpenAI Whisper API |
| Search | FastEmbed embeddings + hybrid semantic/keyword ranking |
| Editor | CodeMirror 6 + Vim keybindings, Excalidraw |
| Rendering | KaTeX (math), react-markdown, Mermaid (diagrams) |

## Setup

### Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
```

Create `backend/.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...          # optional — enables audio transcription
JWT_SECRET=your-secret-here
```

```bash
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` to the backend on port 8000.

### Search engine (optional)

```bash
cd backend
docker compose -f docker-compose.searxng.yml up -d
```

Runs SearXNG on port 8888 for the "research" selection action.

## Features (106/122 implemented)

See [STUDY.md](STUDY.md) for the full feature matrix with implementation status.

### Highlights

- **Note types** — Markdown text, Excalidraw canvas, image moodboards
- **File library** — PDF viewer, image viewer, video player, audio player with transcription
- **Voice recording** — Record audio in-browser, auto-transcribe via Whisper, convert to notes
- **AI chat** — Streaming responses with tool use, per-note and per-file context
- **Flashcards** — SM2 spaced repetition, keyboard-driven study (Space to flip, 1-4 to rate)
- **Quizzes** — AI-generated from notes, timed attempts, score history
- **Feynman technique** — Explain concepts in your own words, AI scores your understanding
- **Socratic mode** — AI probes your understanding through adaptive questions, then evaluates
- **Annotations** — Text highlights with colors, PDF page annotations, video/audio timestamp annotations
- **Wiki links** — `[[Note Title]]` with autocomplete, bidirectional links, knowledge graph
- **Smart connections** — AI-powered note suggestions based on semantic similarity
- **Search** — Cmd+K global search, semantic + keyword hybrid ranking
- **Study plans** — Paste a syllabus, get a week-by-week study plan with auto-created todos
- **Dashboard** — Daily brief, activity heatmap, weak areas, stale notes, performance trends
- **Export** — PDF export, Anki deck export, markdown zip
- **Personalization** — Dark/light theme, Vim mode, configurable Pomodoro, font size, default note type

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Cmd+K` | Global search |
| `Cmd+E` | Toggle editor mode (edit/preview) |
| `Cmd+J` | Toggle Vim mode |
| `Cmd+S` | Save note |
| `Space` | Flip flashcard (study mode) |
| `1-4` | Rate flashcard difficulty |

## Project structure

```
backend/
  app/
    auth/          # JWT authentication
    notes/         # Documents, folders, tags
    files/         # Upload, serve, transcription
    flashcards/    # SM2 spaced repetition
    quizzes/       # Quiz generation + attempts
    llm/           # AI chat + streaming
    feynman/       # Feynman technique
    search/        # Hybrid semantic search
    annotations/   # Note text highlights
    file_annotations/  # PDF/video/audio annotations
    imports/       # URL extraction (YouTube, arXiv, web)
    studyplan/     # AI study plans
    dashboard/     # Analytics
    todos/         # Task management
    pomodoro/      # Timer sessions
    lookups/       # Term definitions
  media/           # Uploaded files

frontend/
  src/
    pages/         # Route components
    components/    # Reusable UI
    hooks/         # Custom React hooks
    contexts/      # React contexts
    lib/           # API client + utilities
```

## License

Private.
