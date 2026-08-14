from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Generic, TypeVar

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
    seller: str
    category: str
    price: Decimal
    stock: int
    status: str
    updated: datetime | None = None


class ProductCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=2, max_length=200)
    sku: str = Field(min_length=2, max_length=80)
    seller_id: uuid.UUID
    category_id: uuid.UUID
    price: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    stock: int = Field(ge=0)


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    sku: str | None = Field(default=None, min_length=2, max_length=80)
    category_id: uuid.UUID | None = None
    price: Decimal | None = Field(default=None, gt=0)
    stock: int | None = Field(default=None, ge=0)


class ProductBulkDelete(BaseModel):
    product_ids: list[uuid.UUID] = Field(min_length=1, max_length=100)

    @field_validator("product_ids")
    @classmethod
    def product_ids_must_be_unique(cls, product_ids: list[uuid.UUID]) -> list[uuid.UUID]:
        if len(set(product_ids)) != len(product_ids):
            raise ValueError("Product IDs must be unique")
        return product_ids


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
