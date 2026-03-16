# Hang.ai — Codebase Notes

## What Is This?

Hang.ai is an educational/study platform. This directory (`rewrite/`) is a ground-up rewrite from a monolithic Django backend into a microservices architecture using FastAPI, with a modern React frontend.

The old codebase lives at `../hang-backend/` (Django) and `../hang-frontend/` (Next.js). Both are being replaced.

---

## Architecture Overview

```
                    ┌─────────────────┐
                    │  React Frontend  │  (Vite, port 5173)
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   Kong Gateway   │  (port 8000)
                    │  rate limiting   │
                    │  CORS, routing   │
                    └────────┬────────┘
                             │
        ┌────────┬───────┬───┴───┬────────┬────────┬────────┐
        ▼        ▼       ▼       ▼        ▼        ▼        ▼
     auth     notes   flash-   voice    math    media     llm
     8001     8002    cards    8004     8005     8006     8008
                      8003
```

Each service has its own PostgreSQL database, its own copy of auth/db/redis utilities, and its own Dockerfile. No shared code imports between services — fully isolated.

---

## Backend Services

### Auth Service (port 8001)
- **DB:** `hang_auth`
- **Tables:** `users` (email, username, hashed_password, first_name, last_name, is_active, timestamps)
- **Endpoints:** `POST /register`, `POST /login`, `POST /refresh`, `GET /health`
- **Auth:** JWT (HS256), bcrypt passwords, 60-min access tokens, 30-day refresh tokens
- Token payload: `sub` (user_id), `email`, `exp`, `type` ("access"/"refresh")

### Notes Service (port 8002)
- **DB:** `hang_notes`
- **Tables:** `documents`, `folders`, `tags`, `document_tags` (M2M), `note_shares`
- **Key fields on documents:** title, content, user_id, folder_id, unique_id (SHA256), first_image_url, deleted (soft delete), deleted_at, tags
- **Endpoints:** Full CRUD + bulk delete, previews (cached), sharing with view/edit permissions
- **Caching:** Redis, 5-min TTL for lists
- Automatically extracts first image URL from markdown/HTML content

### Flashcards Service (port 8003)
- **DB:** `hang_flashcards`
- **Tables:** `flashcards`, `tags`, `flashcard_tags` (M2M)
- **Spaced repetition:** SuperMemo SM-2 algorithm
  - Quality 0-2: reset (interval=1, reps=0)
  - Quality 3+: advance, adjust ease factor (min 1.3)
  - Intervals: 1st=1 day, 2nd=6 days, then multiply by ease_factor
- **Endpoints:** CRUD, `/due` (cards needing review), `/stats` (total/due/new/learning/mature), `POST /{id}/review`

### Voice Service (port 8004)
- **Stateless** — no database
- **Queue:** RabbitMQ + Celery for async transcription
- **Storage:** MinIO (local) / AWS S3 (prod), bucket `hang-voice-files`
- **Endpoints:** `POST /voice/upload` → returns task_id, `GET /voice/{task_id}/status` → poll for result
- Uses `libs/textalk/` for Whisper speech-to-text + FST-based text-to-LaTeX conversion

### Math Service (port 8005)
- **Stateless** — Redis for caching only
- **CAS engine:** `libs/crutch/` — custom symbolic math library
- **Endpoints:**
  - `POST /math/evaluate` — parse, simplify, evaluate → LaTeX + numeric result
  - `POST /math/differentiate` — derivative + plot points for original & derivative
  - `POST /math/integrate` — indefinite/definite integral + plot points
  - `POST /math/solve` — symbolic equation solving → solutions with LaTeX
  - `POST /math/plot` — 200 points, x range [-10, 10] by default
- Supports: rational numbers, constants (pi, e), full LaTeX output

### Media Service (port 8006)
- **Stateless** — S3 storage only
- **Storage:** MinIO (local) / AWS S3 (prod), bucket `hang-media-files`
- **Endpoints:** `POST /media/upload` (image validation, auto-thumbnail 200x200), `GET /media/{file_id}` (streaming, cache headers)
- User-isolated paths: `media/{user_id}/{file_id}`
- Optional CloudFront CDN support

### LLM Service (port 8008)
- **DB:** `hang_llm`
- **Tables:** `conversation_threads`, `conversation_messages`, `llm_usage`, `feynman_sessions`
- **Provider:** OpenAI (gpt-4o-mini, gpt-4, gpt-3.5-turbo)
- **Endpoints:**
  - `POST /llm/chat` — persistent conversation threads, optional note_id for context
  - `POST /llm/answer` — one-shot Q&A
  - `POST /llm/evaluate` — tasks: "general", "summary" (10-15 words), "improve", "analyze", "feynman"
  - Thread management: list, get, delete threads
  - Feynman sessions: create, list, get (score 0-100, strengths, weaknesses, feedback)
- Tracks all token usage and costs per user

---

## Infrastructure

| Component | Local | Production |
|-----------|-------|------------|
| PostgreSQL 15 | 4 instances (ports 5432-5435) | TBD |
| Redis 7 | Single instance (port 6379) | TBD |
| RabbitMQ 3 | Ports 5672/15672 | TBD |
| MinIO | Ports 9000/9001 | AWS S3 |
| Kong | Ports 8000/8007/8443 | TBD |

All orchestrated via `docker-compose.yml`.

### Kong Rate Limits
- Auth: 50/min, 500/hr
- Notes: 100/min, 1000/hr
- Flashcards: 100/min, 1000/hr
- Voice: 20/min, 200/hr
- Math: 200/min, 2000/hr
- Media: 50/min, 500/hr
- LLM: 30/min, 300/hr

### Kong Route Mapping
Both `/auth/*` and `/api/v1/auth/*` work for all services. Kong strips the prefix and forwards to the service.

CORS allowed origins: localhost:3000, 3001, 5173, 8080

---

## Frontend

### Stack
- React 19 + Vite 7 + React Router 7.9
- Tailwind CSS 4 (zinc/grey palette, rounded corners, dark mode)
- KaTeX for math rendering (via react-markdown + remark-math + rehype-katex)
- Recharts for graph visualization
- React Icons

### Pages
| Route | Component | Purpose |
|-------|-----------|---------|
| `/login` | Login.jsx | Authentication |
| `/signup` | Signup.jsx | Registration |
| `/` | Home.jsx | Notes grid with AI summaries |
| `/notes/new` | NoteEdit.jsx | Create note |
| `/notes/:id/edit` | NoteEdit.jsx | Edit note + AI chat sidebar |
| `/flashcards` | Flashcards.jsx | Card collection + stats |
| `/flashcards/new` | FlashcardNew.jsx | Create card |
| `/flashcards/study` | FlashcardStudy.jsx | Study session (flip + rate) |
| `/math` | Math.jsx | Calculator + graphs |
| `/feynman` | Feynman.jsx | Voice record + AI scoring |

### State Management
- **AuthContext** — JWT tokens in localStorage, user info decoded from token, login/register/logout
- **ThemeContext** — dark/light, persisted in localStorage
- No Redux/Zustand — just React hooks + Context API
- Cross-component communication via custom DOM events (`noteAccessed`, `noteDeleted`, `notesDeleted`)

### API Client (`src/lib/api.js`)
- Fetch-based, base URL from `VITE_API_BASE_URL` (default `http://localhost:8000/api/v1`)
- Auto-injects Bearer token from localStorage
- 401 responses clear tokens (force re-login)
- Handles 204 No Content

### localStorage Keys
- `access_token`, `refresh_token` — auth
- `theme` — dark/light
- `recent_notes_${userId}` — recent note history (max 5)
- `note_summary_${noteId}` — cached AI summaries

### Notable UI Details
- AI chat panel in NoteEdit is resizable (250-800px drag handle)
- Flashcard study has flip animation
- Math page shows side-by-side original + derivative/integral graphs
- Feynman page uses MediaRecorder API for in-browser audio capture, polls voice service for transcription
- LaTeX delimiters `\[...\]` and `\(...\)` are converted to `$$...$$` and `$...$` for KaTeX

---

## Custom Libraries

### `libs/crutch/` — CAS (Computer Algebra System)
- `cas.py` — main entry: parse, simplify, differentiate, integrate, solve
- `polynomial.py`, `monomial.py` — polynomial/monomial representations
- `rational.py` — rational number arithmetic
- `solver.py` — equation solving engine
- `edag.py` — expression DAG (directed acyclic graph)
- `interval.py` — interval arithmetic
- `parser.py` — expression parser

### `libs/textalk/` — Speech-to-Math
- `steve.py` — speech-to-text recognizer (Whisper-based)
- `interpreter.py` — MathFST (finite state transducer for math expression recognition)
- `voice_translator.py` — audio processing utilities
- Requires pre-trained model files (t5-large)

---

## Key Design Decisions

1. **Database-per-service** — full isolation, no cross-service DB queries
2. **JWT shared secret** — all services validate tokens independently using the same `JWT_SECRET`
3. **Soft deletes** — notes and flashcards use `deleted` flag + `deleted_at` timestamp
4. **Self-contained services** — each service has its own copy of auth.py, database.py, redis_client.py (no shared/ imports)
5. **Kong as single entry point** — clients never talk directly to services
6. **Async voice processing** — Celery + RabbitMQ to avoid blocking on transcription

---

## What's Done vs Pending

### Done
- All 7 microservices fully implemented
- Kong gateway configured with routing + rate limiting + CORS
- Docker Compose for full-stack local dev
- React frontend with all pages and features
- Custom CAS and voice-to-math libraries integrated

### Pending
- Kubernetes deployment configs
- Alembic database migrations
- Full test coverage
- Production environment variables / secrets management
- JWT validation at Kong gateway level (currently each service validates independently)
