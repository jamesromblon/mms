"""Create local demo accounts without replacing any existing marketplace data."""

from __future__ import annotations

import os
import uuid

from passlib.context import CryptContext
from sqlalchemy import select

from .auth import DEV_ORGANIZATION_ID
from .db import SessionLocal
from .models import MarketplaceUser, Seller

password_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _required_password(name: str) -> str:
    value = os.environ.get(name, "")
    if len(value) < 8:
        raise RuntimeError(f"{name} must be provided and contain at least 8 characters")
    return value


def create_demo_accounts() -> None:
    accounts = [
        ("admin@argoph.demo", "Argo Administrator", "Marketplace Admin", "DEMO_ADMIN_PASSWORD"),
        ("seller@northstar.demo", "Rafael Cruz", "Seller", "DEMO_SELLER_PASSWORD"),
        ("customer@argoph.demo", "Mika Reyes", "Customer", "DEMO_CUSTOMER_PASSWORD"),
    ]
    with SessionLocal() as db:
        seller = db.scalar(select(Seller).where(Seller.organization_id == DEV_ORGANIZATION_ID, Seller.business_name == "Northstar Gadgets"))
        for email, full_name, role, password_env in accounts:
            user = db.scalar(select(MarketplaceUser).where(MarketplaceUser.organization_id == DEV_ORGANIZATION_ID, MarketplaceUser.email == email))
            if not user:
                user = MarketplaceUser(id=uuid.uuid4(), organization_id=DEV_ORGANIZATION_ID, subject=f"demo-{uuid.uuid4().hex}", email=email, full_name=full_name, password_hash=password_context.hash(_required_password(password_env)), role=role, status="Active", seller_id=seller.id if role == "Seller" and seller else None)
                db.add(user)
            else:
                user.full_name = full_name
                user.password_hash = password_context.hash(_required_password(password_env))
                user.role = role
                user.status = "Active"
                user.seller_id = seller.id if role == "Seller" and seller else None
        db.commit()
    print("Created or updated Argo local demo accounts")


if __name__ == "__main__":
    create_demo_accounts()
