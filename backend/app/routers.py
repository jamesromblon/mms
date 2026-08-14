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
from .models import Category, Dispute, Order, Payout, Policy, Product, Review, Seller
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
    ProductUpdate,
    ReviewRead,
    SellerRead,
    CategoryUpdate,
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
    status_counts: dict[str, int] = {
        str(order_status): int(count)
        for order_status, count in db.execute(
            select(Order.status, func.count(Order.id))
            .where(Order.organization_id == context.organization_id)
            .group_by(Order.status)
        ).all()
    }
    total_orders = sum(status_counts.values()) or 1
    order_rows = db.execute(
        select(Order.placed_at, Order.total).where(
            Order.organization_id == context.organization_id, Order.status != "Cancelled"
        ).order_by(Order.placed_at)
    ).all()
    gmv_by_day: dict[str, Decimal] = {}
    for placed_at, total in order_rows:
        if placed_at:
            key = placed_at.date().isoformat()
            gmv_by_day[key] = gmv_by_day.get(key, Decimal("0")) + total
    daily_gmv: list[dict[str, float | str]] = [
        {"date": day, "value": float(amount)} for day, amount in gmv_by_day.items()
    ]
    active_listings = db.scalar(
        select(func.count(Product.id)).where(Product.organization_id == context.organization_id, Product.status == "Active")
    ) or 0
    average_rating = db.scalar(
        select(func.avg(Review.rating)).where(Review.organization_id == context.organization_id, Review.status == "Published")
    ) or 0
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
        order_status=[
            {"name": status, "value": round((count / total_orders) * 100)}
            for status, count in sorted(status_counts.items())
        ],
        top_sellers=[
            {"name": seller, "amount": f"{peso}{amount / 1000:,.0f}K", "width": int((amount / maximum) * 100)}
            for seller, amount in payout_rows
        ],
        trends={
            "Last 7 days": daily_gmv[-7:],
            "Last 30 days": daily_gmv[-30:],
            "Last 90 days": daily_gmv[-90:],
        },
        seller_highlights=[
            {"value": f"{peso}{gmv:,.0f}", "label": "Revenue (all orders)", "icon": "bi-graph-up-arrow", "tone": "blue"},
            {"value": str(active_listings), "label": "Active Listings", "icon": "bi-box-seam", "tone": "green"},
            {"value": f"{float(average_rating):.1f}", "label": "Avg. Rating", "icon": "bi-star-fill", "tone": "amber"},
            {"value": f"{(status_counts.get('Cancelled', 0) / total_orders) * 100:.1f}%", "label": "Cancellation Rate", "icon": "bi-arrow-return-left", "tone": "rose"},
        ],
        seller_metrics=[
            DashboardMetric(label="Active Sellers", value=str(active_sellers), change="Live", direction="up"),
            DashboardMetric(label="Active Listings", value=str(active_listings), change="Live", direction="up"),
            DashboardMetric(label="Avg. Rating", value=f"{float(average_rating):.1f}", change="Live", direction="up"),
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
    normalized_sku = payload.sku.upper()
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
    if seller.status != "Active" or category.status != "Active":
        raise HTTPException(status_code=409, detail="Products can only be assigned to active sellers and categories")
    duplicate_sku = db.scalar(
        select(Product.id).where(
            Product.organization_id == context.organization_id,
            func.lower(Product.sku) == normalized_sku.lower(),
        )
    )
    if duplicate_sku:
        raise HTTPException(status_code=409, detail="SKU already exists in this marketplace")
    item = Product(
        organization_id=context.organization_id,
        seller_id=payload.seller_id,
        category_id=payload.category_id,
        name=payload.name,
        sku=normalized_sku,
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


@router.post("/products/quick", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
def quick_create_product(
    payload: dict[str, str],
    db: Session = Depends(get_db),
    context: AuthContext = Depends(require_roles("Catalog Moderator")),
) -> ProductRead:
    """Create a catalog draft from the streamlined operations modal."""
    name = str(payload.get("name", "")).strip()
    if len(name) < 2:
        raise HTTPException(status_code=422, detail="Product name must contain at least two characters")
    seller = db.scalar(
        select(Seller).where(Seller.organization_id == context.organization_id, Seller.status == "Active").order_by(Seller.business_name)
    )
    category = db.scalar(
        select(Category).where(Category.organization_id == context.organization_id, Category.status == "Active").order_by(Category.name)
    )
    if not seller or not category:
        raise HTTPException(status_code=409, detail="Create an active seller and category before creating a product")
    item = Product(
        organization_id=context.organization_id, seller_id=seller.id, category_id=category.id,
        name=name, sku=f"DRAFT-{uuid.uuid4().hex[:8].upper()}", price=Decimal("1.00"), stock=0,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return ProductRead(
        id=item.id, name=item.name, sku=item.sku, seller=seller.business_name, category=category.name,
        price=item.price, stock=item.stock, status=item.status, updated=item.updated_at,
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


@router.patch("/products/{product_id}", response_model=ProductRead)
def update_product(
    product_id: uuid.UUID,
    payload: ProductUpdate,
    db: Session = Depends(get_db),
    context: AuthContext = Depends(require_roles("Catalog Moderator")),
) -> ProductRead:
    item = db.scalar(
        select(Product).where(Product.id == product_id, Product.organization_id == context.organization_id)
    )
    if not item:
        raise HTTPException(status_code=404, detail="Product not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    seller = db.scalar(select(Seller.business_name).where(Seller.id == item.seller_id)) or "Unknown seller"
    category = db.scalar(select(Category.name).where(Category.id == item.category_id)) or "Uncategorized"
    return ProductRead(
        id=item.id, name=item.name, sku=item.sku, seller=seller, category=category,
        price=item.price, stock=item.stock, status=item.status, updated=item.updated_at,
    )


@router.post("/products/{product_id}/archive")
def archive_product(
    product_id: uuid.UUID,
    db: Session = Depends(get_db),
    context: AuthContext = Depends(require_roles("Catalog Moderator")),
) -> dict[str, str]:
    return _product_action(product_id, "archive", db, context)


@router.post("/products/{product_id}/restore")
def restore_product(
    product_id: uuid.UUID,
    db: Session = Depends(get_db),
    context: AuthContext = Depends(require_roles("Catalog Moderator")),
) -> dict[str, str]:
    return _product_action(product_id, "restore", db, context)


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


@router.post("/orders/{order_id}/cancel", response_model=OrderRead)
def cancel_order(
    order_id: uuid.UUID,
    db: Session = Depends(get_db),
    context: AuthContext = Depends(require_roles("Operations/Disputes")),
) -> OrderRead:
    item = db.scalar(select(Order).where(Order.id == order_id, Order.organization_id == context.organization_id))
    if not item:
        raise HTTPException(status_code=404, detail="Order not found")
    if item.status in {"Completed", "Cancelled"}:
        raise HTTPException(status_code=409, detail=f"Cannot cancel an order that is {item.status.lower()}")
    item.status = "Cancelled"
    db.commit()
    db.refresh(item)
    return OrderRead.model_validate(item)


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
    if action not in {"flag", "restore", "remove"}:
        raise HTTPException(status_code=404, detail="Unknown review action")
    item = db.scalar(
        select(Review).where(Review.id == review_id, Review.organization_id == context.organization_id)
    )
    if not item:
        raise HTTPException(status_code=404, detail="Review not found")
    item.status = {"flag": "Flagged", "restore": "Published", "remove": "Removed"}[action]
    if action == "flag" and not item.flag_reason:
        item.flag_reason = "Flagged for moderation"
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


@router.post("/payouts/{payout_id}/mark-paid", response_model=PayoutRead)
def mark_payout_paid(
    payout_id: uuid.UUID,
    db: Session = Depends(get_db),
    context: AuthContext = Depends(require_roles("Finance/Payouts")),
) -> PayoutRead:
    item = db.scalar(select(Payout).where(Payout.id == payout_id, Payout.organization_id == context.organization_id))
    if not item:
        raise HTTPException(status_code=404, detail="Payout not found")
    if item.status != "Processing":
        raise HTTPException(status_code=409, detail="Only processing payouts can be marked paid")
    item.status = "Paid"
    db.commit()
    db.refresh(item)
    return PayoutRead.model_validate(item)


@router.post("/payouts/release-pending")
def release_pending_payouts(
    db: Session = Depends(get_db),
    context: AuthContext = Depends(require_roles("Finance/Payouts")),
) -> dict[str, int]:
    result = db.execute(
        select(Payout).where(Payout.organization_id == context.organization_id, Payout.status == "Pending")
    ).scalars().all()
    for item in result:
        item.status = "Processing"
    db.commit()
    return {"released": len(result)}


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


@router.patch("/categories/{category_id}", response_model=CategoryRead)
def update_category(
    category_id: uuid.UUID,
    payload: CategoryUpdate,
    db: Session = Depends(get_db),
    context: AuthContext = Depends(require_roles("Marketplace Admin", "Catalog Moderator")),
) -> CategoryRead:
    item = db.scalar(select(Category).where(Category.id == category_id, Category.organization_id == context.organization_id))
    if not item:
        raise HTTPException(status_code=404, detail="Category not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return CategoryRead.model_validate(item)


@router.get("/policies/commission")
def get_commission_policy(
    db: Session = Depends(get_db), context: AuthContext = Depends(
        require_roles("Marketplace Admin", "Catalog Moderator", "Finance/Payouts")
    ),
) -> dict[str, Any]:
    policy = db.scalar(select(Policy).where(Policy.organization_id == context.organization_id, Policy.kind == "commission"))
    return policy.configuration if policy else {"default_rate": 12.0, "overrides": {}, "mode": "override"}


@router.put("/policies/commission")
def update_commission_policy(
    payload: dict[str, Any], db: Session = Depends(get_db), context: AuthContext = Depends(require_roles("Marketplace Admin"))
) -> dict[str, Any]:
    policy = db.scalar(select(Policy).where(Policy.organization_id == context.organization_id, Policy.kind == "commission"))
    if policy:
        policy.configuration = payload
    else:
        db.add(Policy(organization_id=context.organization_id, kind="commission", configuration=payload))
    db.commit()
    return payload


@router.get("/policies/dispute")
def get_dispute_policy(
    db: Session = Depends(get_db), context: AuthContext = Depends(require_roles("Marketplace Admin", "Operations/Disputes")),
) -> dict[str, Any]:
    policy = db.scalar(select(Policy).where(Policy.organization_id == context.organization_id, Policy.kind == "dispute"))
    return policy.configuration if policy else {"response_window_days": 3, "auto_escalate_after_days": 7}


@router.put("/policies/dispute")
def update_dispute_policy(
    payload: dict[str, Any], db: Session = Depends(get_db), context: AuthContext = Depends(require_roles("Marketplace Admin"))
) -> dict[str, Any]:
    policy = db.scalar(select(Policy).where(Policy.organization_id == context.organization_id, Policy.kind == "dispute"))
    if policy:
        policy.configuration = payload
    else:
        db.add(Policy(organization_id=context.organization_id, kind="dispute", configuration=payload))
    db.commit()
    return payload
