# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Setup

Copy `.env.example` to `.env` — only `GOOGLE_AI_API_KEY` is required to run.

```bash
cp .env.example .env
docker compose up --build
docker compose exec backend alembic upgrade head
```

App is accessible at `http://localhost:9080` (Nginx reverse proxy).

## Common Commands

### Docker
```bash
docker compose up --build                                              # start all services
docker compose -f docker-compose.yml -f docker-compose.dev.yml up     # dev mode (debug logging, hot-reload)
docker compose restart backend                                         # restart single service
docker compose logs -f backend worker                                  # tail logs
docker compose down -v                                                 # stop + remove volumes
```

### Database Migrations (Alembic)
```bash
docker compose exec backend alembic upgrade head
docker compose exec backend alembic revision --autogenerate -m "description"
docker compose exec backend alembic downgrade -1
```

### Frontend (inside container or locally with Node 20)
```bash
npm run dev      # Vite dev server
npm run build    # TypeScript check + production bundle
npm run lint     # ESLint
```

## Architecture

### Request Flow
```
Browser → Nginx (:9080) → FastAPI backend (:8000) or Vite frontend (:5173)
                        ↘ /media/ served directly from Docker volume (no backend hop)
```

### Chat & Video Generation Flow
1. Browser sends message via `POST /api/chat/sessions/{id}/messages` (SSE stream)
2. FastAPI calls Gemini (`chat_agent.py`) — streams tokens back via SSE events (`token`, `job_created`, `done`)
3. When Gemini decides to generate video, it returns a JSON spec; FastAPI enqueues a Celery task
4. Celery worker (`video_gen.py`) calls Veo API, saves to Docker volume `/media/videos/{job_id}/`
5. Worker publishes status updates to Redis pub/sub channel `user:{ANONYMOUS_USER_ID}:jobs`
6. WebSocket (`/api/ws/connect`) relays Redis messages to the browser in real-time

### Job Status Progression
- Without voiceover: `queued → processing → completed`
- With voiceover: `queued → processing → audio_processing → merging → completed`
- Failure at any stage: `failed`

### Anonymous User
No authentication. A single fixed user (`UUID 00000000-0000-0000-0000-000000000001`) is created on startup via `main.py` lifespan. All API calls use `get_anonymous_user()` from `dependencies.py`.

### Async vs Sync DB
- **FastAPI** uses async SQLAlchemy with `asyncpg` driver
- **Celery workers** use synchronous SQLAlchemy with `psycopg2-binary` — see `backend/app/workers/_db.py`
- Never use async session patterns in Celery tasks

### Key Directories
- `backend/app/routers/` — FastAPI route handlers
- `backend/app/services/` — business logic (chat agent, storage, video/audio providers)
- `backend/app/workers/` — Celery task definitions (`video_gen.py`, `audio_merge.py`)
- `backend/app/models/` — SQLAlchemy ORM models
- `backend/alembic/versions/` — migration files
- `frontend/src/stores/` — Zustand state (chat, jobs)
- `frontend/src/lib/api.ts` — axios client + `createChatStream()` SSE helper

### Redis Databases
| DB | Purpose |
|----|---------|
| 0  | App cache + pub/sub |
| 1  | Celery broker |
| 2  | Celery result backend |

Pub/sub for job updates uses DB 0 with channel pattern `user:{user_id}:jobs`.

### Media Storage
Videos stored at `/media/videos/{job_id}/raw.mp4` and `final.mp4` inside the `media_data` Docker volume. URLs returned to clients use `storage_local.get_url()` → `/media/{relative_path}`, served directly by Nginx.

### Celery Task Routing
- `app.workers.video_gen.*` → `video` queue
- `app.workers.audio_merge.*` → `audio` queue
