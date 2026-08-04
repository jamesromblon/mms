from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import router

settings = get_settings()
app = FastAPI(title="ARGO Marketplace API", version="0.1.0", docs_url="/docs")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.include_router(router, prefix="/api/marketplace")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "argo-marketplace-api"}

