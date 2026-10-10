"""Authenticated GPU worker contract. Real model execution is deliberately disabled until installed and benchmarked."""
import os
import secrets
import uuid
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="AI Video Studio GPU Worker", docs_url=None, redoc_url=None)
jobs = {}

class Generate(BaseModel):
    provider: str = Field(pattern=r"^(wan|ltx|hunyuan)$")
    prompt: str = Field(min_length=3, max_length=3000)
    duration: float = Field(gt=0, le=10)
    imageUrl: str | None = None

class Render(BaseModel):
    clips: list[str] = Field(min_length=1, max_length=30)

def authorize(value: str | None):
    token = os.getenv("GPU_API_KEY")
    if not token or not value or not secrets.compare_digest(value, "Bearer " + token):
        raise HTTPException(401, "Unauthorized")

@app.get("/health")
def health():
    return {"status": "ready", "inference_enabled": False}

@app.post("/generate", status_code=503)
def generate(payload: Generate, authorization: str | None = Header(default=None)):
    authorize(authorization)
    raise HTTPException(503, "GPU worker skeleton installed; model inference is not configured")

@app.get("/jobs/{job_id}")
def status(job_id: str, authorization: str | None = Header(default=None)):
    authorize(authorization)
    raise HTTPException(404, "Job not found")

@app.post("/render", status_code=503)
def render(payload: Render, authorization: str | None = Header(default=None)):
    authorize(authorization)
    raise HTTPException(503, "Rendering is not configured")
