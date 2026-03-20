import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import settings, check_settings
from app.rate_limit import limiter
from app.middleware import AccessLogMiddleware
from app.database import init_db
from app.cache import init_cache, close_cache
from app.auth.router import router as auth_router
from app.notes.router import router as notes_router
from app.llm.router import router as llm_router
from app.flashcards.router import router as flashcards_router
from app.feynman.router import router as feynman_router
from app.annotations.router import router as annotations_router
from app.search.router import router as search_router
from app.admin.router import router as admin_router
from app.pomodoro.router import router as pomodoro_router
from app.imports.router import router as imports_router
from app.todos.router import router as todos_router
from app.files.router import router as files_router
from app.file_annotations.router import router as file_annotations_router
from app.studyplan.router import router as studyplan_router
from app.dashboard.router import router as dashboard_router
from app.lookups.router import router as lookups_router
from app.quizzes.router import router as quizzes_router
from app.integrations.router import router as integrations_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(name)s %(levelname)s %(message)s",
        datefmt="%H:%M:%S",
    )
    import os
    os.makedirs("media/files", exist_ok=True)
    check_settings()
    await init_db()
    await init_cache()
    # Backfill embeddings in background (non-blocking)
    from app.search.service import backfill_embeddings
    asyncio.create_task(backfill_embeddings())
    yield
    await close_cache()


app = FastAPI(title="Neuronic API", lifespan=lifespan, redirect_slashes=False)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Middleware runs in reverse order: last added = outermost (runs first)
app.add_middleware(AccessLogMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(notes_router, prefix="/notes", tags=["notes"])
app.include_router(llm_router, prefix="/llm", tags=["llm"])
app.include_router(flashcards_router, prefix="/flashcards", tags=["flashcards"])
app.include_router(feynman_router, prefix="/feynman", tags=["feynman"])
app.include_router(annotations_router, prefix="/annotations", tags=["annotations"])
app.include_router(search_router, prefix="/search", tags=["search"])
app.include_router(admin_router, prefix="/admin", tags=["admin"])
app.include_router(pomodoro_router, prefix="/pomodoro", tags=["pomodoro"])
app.include_router(imports_router, prefix="/imports", tags=["imports"])
app.include_router(todos_router, prefix="/todos", tags=["todos"])
app.include_router(files_router, prefix="/files", tags=["files"])
app.include_router(file_annotations_router, prefix="/file-annotations", tags=["file-annotations"])
app.include_router(studyplan_router, prefix="/studyplan", tags=["studyplan"])
app.include_router(dashboard_router, prefix="/dashboard", tags=["dashboard"])
app.include_router(lookups_router, prefix="/lookups", tags=["lookups"])
app.include_router(quizzes_router, prefix="/quizzes", tags=["quizzes"])
app.include_router(integrations_router, prefix="/integrations", tags=["integrations"])


@app.get("/health")
async def health():
    return {"status": "ok"}
