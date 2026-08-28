from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, field_validator

T = TypeVar("T")


class ListResponse(BaseModel, Generic[T]):
    items: list[T]
    page: int = 1
    page_size: int = 25
    total: int


class ProductRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    sku: str
    seller_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    seller: str
    category: str
    price: Decimal
    stock: int
    status: str
    description: str = ""
    image_url: str | None = None
    updated: datetime | None = None


class ProductCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=2, max_length=200)
    sku: str = Field(min_length=2, max_length=80)
    seller_id: uuid.UUID
    category_id: uuid.UUID
    price: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    stock: int = Field(ge=0)
    description: str = Field(default="", max_length=2000)
    image_url: str | None = Field(default=None, max_length=500)


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    sku: str | None = Field(default=None, min_length=2, max_length=80)
    seller_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    price: Decimal | None = Field(default=None, gt=0)
    stock: int | None = Field(default=None, ge=0)
    description: str | None = Field(default=None, max_length=2000)
    image_url: str | None = Field(default=None, max_length=500)


class ProductBulkDelete(BaseModel):
    product_ids: list[uuid.UUID] = Field(min_length=1, max_length=100)

    @field_validator("product_ids")
    @classmethod
    def product_ids_must_be_unique(cls, product_ids: list[uuid.UUID]) -> list[uuid.UUID]:
        if len(set(product_ids)) != len(product_ids):
            raise ValueError("Product IDs must be unique")
        return product_ids


class SellerProductCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=2, max_length=200)
    sku: str = Field(min_length=2, max_length=80)
    category_id: uuid.UUID
    price: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    stock: int = Field(ge=0)
    description: str = Field(default="", max_length=2000)
    image_url: str | None = Field(default=None, max_length=500)


class SellerApplicationCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    business_name: str = Field(min_length=2, max_length=160)
    owner_name: str = Field(min_length=2, max_length=160)
    email: str = Field(min_length=5, max_length=200, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    phone: str | None = Field(default=None, max_length=40)


class SellerApplicationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    business_name: str
    owner_name: str
    email: str
    phone: str | None = None
    status: str
    decision_note: str | None = None
    created_at: datetime | None = None
    reviewed_at: datetime | None = None


class SellerApplicationDecision(BaseModel):
    decision: Literal["Approved", "Rejected"]
    note: str | None = Field(default=None, max_length=500)


class CheckoutItem(BaseModel):
    product_id: uuid.UUID
    quantity: int = Field(ge=1, le=20)


class CheckoutCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    items: list[CheckoutItem] = Field(min_length=1, max_length=50)
    customer_name: str = Field(min_length=2, max_length=160)
    customer_email: str = Field(min_length=5, max_length=200, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    delivery_address: str = Field(min_length=10, max_length=300)
    payment_method: Literal["Cash", "GCash", "PayMaya", "Bank Transfer"]


class CustomerOrderRead(BaseModel):
    order_number: str
    seller_name: str
    item_count: int
    total: Decimal
    status: str
    payment_method: str
    payment_status: str
    placed_at: datetime | None = None


class SellerOrderRead(BaseModel):
    id: uuid.UUID
    order_number: str
    buyer_name: str
    item_count: int
    total: Decimal
    status: str
    payment_status: str
    placed_at: datetime | None = None


class CommissionBalanceRead(BaseModel):
    seller_id: uuid.UUID
    seller_name: str
    commission_rate: Decimal
    due_amount: Decimal
    overdue_amount: Decimal
    grace_period_days: int
    status: str
    next_due_on: date | None = None


class CommissionPaymentCreate(BaseModel):
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    method: Literal["GCash", "PayMaya", "Bank Transfer", "Cash"]


class AuthUserRead(BaseModel):
    subject: str
    full_name: str
    email: str
    role: str
    seller_id: uuid.UUID | None = None


class AuthSessionRead(BaseModel):
    access_token: str | None = None
    token_type: Literal["bearer"] = "bearer"
    user: AuthUserRead


class RegisterRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    full_name: str = Field(min_length=2, max_length=160)
    email: str = Field(min_length=5, max_length=200, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    password: str = Field(min_length=8, max_length=128)
    role: Literal["Customer", "Seller"]
    business_name: str | None = Field(default=None, max_length=160)
    phone: str | None = Field(default=None, max_length=40)


class LoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=200, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    password: str = Field(min_length=1, max_length=128)


class OrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    order_number: str
    buyer_name: str
    item_count: int
    total: Decimal
    status: str
    placed_at: datetime | None = None


class SellerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    business_name: str
    owner_name: str
    commission_rate: Decimal
    rating: Decimal
    status: str
    joined_on: date


class CategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    slug: str
    parent_id: uuid.UUID | None = None
    status: str


class CategoryCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    slug: str = Field(min_length=2, max_length=120)
    parent_id: uuid.UUID | None = None


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    slug: str | None = Field(default=None, min_length=2, max_length=120)
    status: str | None = Field(default=None, pattern="^(Active|Archived)$")


class ReviewRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    product_name: str
    buyer_name: str
    rating: int
    comment: str
    status: str
    flag_reason: str | None = None
    created_at: datetime | None = None


class DisputeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    dispute_number: str
    order_number: str
    raised_by: str
    seller_name: str
    reason: str
    status: str
    outcome: str | None = None
    resolved_at: datetime | None = None


class DisputeResolve(BaseModel):
    outcome: str = Field(pattern="^(Refunded|Rejected)$")
    resolution_notes: str | None = None


class PayoutRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    seller_name: str
    period: str
    amount: Decimal
    status: str
    generated_at: datetime | None = None


class DashboardMetric(BaseModel):
    label: str
    value: str
    change: str | None = None
    direction: str | None = None


class DashboardRead(BaseModel):
    metrics: list[DashboardMetric]
    order_status: list[dict[str, str | int]]
    top_sellers: list[dict[str, str | int]]
    trends: dict[str, list[dict[str, float | str]]]
    seller_highlights: list[dict[str, str]]
    seller_metrics: list[DashboardMetric]
