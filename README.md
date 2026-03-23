# neuronic

An AI-powered study platform that transforms passive note-taking into active learning. Drop in messy notes, PDFs, and recordings — get summaries, flashcards, quizzes, explanations, and a personalized study plan.

## What it does

**Capture** — Markdown notes, canvas diagrams, moodboards, PDF/image/video/audio uploads, URL imports (YouTube, arXiv, webpages), in-app voice recording with transcription, browser extension for web clipping.

**Understand** — AI-extracted concepts, definitions, formulas, summaries, and prerequisites. Select any text to define, research, or summarize. Context-aware AI chat that searches your notes via RAG for relevant answers.

**Organize** — Folders, tags, wiki links (`[[Note Title]]`), bidirectional links, knowledge graph with concept mastery visualization, hybrid semantic + keyword search (Cmd+K), command palette (Cmd+P).

**Retain** — SM2 spaced repetition for flashcards *and* notes, AI-generated quizzes, Feynman technique with AI scoring, Socratic dialogue mode, note review queue with active recall, weak-area detection.

**Act** — Todo lists with priorities, Pomodoro timer with session tracking, AI study plans from syllabi, daily boot sequence with agenda, smart nudges, focus mode for immersive study sessions, automation pipelines (if-this-then-that).

**Track** — Dashboard with activity heatmap, flashcard/quiz stats, performance trends, study time analytics, stale note detection, topic mastery, unified timeline of all activity.

**Collaborate** — Study groups with shared notes and group chat, Q&A forum with voting/bounties/AI answers, friend activity feeds, user profiles with reputation.

## Tech stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, Vite, Tailwind CSS 4, React Router 7 |
| Backend | FastAPI, SQLAlchemy (async), SQLite (WAL mode) |
| AI | Anthropic Claude API (streaming, tool use, RAG) |
| Transcription | OpenAI Whisper API |
| Search | FastEmbed embeddings + hybrid semantic/keyword ranking |
| Cache | Redis + Celery (task queue) |
| Editor | CodeMirror 6 + Vim keybindings, Excalidraw |
| Rendering | KaTeX (math), react-markdown, Mermaid (diagrams) |
| Auth | JWT (HS256) + bcrypt, Fernet-encrypted API key storage |
| Export | PDF (xhtml2pdf), Anki decks (genanki), markdown ZIP |

## Setup

### Quick start (Makefile)

```bash
make install    # install backend + frontend dependencies
make dev        # run backend + frontend in parallel
```

### Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
```

Create `backend/.env`:

```
JWT_SECRET=your-secret-here
ANTHROPIC_API_KEY=sk-ant-...   # optional — server-wide default for AI features
OPENAI_API_KEY=sk-...          # optional — enables audio transcription
REDIS_URL=redis://localhost:6379  # optional — enables caching + task queue
```

AI features require an Anthropic API key. Users can add their own key in Settings (encrypted at rest with Fernet). If no server-wide key is set, all LLM features are gated behind the user providing their own key.

```bash
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies API requests to the backend on port 8000.

### Optional services

```bash
# Redis (for caching + background tasks)
make redis

# SearXNG (for "research" selection action)
cd backend && docker compose -f docker-compose.searxng.yml up -d
```

### Browser extension

Load `extension/` as an unpacked Chrome extension. Enables one-click clipping of web content, highlighted text, and PDFs into Neuronic.

## Features

### Core

- **Note types** — Markdown text, Excalidraw canvas, image moodboards
- **File library** — PDF viewer, image viewer, video player, audio player with transcription
- **Voice recording** — Record audio in-browser, auto-transcribe via Whisper, convert to notes
- **AI chat** — Streaming responses with tool use, context-aware RAG (searches your notes), per-note and per-file context
- **Search** — Cmd+K global search, semantic + keyword hybrid ranking, web search via SearXNG

### Learning

- **Flashcards** — SM2 spaced repetition, keyboard-driven study (Space to flip, 1-4 to rate), interleaved practice, AI deduplication
- **Note review** — SM2 spaced repetition applied to notes, active-recall review queue (title → reveal → rate), auto-scheduled on note creation, passive updates from quiz scores
- **Quizzes** — AI-generated from notes, timed attempts, score history, exam simulation mode
- **Feynman technique** — Explain concepts in your own words, AI scores understanding, practice problems
- **Socratic mode** — AI probes your understanding through adaptive questions, then evaluates
- **Study plans** — Paste a syllabus, get a week-by-week plan with auto-created todos

### Organization

- **Wiki links** — `[[Note Title]]` with autocomplete, bidirectional links
- **Knowledge graph** — Concept mastery visualization (notes + concepts view), co-occurrence edges, mastery-colored nodes
- **Smart connections** — AI-powered note suggestions based on semantic similarity
- **Cross-note refactoring** — Merge multiple notes, extract sections, AI-assisted consolidation
- **Annotations** — Text highlights with colors, PDF page annotations, video/audio timestamp annotations

### Productivity

- **Dashboard** — Daily brief with greeting, activity heatmap, weak areas, stale notes, performance trends, topic mastery, smart nudges
- **Daily boot** — Morning agenda with session suggestions, progress summary, "continue where you left off"
- **Todos** — Task management with priorities, drag reorder, study plan integration
- **Pomodoro** — Configurable timer (focus/short break/long break), session tracking, streak counting
- **Focus mode** — Immersive study mode, subject lock-in, distraction hiding
- **Automations** — If-this-then-that rules: "When I import a PDF, generate 10 flashcards", "When quiz score < 60%, create review todo"
- **Timeline** — Unified chronological view of all activity, filterable by type, searchable

### Social

- **Study groups** — Shared notes, group chat, pinned messages, permission management
- **Q&A forum** — Questions with voting, bounties, AI-suggested answers, duplicate detection, bookmarks, tags
- **User profiles** — Activity timeline, study stats, reputation system
- **Friends** — Activity feed, study accountability

### Integration

- **BYO API keys** — Bring your own Anthropic/OpenAI keys, encrypted at rest, per-user key with server fallback
- **Google Calendar** — Sync study plan and todos to calendar
- **Webhooks** — Custom webhook integrations, iCal feeds
- **Import** — YouTube transcripts, arXiv papers, webpages, Notion/Obsidian export
- **Export** — PDF export, Anki deck export, markdown ZIP, AI-compiled study guides
- **Plugin system** — Extensible architecture for custom import formats, dashboard widgets, nav items, and study modes
- **Browser extension** — One-click web clipper, highlighted text capture, related notes sidebar

### Personalization

- Dark/light theme, Vim mode, configurable Pomodoro durations, editor font size, default note type

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Cmd+K` | Search notes |
| `Cmd+P` | Command palette |
| `Cmd+E` | Toggle editor mode (edit/preview) |
| `Cmd+J` | Toggle Vim mode |
| `Cmd+S` | Save note |
| `Space` | Flip flashcard / reveal note review |
| `1-4` | Rate recall difficulty |

## Project structure

```
backend/
  app/
    auth/              # JWT authentication, user management
    notes/             # Documents, folders, tags, insights, refactoring
    files/             # Upload, serve, transcription
    flashcards/        # SM2 spaced repetition
    reviews/           # Note-level spaced repetition
    quizzes/           # Quiz generation + attempts
    llm/               # AI chat, streaming, tool use, RAG context
    feynman/           # Feynman technique + Socratic mode
    search/            # Hybrid semantic search (FastEmbed)
    knowledge/         # Concept tracking, mastery, prerequisites
    annotations/       # Note text highlights
    file_annotations/  # PDF/video/audio annotations
    imports/           # URL extraction (YouTube, arXiv, web)
    studyplan/         # AI study plans
    dashboard/         # Analytics, nudges, daily brief
    todos/             # Task management
    pomodoro/          # Timer sessions
    automations/       # IFTTT rule engine
    timeline/          # Unified activity feed
    social/            # Friends, study groups, DMs
    forum/             # Q&A with voting + bounties
    notifications/     # In-app notification system
    plugins/           # Plugin registry + loader
    integrations/      # Google Calendar, webhooks
    lookups/           # Term definitions
    admin/             # Admin utilities
  media/               # Uploaded files
  tests/               # pytest suite (69 tests)

frontend/
  src/
    pages/             # 28 route components
    components/        # 27 reusable UI components
    hooks/             # Custom React hooks
    contexts/          # Auth, Theme, Focus, Workspace, Plugin
    lib/               # API client + utilities

extension/             # Chrome browser extension
```

## Roadmap

### Google Calendar Sync (Hardening)
The current integration creates events but needs better edge case handling — token refresh failures, deleted todo cleanup, rate limit handling for bulk operations, and proactive re-authorization warnings.

### Multi-Provider LLM Support
Support OpenAI, Google Gemini, and OpenAI-compatible endpoints (Ollama, Together, Groq). Per-feature model selection and token usage dashboard.

### Mobile-Responsive UI
The current UI is desktop-first. Needs responsive layouts, touch-friendly interactions, and PWA support for mobile study sessions.

## License

Private.
