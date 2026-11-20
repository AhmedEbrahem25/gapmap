# Deployment guide

## What exists today

`docker-compose.yml` runs the **demo**, not a production deployment:

| Service | How it runs | Fine for the demo | Not for production because |
|---|---|---|---|
| `frontend` | Vite **dev server** with live reload, source mounted | Yes | Dev server, unminified code, source mounted from the host |
| `backend` | `uvicorn --reload` with the app folder mounted | Yes | Reloader and one worker; code mounted from the host |
| `db` | PostgreSQL 16, port 5432 published | Yes | Database port open on the host; default credentials from `.env.example` |
| All | Plain HTTP on localhost | Yes | No TLS (NFR-03) |

The schema is created at start-up and the seed **wipes** the database, so there is no upgrade path
for real data yet.

## Demo day (28 November)

Run on the presenting laptop, offline if needed. Everything except AI explanations works without a
network.

**The day before:**

1. Pull the final `main` and build the images while online:

```bash
docker compose up --build -d
```

2. Seed for the live import and run the smoke test once:

```bash
docker compose exec backend python -m app.seed --no-results
```

```bash
python scripts/smoke_test.py http://127.0.0.1:8000
```

   The smoke test needs `pip install httpx python-docx` on the host.

3. If using AI explanations: set `ANTHROPIC_API_KEY` in `.env`, restart the backend, seed, run the
   analysis, and open STU001's plan once so the explanations are cached.
4. Reseed for the presentation, then rehearse with [../../demo-script.md](../../demo-script.md).
5. Keep the recorded backup video on the laptop's desktop.

**One hour before:** start Docker Desktop, run `docker compose up -d`, reseed, open the two browser
windows (instructor, and a private window for the student), and close notifications.

**If something breaks:** the demo script's *If something goes wrong* section lists a 5-second reset,
skipping the live import, running without Docker, and the backup video.

## Moving towards a real deployment

What a pilot with real students would need, in order. None of this is built.

| # | Step | Why |
|---|---|---|
| 1 | Data approval from the university; anonymised student references only | Plan Section 15: no real exams in external services without the data owner's approval |
| 2 | Add Alembic migrations; stop using the wiping seed outside development | Keep real data across releases |
| 3 | Build the frontend (`npm run build`) and serve `dist/` from Nginx or Caddy | No dev server in production |
| 4 | Run the backend without `--reload`, with several workers (`uvicorn --workers 4` or gunicorn), and no code mounts | Stability and throughput |
| 5 | TLS at the reverse proxy; HTTP redirected to HTTPS | NFR-03, encryption in transit |
| 6 | Don't publish the database port; use strong, generated credentials; encrypt the volume or use a managed database with encryption at rest | NFR-03, encryption at rest |
| 7 | Secrets from the platform's secret store, not a `.env` file; a long random `JWT_SECRET`; set `CORS_ORIGINS` to the real domain | Security |
| 8 | Rate-limit login; consider shorter token lifetimes with refresh | Brute-force protection |
| 9 | Nightly `pg_dump` plus a backup of the `storage` volume; test a restore | Recovery |
| 10 | A retention period for uploaded files and results, and a deletion job | Plan Section 15 |
| 11 | Account provisioning: a roster import or university single sign-on instead of the seed | Real users |
| 12 | Logging and monitoring: request logs, error alerts, Claude API failures | Operations |

## Configuration reference

From `.env` (see `.env.example`) and `backend/app/core/config.py`:

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Docker | `gapmap`, `gapmap_dev`, `gapmap` | Database credentials |
| `DATABASE_URL` | No | SQLite file | Set by Compose for PostgreSQL |
| `JWT_SECRET` | **Yes** | An insecure development value | Signs login tokens |
| `JWT_EXPIRE_MINUTES` | No | 480 | Token lifetime |
| `DEMO_PASSWORD` | Seed | `demo1234` | Password of every seeded demo account |
| `ANTHROPIC_API_KEY` | No | — | Turns on AI explanations |
| `EXPLANATIONS_ENABLED` | No | `true` | Turns them off even with a key |
| `LLM_MODEL` | No | `claude-opus-5-5` | Model for explanations |
| `CORS_ORIGINS` | No | `["http://localhost:5173"]` | Allowed browser origins |
| `STORAGE_DIR`, `DATA_DIR` | No | `storage/`, `data/` | Uploaded files; sample data |
| `MAX_UPLOAD_MB` | No | 25 | Lecture size limit |
| `WEAK_THRESHOLD_PERCENT`, `MIN_QUESTIONS_PER_CONCEPT`, `RETEACH_ERROR_RATE_PERCENT` | No | 60, 2, 40 | Analysis thresholds |
