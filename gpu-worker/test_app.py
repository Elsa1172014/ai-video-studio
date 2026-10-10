import os
from fastapi.testclient import TestClient
from app import app

client = TestClient(app)

def test_health_reports_inference_disabled():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["inference_enabled"] is False

def test_generation_requires_auth():
    os.environ["GPU_API_KEY"] = "test-only-secret"
    response = client.post("/generate", json={"provider": "wan", "prompt": "A city at sunrise", "duration": 5})
    assert response.status_code == 401

def test_generation_does_not_claim_success():
    os.environ["GPU_API_KEY"] = "test-only-secret"
    response = client.post("/generate", headers={"Authorization": "Bearer test-only-secret"}, json={"provider": "wan", "prompt": "A city at sunrise", "duration": 5})
    assert response.status_code == 503
