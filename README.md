# Vivora

AI-powered video generation with a conversational interface — describe what you want, Gemini understands, Veo 2 creates.

---

## Features

- **Chat interface** — multi-thread conversation history, each session is independent
- **Text-to-video** — describe in natural language → Gemini extracts intent → Veo 2 generates
- **Image-to-video** — upload an image + description → Veo 2 animates it
- **Optional voiceover** — Google TTS narration merged into final video via ffmpeg
- **Real-time status** — WebSocket + SSE streaming; watch jobs go from `queued → processing → completed`
- **No login required** — single anonymous user, open and start generating immediately

---

## Architecture

```
Browser (React + Vite)
  │  HTTP / SSE / WebSocket
  ▼
Nginx (port 80)
  ├── /          → Frontend (Vite dev server :5173)
  ├── /api/      → Backend (FastAPI :8000)
  ├── /api/ws/   → Backend WebSocket (upgrade headers)
  └── /media/    → Docker volume (videos served directly, no backend hop)

FastAPI (port 8000)
  ├── POST /api/chat/sessions/{id}/messages  → SSE stream (Gemini)
  ├── GET  /api/jobs/{id}                    → job status poll
  └── WS   /api/ws/connect                  → real-time job updates via Redis pub/sub

Celery Worker
  ├── generate_video  → calls Veo 2 API, polls until done, saves to /media/
  └── merge_audio     → Google TTS synthesis + ffmpeg multi-layer merge

PostgreSQL 16   Redis 7   Docker Volume /media/
```

### Nginx

Nginx is the single entry point at port 80:

- `/api/*` routes to FastAPI backend
- `/api/ws/*` routes to WebSocket (includes `Upgrade` and `Connection` headers for the handshake)
- `/media/*` serves video files directly from the Docker volume — no backend involvement, faster delivery
- `/` proxies to the Vite dev server with HMR support

### Celery

Veo 2 video generation takes 1–5 minutes, far too long for an HTTP request. Celery handles this asynchronously:

1. FastAPI creates a job record and enqueues a Celery task
2. The worker calls the Veo 2 API and polls until the video is ready
3. The finished file is saved to the Docker volume at `/media/videos/{job_id}/`
4. The worker publishes status updates via Redis pub/sub → FastAPI relays over WebSocket → browser updates in real time

Because the worker is a separate process, backend restarts do not interrupt running jobs.

---

## How It Works

1. Open `http://localhost` — you're in the chat immediately, no sign-in
2. Type something like _"create a 5-second video of a sunset over the ocean"_
3. Gemini may ask clarifying questions; once it has enough detail, it emits a video spec
4. A job is created and handed to the Celery worker, which calls Veo 2
5. WebSocket pushes status updates: `queued → processing → completed`
6. The finished video plays directly from `/media/videos/{job_id}/final.mp4`

---

## Prerequisites

| Requirement | Version |
|---|---|
| Docker | 24+ |
| Docker Compose | v2 (`docker compose` command) |
| Git | any recent |

No local Python, Node, or ffmpeg installation needed — everything runs inside containers.

---

## Quick Start

### 1. Clone the repository

```bash
git clone <repo-url> vivora
cd vivora
```

### 2. Create your `.env` file

```bash
cp .env.example .env
```

Only one API key is required to run the app:

```
GOOGLE_AI_API_KEY=...   # from aistudio.google.com — covers Gemini, Veo 2, and Google TTS
```

See [Configuration](#configuration) for optional settings.

### 3. Start all services

```bash
docker compose up --build
```

First run pulls images and builds containers — this takes a few minutes. Subsequent starts are faster.

### 4. Run database migrations

In a separate terminal while containers are running:

```bash
docker compose exec backend alembic upgrade head
```

### 5. Open the app

| Service | URL |
|---|---|
| **App** | http://localhost |
| **API docs (Swagger)** | http://localhost:8000/docs |
| **Frontend dev server** | http://localhost:5173 |

The app creates an anonymous user automatically on first startup. No sign-in needed.

---

## Configuration

All configuration lives in `.env`. The only required key:

| Variable | Description |
|---|---|
| `GOOGLE_AI_API_KEY` | Google AI Studio key — covers Gemini chat, Veo 2 video generation, and Google TTS |

Optional settings:

| Variable | Default | Description |
|---|---|---|
| `GEMINI_MODEL` | `gemini-2.0-flash` | Gemini model for the chat agent |
| `GOOGLE_TTS_VOICE_NAME` | `en-US-Wavenet-D` | TTS voice (e.g. `vi-VN-Wavenet-A` for Vietnamese) |
| `GOOGLE_TTS_LANGUAGE_CODE` | `en-US` | TTS language code |

Get your API key at [aistudio.google.com](https://aistudio.google.com/). Veo 2 access may require a separate application at [ai.google.dev](https://ai.google.dev/).

---

## Image-to-Video

Veo 2 supports animated video generation from a still image plus a text prompt.

In the chat interface, attach an image (drag-and-drop or the upload button) and describe the motion you want:

> _"Make the clouds move slowly across the sky"_

Gemini detects the image and routes the job to Veo 2's image-to-video mode. The resulting video is saved and played back the same way as text-to-video.

---

## Dev Workflow

### View logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f backend
docker compose logs -f worker
```

### Restart a single service

```bash
docker compose restart backend
docker compose restart worker
```

### Shell into a container

```bash
docker compose exec backend bash
docker compose exec backend python -c "from app.config import get_settings; print(get_settings())"
```

### Create a new DB migration

```bash
docker compose exec backend alembic revision --autogenerate -m "describe your change"
docker compose exec backend alembic upgrade head
```

### Rebuild after changing dependencies or Dockerfile

```bash
docker compose up --build backend worker
```

### Stop everything

```bash
docker compose down

# Also remove volumes (wipes DB, Redis, and generated videos)
docker compose down -v
```

---

## Project Structure

```
vivora/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, router registration, anonymous user init
│   │   ├── config.py            # pydantic-settings (all env vars)
│   │   ├── dependencies.py      # get_anonymous_user(), ANONYMOUS_USER_ID
│   │   ├── models/              # SQLAlchemy ORM models
│   │   ├── routers/             # API route handlers
│   │   ├── services/
│   │   │   ├── chat_agent.py    # Gemini integration + intent extraction
│   │   │   ├── storage_local.py # Docker volume helpers (save/read/get_url)
│   │   │   ├── video_providers/ # veo provider
│   │   │   └── audio/           # google_tts.py, merger.py (ffmpeg)
│   │   └── workers/
│   │       ├── celery_app.py    # Celery app definition
│   │       ├── video_gen.py     # Veo 2 generation task
│   │       ├── audio_merge.py   # Google TTS + ffmpeg merge task
│   │       └── _db.py           # sync SQLAlchemy helpers for workers
│   ├── alembic/                 # DB migrations
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── lib/api.ts           # axios client + SSE streaming helper
│       └── stores/chatStore.ts  # Zustand: chat + job tracking
├── nginx/                       # Nginx reverse proxy config
├── docker-compose.yml
├── docker-compose.dev.yml       # override for local dev (volume mounts, hot reload)
└── .env.example
```

---

## Troubleshooting

### `alembic upgrade head` fails — "relation already exists"

The database has stale state. Reset and re-run:

```bash
docker compose down -v
docker compose up -d postgres redis
# wait ~5 seconds for postgres to be ready
docker compose up -d backend worker frontend nginx
docker compose exec backend alembic upgrade head
```

### Backend crashes on startup — "could not connect to server"

Postgres isn't ready yet. Wait a moment and restart:

```bash
docker compose restart backend worker
```

### Worker not picking up jobs

Check that the worker is running and connected to Redis:

```bash
docker compose logs worker
docker compose exec worker celery -A app.workers.celery_app inspect ping
```

If the worker appears healthy but jobs stay `queued`, verify `REDIS_URL` is consistent between backend and worker.

### Videos stuck in `processing`

The worker may have crashed mid-job. Check logs and restart:

```bash
docker compose logs worker --tail=50
docker compose restart worker
```

### Veo API returns `NotImplementedError` or `403`

- Confirm `GOOGLE_AI_API_KEY` is set correctly in `.env`
- Veo 2 access requires approval — apply at [ai.google.dev](https://ai.google.dev/)
- The key must be from [aistudio.google.com](https://aistudio.google.com/) (not a service account key)

### Video file not loading in the browser

- Confirm the `worker` container has write access to the shared Docker volume
- Check that Nginx is serving the `/media/` path and the volume is mounted: `docker compose exec nginx ls /media/videos/`
- Verify the job status is `completed` and the file exists: `docker compose exec backend ls /media/videos/{job_id}/`

### Port 80 already in use

Edit `docker-compose.yml` and change `"80:80"` to `"8080:80"`, then access the app at `http://localhost:8080`.
