from fastapi import FastAPI

from app.api.auth import router as auth_router
from app.api.meetings import router as meetings_router

app = FastAPI(title="ContextBridge")

app.include_router(auth_router)
app.include_router(meetings_router)


@app.get("/health")
def health():
    return {"status": "ok"}
