import uuid
from decimal import Decimal

from fastapi.testclient import TestClient
from pydantic import ValidationError
import pytest

from app.main import app
from app.schemas import CheckoutCreate, ProductBulkDelete, ProductCreate, SellerApplicationCreate

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


def test_product_bulk_delete_payload_rejects_duplicate_ids() -> None:
    product_id = uuid.uuid4()

    with pytest.raises(ValidationError):
        ProductBulkDelete(product_ids=[product_id, product_id])


def test_checkout_requires_supported_payment_method_and_complete_address() -> None:
    payload = CheckoutCreate(
        items=[{"product_id": uuid.uuid4(), "quantity": 1}],
        customer_name="Mika Reyes",
        customer_email="mika@example.com",
        delivery_address="Makati City, Metro Manila",
        payment_method="GCash",
    )

    assert payload.payment_method == "GCash"

    with pytest.raises(ValidationError):
        CheckoutCreate(
            items=[{"product_id": uuid.uuid4(), "quantity": 1}],
            customer_name="Mika Reyes",
            customer_email="mika@example.com",
            delivery_address="short",
            payment_method="GCash",
        )


def test_seller_application_validates_email() -> None:
    with pytest.raises(ValidationError):
        SellerApplicationCreate(
            business_name="Example Shop",
            owner_name="Aira Flores",
            email="not-an-email",
        )
