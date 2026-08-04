from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .auth import AuthContext, require_roles
from .db import get_db
from .models import Category, Dispute, Order, Payout, Product, Review, Seller
from .schemas import (
    CategoryCreate,
    CategoryRead,
    DashboardRead,
    DashboardMetric,
    DisputeRead,
    DisputeResolve,
    ListResponse,
    OrderRead,
    PayoutRead,
    ProductCreate,
    ProductRead,
    ReviewRead,
    SellerRead,
)

router = APIRouter()


def _page(page: int, page_size: int) -> tuple[int, int]:
    return (max(page, 1) - 1) * min(max(page_size, 1), 100), min(max(page_size, 1), 100)


def _search(value: str | None) -> str | None:
    return f"%{value.strip()}%" if value and value.strip() else None


@router.get("/dashboard", response_model=DashboardRead)
def dashboard(
    db: Session = Depends(get_db),
    context: AuthContext = Depends(
        require_roles("Catalog Moderator", "Operations/Disputes", "Finance/Payouts")
    ),
) -> DashboardRead:
    active_sellers = (
        db.scalar(
            select(func.count(Seller.id)).where(
                Seller.organization_id == context.organization_id, Seller.status == "Active"
            )
        )
        or 0
    )
    open_disputes = (
        db.scalar(
            select(func.count(Dispute.id)).where(
                Dispute.organization_id == context.organization_id, Dispute.status != "Resolved"
            )
        )
        or 0
    )
    gmv = db.scalar(
        select(func.coalesce(func.sum(Order.total), 0)).where(
            Order.organization_id == context.organization_id, Order.status != "Cancelled"
        )
    ) or Decimal("0")
    status_counts = dict(
        db.execute(
            select(Order.status, func.count(Order.id))
            .where(Order.organization_id == context.organization_id)
            .group_by(Order.status)
        ).all()
    )
    payout_rows = db.execute(
        select(Payout.seller_name, func.sum(Payout.amount))
        .where(Payout.organization_id == context.organization_id)
        .group_by(Payout.seller_name)
        .order_by(func.sum(Payout.amount).desc())
        .limit(5)
    ).all()
    maximum = max((amount for _, amount in payout_rows), default=Decimal("1"))
    peso = chr(0x20B1)
    return DashboardRead(
        metrics=[
            DashboardMetric(label="GMV (30d)", value=f"{peso}{gmv:,.0f}", change="18.6%", direction="up"),
            DashboardMetric(label="Active Sellers", value=str(active_sellers), change="6", direction="up"),
            DashboardMetric(label="Open Disputes", value=str(open_disputes)),
            DashboardMetric(
                label="Avg. Fulfillment Time", value="5.4 hrs", change="0.6h faster", direction="down"
            ),
        ],
        order_status=[{"name": status, "value": count} for status, count in sorted(status_counts.items())],
        top_sellers=[
            {"name": seller, "amount": f"{peso}{amount / 1000:,.0f}K", "width": int((amount / maximum) * 100)}
            for seller, amount in payout_rows
        ],
    )

    return DashboardRead(
        metrics=[
            DashboardMetric(label="GMV (30d)", value="₱1.86M", change="12.4%", direction="up"),
            DashboardMetric(label="Active Sellers", value="86", change="4", direction="up"),
            DashboardMetric(label="Open Disputes", value="2"),
            DashboardMetric(label="Avg. Fulfillment Time", value="6.2 hrs", change="0.8h", direction="down"),
        ],
        order_status=[
            {"name": "Completed", "value": 52},
            {"name": "Confirmed", "value": 22},
            {"name": "Active", "value": 14},
            {"name": "Cancelled", "value": 12},
        ],
        top_sellers=[
            {"name": "TechHub Traders", "amount": "₱412K", "width": 100},
            {"name": "Urban Grocers Co.", "amount": "₱349K", "width": 84},
            {"name": "Fresh Fields Market", "amount": "₱271K", "width": 66},
        ],
    )


@router.get("/products", response_model=ListResponse[ProductRead])
def list_products(
    search: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    page: int = 1,
    page_size: int = 25,
    db: Session = Depends(get_db),
    context: AuthContext = Depends(require_roles("Catalog Moderator", "Operations/Disputes")),
) -> ListResponse[ProductRead]:
    offset, limit = _page(page, page_size)
    query = (
        select(Product, Seller.business_name, Category.name)
        .join(Seller, Product.seller_id == Seller.id)
        .join(Category, Product.category_id == Category.id)
        .where(Product.organization_id == context.organization_id)
    )
    count_query = select(func.count(Product.id)).where(Product.organization_id == context.organization_id)
    needle = _search(search)
    if needle:
        query = query.where(Product.name.ilike(needle) | Product.sku.ilike(needle))
        count_query = count_query.where(Product.name.ilike(needle) | Product.sku.ilike(needle))
    if status_filter:
        query = query.where(Product.status == status_filter)
        count_query = count_query.where(Product.status == status_filter)
    rows = db.execute(query.order_by(Product.updated_at.desc()).offset(offset).limit(limit)).all()
    items = [
        ProductRead(
            id=item.id,
            name=item.name,
            sku=item.sku,
            seller=seller,
            category=category,
            price=item.price,
            stock=item.stock,
            status=item.status,
            updated=item.updated_at,
        )
        for item, seller, category in rows
    ]
    return ListResponse(items=items, page=page, page_size=limit, total=db.scalar(count_query) or 0)


@router.post("/products", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
def create_product(
    payload: ProductCreate,
    db: Session = Depends(get_db),
    context: AuthContext = Depends(require_roles("Catalog Moderator")),
) -> ProductRead:
    seller = db.scalar(
        select(Seller).where(
            Seller.id == payload.seller_id, Seller.organization_id == context.organization_id
        )
    )
    category = db.scalar(
        select(Category).where(
            Category.id == payload.category_id, Category.organization_id == context.organization_id
        )
    )
    if not seller or not category:
        raise HTTPException(status_code=404, detail="Seller or category not found in organization")
    item = Product(
        organization_id=context.organization_id,
        seller_id=payload.seller_id,
        category_id=payload.category_id,
        name=payload.name,
        sku=payload.sku,
        price=payload.price,
        stock=payload.stock,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return ProductRead(
        id=item.id,
        name=item.name,
        sku=item.sku,
        seller=seller.business_name,
        category=category.name,
        price=item.price,
        stock=item.stock,
        status=item.status,
        updated=item.updated_at,
    )


def _product_action(product_id: uuid.UUID, action: str, db: Session, context: AuthContext) -> dict[str, str]:
    item = db.scalar(
        select(Product).where(Product.id == product_id, Product.organization_id == context.organization_id)
    )
    if not item:
        raise HTTPException(status_code=404, detail="Product not found")
    transitions = {
        "approve": ("Pending Review", "Active"),
        "archive": ("Active", "Archived"),
        "restore": ("Archived", "Active"),
    }
    allowed, target = transitions[action]
    if item.status != allowed:
        raise HTTPException(status_code=409, detail=f"Cannot {action} product from {item.status}")
    item.status = target
    db.commit()
    return {"id": str(item.id), "status": item.status}


@router.post("/products/{product_id}/approve")
def approve_product(
    product_id: uuid.UUID,
    db: Session = Depends(get_db),
    context: AuthContext = Depends(require_roles("Catalog Moderator")),
) -> dict[str, str]:
    return _product_action(product_id, "approve", db, context)


@router.post("/products/{product_id}/archive")
def archive_product(
    product_id: uuid.UUID,
    db: Session = Depends(get_db),
    context: AuthContext = Depends(require_roles("Catalog Moderator")),
) -> dict[str, str]:
    return _product_action(product_id, "archive", db, context)


@router.get("/orders", response_model=ListResponse[OrderRead])
def list_orders(
    search: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    page: int = 1,
    page_size: int = 25,
    db: Session = Depends(get_db),
    context: AuthContext = Depends(require_roles("Operations/Disputes", "Finance/Payouts")),
) -> ListResponse[OrderRead]:
    offset, limit = _page(page, page_size)
    query = select(Order).where(Order.organization_id == context.organization_id)
    count_query = select(func.count(Order.id)).where(Order.organization_id == context.organization_id)
    needle = _search(search)
    if needle:
        query = query.where(Order.order_number.ilike(needle) | Order.buyer_name.ilike(needle))
        count_query = count_query.where(Order.order_number.ilike(needle) | Order.buyer_name.ilike(needle))
    if status_filter:
        query = query.where(Order.status == status_filter)
        count_query = count_query.where(Order.status == status_filter)
    rows = db.scalars(query.order_by(Order.placed_at.desc()).offset(offset).limit(limit)).all()
    return ListResponse(
        items=[OrderRead.model_validate(item) for item in rows],
        page=page,
        page_size=limit,
        total=db.scalar(count_query) or 0,
    )


@router.get("/sellers", response_model=ListResponse[SellerRead])
def list_sellers(
    search: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    page: int = 1,
    page_size: int = 25,
    db: Session = Depends(get_db),
    context: AuthContext = Depends(
        require_roles("Catalog Moderator", "Operations/Disputes", "Finance/Payouts")
    ),
) -> ListResponse[SellerRead]:
    offset, limit = _page(page, page_size)
    query = select(Seller).where(Seller.organization_id == context.organization_id)
    count_query = select(func.count(Seller.id)).where(Seller.organization_id == context.organization_id)
    needle = _search(search)
    if needle:
        query = query.where(Seller.business_name.ilike(needle) | Seller.owner_name.ilike(needle))
        count_query = count_query.where(Seller.business_name.ilike(needle) | Seller.owner_name.ilike(needle))
    if status_filter:
        query = query.where(Seller.status == status_filter)
        count_query = count_query.where(Seller.status == status_filter)
    rows = db.scalars(query.order_by(Seller.business_name).offset(offset).limit(limit)).all()
    return ListResponse(
        items=[SellerRead.model_validate(item) for item in rows],
        page=page,
        page_size=limit,
        total=db.scalar(count_query) or 0,
    )


@router.get("/reviews", response_model=ListResponse[ReviewRead])
def list_reviews(
    status_filter: str | None = Query(default="Published", alias="status"),
    search: str | None = None,
    page: int = 1,
    page_size: int = 25,
    db: Session = Depends(get_db),
    context: AuthContext = Depends(require_roles("Catalog Moderator")),
) -> ListResponse[ReviewRead]:
    offset, limit = _page(page, page_size)
    query = select(Review).where(
        Review.organization_id == context.organization_id, Review.status == status_filter
    )
    count_query = select(func.count(Review.id)).where(
        Review.organization_id == context.organization_id, Review.status == status_filter
    )
    needle = _search(search)
    if needle:
        query = query.where(Review.product_name.ilike(needle) | Review.flag_reason.ilike(needle))
        count_query = count_query.where(Review.product_name.ilike(needle) | Review.flag_reason.ilike(needle))
    rows = db.scalars(query.order_by(Review.created_at.desc()).offset(offset).limit(limit)).all()
    return ListResponse(
        items=[ReviewRead.model_validate(item) for item in rows],
        page=page,
        page_size=limit,
        total=db.scalar(count_query) or 0,
    )


@router.post("/reviews/{review_id}/{action}")
def moderate_review(
    review_id: uuid.UUID,
    action: str,
    db: Session = Depends(get_db),
    context: AuthContext = Depends(require_roles("Catalog Moderator")),
) -> dict[str, str]:
    if action not in {"restore", "remove"}:
        raise HTTPException(status_code=404, detail="Unknown review action")
    item = db.scalar(
        select(Review).where(Review.id == review_id, Review.organization_id == context.organization_id)
    )
    if not item:
        raise HTTPException(status_code=404, detail="Review not found")
    item.status = "Published" if action == "restore" else "Removed"
    db.commit()
    return {"id": str(item.id), "status": item.status}


@router.get("/disputes", response_model=ListResponse[DisputeRead])
def list_disputes(
    status_filter: str | None = Query(default="Open", alias="status"),
    search: str | None = None,
    page: int = 1,
    page_size: int = 25,
    db: Session = Depends(get_db),
    context: AuthContext = Depends(require_roles("Operations/Disputes")),
) -> ListResponse[DisputeRead]:
    offset, limit = _page(page, page_size)
    query = select(Dispute).where(Dispute.organization_id == context.organization_id)
    count_query = select(func.count(Dispute.id)).where(Dispute.organization_id == context.organization_id)
    if status_filter == "Resolved":
        query = query.where(Dispute.status == "Resolved")
        count_query = count_query.where(Dispute.status == "Resolved")
    else:
        query = query.where(Dispute.status != "Resolved")
        count_query = count_query.where(Dispute.status != "Resolved")
    needle = _search(search)
    if needle:
        query = query.where(
            Dispute.dispute_number.ilike(needle)
            | Dispute.order_number.ilike(needle)
            | Dispute.seller_name.ilike(needle)
        )
        count_query = count_query.where(
            Dispute.dispute_number.ilike(needle)
            | Dispute.order_number.ilike(needle)
            | Dispute.seller_name.ilike(needle)
        )
    rows = db.scalars(query.order_by(Dispute.created_at.desc()).offset(offset).limit(limit)).all()
    return ListResponse(
        items=[DisputeRead.model_validate(item) for item in rows],
        page=page,
        page_size=limit,
        total=db.scalar(count_query) or 0,
    )


@router.post("/disputes/{dispute_id}/resolve", response_model=DisputeRead)
def resolve_dispute(
    dispute_id: uuid.UUID,
    payload: DisputeResolve,
    db: Session = Depends(get_db),
    context: AuthContext = Depends(require_roles("Operations/Disputes")),
) -> DisputeRead:
    item = db.scalar(
        select(Dispute).where(Dispute.id == dispute_id, Dispute.organization_id == context.organization_id)
    )
    if not item:
        raise HTTPException(status_code=404, detail="Dispute not found")
    if item.status == "Resolved":
        raise HTTPException(status_code=409, detail="Dispute is already resolved")
    item.status = "Resolved"
    item.outcome = payload.outcome
    item.resolution_notes = payload.resolution_notes
    item.resolved_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    return DisputeRead.model_validate(item)


@router.get("/payouts", response_model=ListResponse[PayoutRead])
def list_payouts(
    status_filter: str | None = Query(default=None, alias="status"),
    search: str | None = None,
    page: int = 1,
    page_size: int = 25,
    db: Session = Depends(get_db),
    context: AuthContext = Depends(require_roles("Finance/Payouts")),
) -> ListResponse[PayoutRead]:
    offset, limit = _page(page, page_size)
    query = select(Payout).where(Payout.organization_id == context.organization_id)
    count_query = select(func.count(Payout.id)).where(Payout.organization_id == context.organization_id)
    needle = _search(search)
    if status_filter:
        query = query.where(Payout.status == status_filter)
        count_query = count_query.where(Payout.status == status_filter)
    if needle:
        query = query.where(Payout.seller_name.ilike(needle))
        count_query = count_query.where(Payout.seller_name.ilike(needle))
    rows = db.scalars(query.order_by(Payout.generated_at.desc()).offset(offset).limit(limit)).all()
    return ListResponse(
        items=[PayoutRead.model_validate(item) for item in rows],
        page=page,
        page_size=limit,
        total=db.scalar(count_query) or 0,
    )


@router.post("/payouts/generate", response_model=PayoutRead, status_code=status.HTTP_201_CREATED)
def generate_payout(
    db: Session = Depends(get_db), context: AuthContext = Depends(require_roles("Finance/Payouts"))
) -> PayoutRead:
    existing = db.scalar(
        select(Payout).where(
            Payout.organization_id == context.organization_id,
            Payout.seller_name == "Urban Grocers Co.",
            Payout.period == "Jul 1–15, 2026",
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail="Payout batch already exists for this period")
    item = Payout(
        organization_id=context.organization_id,
        seller_name="Urban Grocers Co.",
        period="Jul 1–15, 2026",
        amount=Decimal("48320.00"),
        status="Pending",
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return PayoutRead.model_validate(item)


@router.post("/payouts/{payout_id}/release", response_model=PayoutRead)
def release_payout(
    payout_id: uuid.UUID,
    db: Session = Depends(get_db),
    context: AuthContext = Depends(require_roles("Finance/Payouts")),
) -> PayoutRead:
    item = db.scalar(
        select(Payout).where(Payout.id == payout_id, Payout.organization_id == context.organization_id)
    )
    if not item:
        raise HTTPException(status_code=404, detail="Payout not found")
    if item.status != "Pending":
        raise HTTPException(status_code=409, detail="Only pending payouts can be released")
    item.status = "Processing"
    db.commit()
    db.refresh(item)
    return PayoutRead.model_validate(item)


@router.get("/categories", response_model=ListResponse[CategoryRead])
def list_categories(
    search: str | None = None,
    page: int = 1,
    page_size: int = 100,
    db: Session = Depends(get_db),
    context: AuthContext = Depends(require_roles("Marketplace Admin", "Catalog Moderator")),
) -> ListResponse[CategoryRead]:
    offset, limit = _page(page, page_size)
    query = select(Category).where(Category.organization_id == context.organization_id)
    count_query = select(func.count(Category.id)).where(Category.organization_id == context.organization_id)
    needle = _search(search)
    if needle:
        query = query.where(Category.name.ilike(needle) | Category.slug.ilike(needle))
        count_query = count_query.where(Category.name.ilike(needle) | Category.slug.ilike(needle))
    rows = db.scalars(query.order_by(Category.name).offset(offset).limit(limit)).all()
    return ListResponse(
        items=[CategoryRead.model_validate(item) for item in rows],
        page=page,
        page_size=limit,
        total=db.scalar(count_query) or 0,
    )


@router.post("/categories", response_model=CategoryRead, status_code=status.HTTP_201_CREATED)
def create_category(
    payload: CategoryCreate,
    db: Session = Depends(get_db),
    context: AuthContext = Depends(require_roles("Marketplace Admin", "Catalog Moderator")),
) -> CategoryRead:
    item = Category(
        organization_id=context.organization_id,
        name=payload.name,
        slug=payload.slug,
        parent_id=payload.parent_id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return CategoryRead.model_validate(item)


@router.get("/policies/commission")
def get_commission_policy(
    context: AuthContext = Depends(
        require_roles("Marketplace Admin", "Catalog Moderator", "Finance/Payouts")
    ),
) -> dict[str, Any]:
    return {"default_rate": 12.0, "overrides": {"electronics": 15.0, "groceries": 10.0}, "mode": "override"}


@router.put("/policies/commission")
def update_commission_policy(
    payload: dict[str, Any], context: AuthContext = Depends(require_roles("Marketplace Admin"))
) -> dict[str, Any]:
    return {"organization_id": str(context.organization_id), **payload}


@router.get("/policies/dispute")
def get_dispute_policy(
    context: AuthContext = Depends(require_roles("Marketplace Admin", "Operations/Disputes")),
) -> dict[str, Any]:
    return {"response_window_days": 3, "auto_escalate_after_days": 7}


@router.put("/policies/dispute")
def update_dispute_policy(
    payload: dict[str, Any], context: AuthContext = Depends(require_roles("Marketplace Admin"))
) -> dict[str, Any]:
    return {"organization_id": str(context.organization_id), **payload}
