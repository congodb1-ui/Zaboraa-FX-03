import os
import pytest
from fastapi.testclient import TestClient
from dotenv import load_dotenv

# Set test environment variables before importing main
os.environ["BRIDGE_TOKEN"] = "test-secret-token-1234567890"
os.environ["ALLOW_TRADING"] = "false"

from main import app, BRIDGE_TOKEN

client = TestClient(app)

def test_health_unauthorized():
    response = client.get("/health")
    assert response.status_code == 401

def test_health_authorized():
    response = client.get(
        "/health",
        headers={"x-bridge-token": "test-secret-token-1234567890"}
    )
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"
    assert response.json()["trading_allowed"] is False
