import uuid
from decimal import Decimal

from fastapi.testclient import TestClient
from pydantic import ValidationError
import pytest

from app.main import app
from app.schemas import ProductCreate

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


def test_product_create_payload_strips_required_text_fields() -> None:
    payload = ProductCreate(
        name="  Bamboo Drawer Organiser  ",
        sku="  llc-hom-077  ",
        seller_id=uuid.uuid4(),
        category_id=uuid.uuid4(),
        price=Decimal("1290.00"),
        stock=0,
    )

    assert payload.name == "Bamboo Drawer Organiser"
    assert payload.sku == "llc-hom-077"


def test_product_create_payload_rejects_prices_with_more_than_two_decimals() -> None:
    with pytest.raises(ValidationError):
        ProductCreate(
            name="Bamboo Drawer Organiser",
            sku="LLC-HOM-077",
            seller_id=uuid.uuid4(),
            category_id=uuid.uuid4(),
            price=Decimal("1290.999"),
            stock=0,
        )
