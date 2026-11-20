# Setup guide

Two ways to run GapMap on a development machine. Docker is closer to the demo; the local route needs
no Docker and starts faster. Both end with the same demo data.

## Option A: Docker Compose (recommended)

**Needs:** Docker Desktop (or Docker Engine with Compose v2), Git.

```bash
git clone https://github.com/AhmedEbrahem25/gapmap.git
cd gapmap
cp .env.example .env
```

Edit `.env`: set `JWT_SECRET` to a random value. Generate one with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Then:

```bash
docker compose up --build -d
docker compose exec backend python -m app.seed
```

| Open | URL |
|---|---|
| The app | http://localhost:5173 |
| API docs (Swagger) | http://localhost:8000/docs |

Log in with a demo account (the login page has one-click buttons). The password is `DEMO_PASSWORD`
from `.env`.

## Option B: local, without Docker

**Needs:** Python 3.12+, Node 24, Git. The backend uses SQLite (`backend/gapmap.db`) when
`DATABASE_URL` is not set.

```bash
cp .env.example .env
cd backend
python -m venv .venv
.venv/Scripts/activate
pip install -r requirements-dev.txt
python -m app.seed
uvicorn app.main:app --reload
```

On macOS or Linux, activate with `source .venv/bin/activate`.

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

## Check that it works

1. Log in as the **Instructor**. The course *Software Engineering* shows 20 students, 1 lecture
   file and 1 exam.
2. Run the automated checks:

```bash
cd backend && pytest
```

Expect `144 passed`.

```bash
python scripts/smoke_test.py
```

Run the smoke test from the repository root after `python -m app.seed --no-results`. It walks the
whole demo through the API and stops at the first failed step. Reseed afterwards. On Windows, pass
the address explicitly, because `localhost` is slow there (see Troubleshooting):

```bash
python scripts/smoke_test.py http://127.0.0.1:8000
```

## Optional: AI explanations

Set `ANTHROPIC_API_KEY` in `.env` and restart the backend. Without it, everything works and the
explanation card is hidden.

## Troubleshooting

| Problem | Fix |
|---|---|
| Login fails right after start-up | The seed hasn't run: `python -m app.seed` (or `docker compose exec backend python -m app.seed`) |
| Port 5173, 8000 or 5432 already in use | Stop the other process, or change the left side of the port mapping in `docker-compose.yml` |
| The frontend shows network errors | The backend isn't running, or `VITE_PROXY_TARGET` is wrong (Docker sets it to `http://backend:8000`) |
| Scripts calling `http://localhost:8000` take about 2 s per request on Windows | `localhost` resolves to IPv6 first; use `http://127.0.0.1:8000` |
| The data looks wrong after experimenting | Reseed: it wipes and rebuilds the demo state |
| The schema changed after a `git pull` | Reseed: there are no migrations ([Database-Guide](Database-Guide.md)) |
