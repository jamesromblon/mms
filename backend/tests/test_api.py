from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health() -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_dashboard_uses_dev_auth_context() -> None:
    response = client.get("/api/marketplace/dashboard")
    assert response.status_code == 200
    assert response.json()["metrics"][0]["label"] == "GMV (30d)"
    assert response.json()["metrics"][0]["value"].startswith(chr(0x20B1))


def test_role_token_can_be_selected_for_local_api() -> None:
    response = client.get(
        "/api/marketplace/dashboard",
        headers={"Authorization": "Bearer dev-finance"},
    )
    assert response.status_code == 200
