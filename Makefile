# hang v1 — development makefile
# usage: make help

BACKEND  := backend
FRONTEND := frontend
VENV     := $(BACKEND)/venv
PIP      := $(VENV)/bin/pip
PYTHON   := $(VENV)/bin/python
UVICORN  := $(VENV)/bin/uvicorn
CELERY   := $(VENV)/bin/celery

# ─── help ────────────────────────────────────────────────────────────

.PHONY: help
help: ## show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

# ─── setup ───────────────────────────────────────────────────────────

.PHONY: install
install: install-backend install-frontend ## install all dependencies

.PHONY: install-backend
install-backend: ## create venv + install python deps
	@test -d $(VENV) || python3 -m venv $(VENV)
	$(PIP) install -r $(BACKEND)/requirements.txt

.PHONY: install-frontend
install-frontend: ## npm install frontend deps
	cd $(FRONTEND) && npm install

# ─── dev ─────────────────────────────────────────────────────────────

.PHONY: dev
dev: ## run backend + frontend concurrently
	@make -j2 dev-backend dev-frontend

.PHONY: dev-backend
dev-backend: ## run fastapi dev server (port 8000)
	cd $(BACKEND) && $(CURDIR)/$(UVICORN) app.main:app --reload --port 8000

.PHONY: dev-frontend
dev-frontend: ## run vite dev server (port 5173)
	cd $(FRONTEND) && npm run dev

# ─── optional services ───────────────────────────────────────────────

.PHONY: redis
redis: ## start redis server
	redis-server

.PHONY: celery
celery: ## start celery worker (requires redis)
	cd $(BACKEND) && $(CURDIR)/$(CELERY) -A app.celery_app worker --loglevel=info

.PHONY: celery-beat
celery-beat: ## start celery beat scheduler (requires redis)
	cd $(BACKEND) && $(CURDIR)/$(CELERY) -A app.celery_app beat --loglevel=info

.PHONY: searxng
searxng: ## start searxng search engine (docker)
	cd $(BACKEND) && docker compose -f docker-compose.searxng.yml up -d

.PHONY: searxng-down
searxng-down: ## stop searxng
	cd $(BACKEND) && docker compose -f docker-compose.searxng.yml down

# ─── full stack (all services) ───────────────────────────────────────

.PHONY: dev-full
dev-full: ## run everything: redis, backend, frontend, celery
	@make -j4 redis dev-backend dev-frontend celery

# ─── build ───────────────────────────────────────────────────────────

.PHONY: build
build: ## production build frontend
	cd $(FRONTEND) && npm run build

# ─── lint / check ────────────────────────────────────────────────────

.PHONY: lint
lint: ## lint frontend
	cd $(FRONTEND) && npm run lint

.PHONY: check
check: lint build ## lint + build (CI gate)

# ─── database ────────────────────────────────────────────────────────

.PHONY: db-reset
db-reset: ## delete sqlite database (requires confirmation)
	@echo "this will delete $(BACKEND)/hang.db — press enter to confirm or ctrl-c to cancel" && read _
	rm -f $(BACKEND)/hang.db $(BACKEND)/hang.db-shm $(BACKEND)/hang.db-wal

# ─── clean ───────────────────────────────────────────────────────────

.PHONY: clean
clean: ## remove build artifacts + caches
	rm -rf $(FRONTEND)/dist
	find $(BACKEND) -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
