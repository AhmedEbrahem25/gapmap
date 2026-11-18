from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import analysis, analytics, auth, courses, materials, recovery
from app.core.config import settings
from app.core.db import create_all


@asynccontextmanager
async def lifespan(_: FastAPI):
    create_all()
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(title="GapMap API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(auth.router, prefix="/api")
app.include_router(courses.router, prefix="/api")
app.include_router(materials.router, prefix="/api")
app.include_router(analysis.router, prefix="/api")
app.include_router(recovery.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
