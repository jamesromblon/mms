from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from passlib.context import CryptContext
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .auth import DEV_ORGANIZATION_ID, AuthContext, create_local_access_token, get_auth_context, require_roles
from .config import get_settings
from .db import get_db
from .models import (
    Category,
    CommissionLedger,
    Dispute,
    MarketplaceUser,
    Order,
    OrderCustomer,
    OrderItem,
    Payment,
    Payout,
    Policy,
    Product,
    Review,
    Seller,
    SellerApplication,
)
from .schemas import (
    CategoryCreate,
    CategoryRead,
    DashboardRead,
    DashboardMetric,
    CheckoutCreate,
    CommissionBalanceRead,
    CommissionPaymentCreate,
    DisputeRead,
    DisputeResolve,
    ListResponse,
    AuthSessionRead,
    AuthUserRead,
    LoginRequest,
    OrderRead,
    PayoutRead,
    ProductCreate,
    ProductBulkDelete,
    ProductRead,
    ProductUpdate,
    RegisterRequest,
    ReviewRead,
    SellerApplicationCreate,
    SellerApplicationDecision,
    SellerApplicationRead,
    SellerOrderRead,
    SellerProductCreate,
    SellerRead,
    CategoryUpdate,
    CustomerOrderRead,
)

router = APIRouter()
password_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _page(page: int, page_size: int) -> tuple[int, int]:
    return (max(page, 1) - 1) * min(max(page_size, 1), 100), min(max(page_size, 1), 100)


def _search(value: str | None) -> str | None:
    return f"%{value.strip()}%" if value and value.strip() else None


def _seller_for_context(db: Session, context: AuthContext) -> Seller:
    query = select(Seller).where(Seller.organization_id == context.organization_id)
    if context.seller_id:
        query = query.where(Seller.id == context.seller_id)
    elif context.subject == "local-seller":
        query = query.where(Seller.business_name == "Northstar Gadgets")
    seller = db.scalar(query.order_by(Seller.business_name))
    if not seller:
        raise HTTPException(status_code=404, detail="Seller profile not found in this marketplace")
    return seller


def _product_read(item: Product, seller_name: str, category_name: str) -> ProductRead:
    attributes = item.attributes or {}
    return ProductRead(
        id=item.id,
        name=item.name,
        sku=item.sku,
        seller_id=item.seller_id,
        category_id=item.category_id,
        seller=seller_name,
        category=category_name,
        price=item.price,
        stock=item.stock,
        status=item.status,
        description=str(attributes.get("description", "")),
        image_url=attributes.get("image_url"),
        updated=item.updated_at,
    )


def _commission_configuration(db: Session, organization_id: uuid.UUID) -> dict[str, Any]:
    policy = db.scalar(
        select(Policy).where(Policy.organization_id == organization_id, Policy.kind == "commission")
    )
    return policy.configuration if policy else {
        "default_rate": 12.0,
        "overrides": {},
        "grace_period_days": 7,
    }


def _commission_balance(db: Session, seller: Seller, context: AuthContext) -> CommissionBalanceRead:
    today = date.today()
    config = _commission_configuration(db, context.organization_id)
    grace_days = int(config.get("grace_period_days", 7))
    rows = db.scalars(
        select(CommissionLedger).where(
            CommissionLedger.organization_id == context.organization_id,
            CommissionLedger.seller_id == seller.id,
            CommissionLedger.status.in_(["Due", "Overdue"]),
        )
    ).all()
    due_amount = sum((row.commission_amount for row in rows), Decimal("0"))
    overdue_amount = sum(
        (row.commission_amount for row in rows if row.status == "Overdue" or row.due_on < today),
        Decimal("0"),
    )
    next_due = min((row.due_on for row in rows), default=None)
    status = "Suspended" if seller.status == "Suspended" else "Overdue" if overdue_amount else "Due" if due_amount else "Current"
    return CommissionBalanceRead(
        seller_id=seller.id,
        seller_name=seller.business_name,
        commission_rate=seller.commission_rate,
        due_amount=due_amount,
        overdue_amount=overdue_amount,
        grace_period_days=grace_days,
        status=status,
        next_due_on=next_due,
    )


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
        _product_read(item, seller, category)
        for item, seller, category in rows
    ]
    return ListResponse(items=items, page=page, page_size=limit, total=db.scalar(count_query) or 0)


@router.get("/store/products", response_model=ListResponse[ProductRead])
def list_store_products(
    search: str | None = None,
    category: str | None = None,
    page: int = 1,
    page_size: int = 24,
    db: Session = Depends(get_db),
    context: AuthContext = Depends(get_auth_context),
) -> ListResponse[ProductRead]:
    offset, limit = _page(page, page_size)
    query = (
        select(Product, Seller.business_name, Category.name)
        .join(Seller, Product.seller_id == Seller.id)
        .join(Category, Product.category_id == Category.id)
        .where(
            Product.organization_id == context.organization_id,
            Product.status == "Active",
            Seller.status == "Active",
            Category.status == "Active",
        )
    )
    count_query = select(func.count(Product.id)).join(Seller, Product.seller_id == Seller.id).join(Category, Product.category_id == Category.id).where(
        Product.organization_id == context.organization_id,
        Product.status == "Active",
        Seller.status == "Active",
        Category.status == "Active",
    )
    needle = _search(search)
    if needle:
        query = query.where(Product.name.ilike(needle) | Product.sku.ilike(needle) | Seller.business_name.ilike(needle))
        count_query = count_query.where(Product.name.ilike(needle) | Product.sku.ilike(needle) | Seller.business_name.ilike(needle))
    if category:
        query = query.where(Category.slug == category)
        count_query = count_query.where(Category.slug == category)
    rows = db.execute(query.order_by(Product.updated_at.desc()).offset(offset).limit(limit)).all()
    return ListResponse(
        items=[_product_read(item, seller, category_name) for item, seller, category_name in rows],
        page=page,
        page_size=limit,
        total=db.scalar(count_query) or 0,
    )


@router.get("/seller/products", response_model=ListResponse[ProductRead])
def list_seller_products(
    search: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    page: int = 1,
    page_size: int = 50,
    db: Session = Depends(get_db),
    context: AuthContext = Depends(require_roles("Seller")),
) -> ListResponse[ProductRead]:
    seller = _seller_for_context(db, context)
    offset, limit = _page(page, page_size)
    query = (
        select(Product, Seller.business_name, Category.name)
        .join(Seller, Product.seller_id == Seller.id)
        .join(Category, Product.category_id == Category.id)
        .where(Product.organization_id == context.organization_id, Product.seller_id == seller.id)
    )
    count_query = select(func.count(Product.id)).where(Product.organization_id == context.organization_id, Product.seller_id == seller.id)
    needle = _search(search)
    if needle:
        query = query.where(Product.name.ilike(needle) | Product.sku.ilike(needle))
        count_query = count_query.where(Product.name.ilike(needle) | Product.sku.ilike(needle))
    if status_filter:
        query = query.where(Product.status == status_filter)
        count_query = count_query.where(Product.status == status_filter)
    rows = db.execute(query.order_by(Product.updated_at.desc()).offset(offset).limit(limit)).all()
    return ListResponse(
        items=[_product_read(item, seller_name, category_name) for item, seller_name, category_name in rows],
        page=page,
        page_size=limit,
        total=db.scalar(count_query) or 0,
    )


@router.post("/seller/products", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
def create_seller_product(
    payload: SellerProductCreate,
    db: Session = Depends(get_db),
    context: AuthContext = Depends(require_roles("Seller")),
) -> ProductRead:
    seller = _seller_for_context(db, context)
    category = db.scalar(
        select(Category).where(Category.id == payload.category_id, Category.organization_id == context.organization_id)
    )
    if not category:
        raise HTTPException(status_code=404, detail="Category not found in organization")
    if seller.status != "Active" or category.status != "Active":
        raise HTTPException(status_code=409, detail="Products can only be assigned to active sellers and categories")
    normalized_sku = payload.sku.upper()
    if db.scalar(select(Product.id).where(Product.organization_id == context.organization_id, func.lower(Product.sku) == normalized_sku.lower())):
        raise HTTPException(status_code=409, detail="SKU already exists in this marketplace")
    item = Product(
        organization_id=context.organization_id,
        seller_id=seller.id,
        category_id=category.id,
        name=payload.name,
        sku=normalized_sku,
        price=payload.price,
        stock=payload.stock,
        status="Pending Review",
        attributes={"description": payload.description, "image_url": payload.image_url} if payload.image_url else {"description": payload.description},
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _product_read(item, seller.business_name, category.name)


@router.get("/seller/orders", response_model=ListResponse[SellerOrderRead])
def list_seller_orders(
    status_filter: str | None = Query(default=None, alias="status"),
    search: str | None = None,
    page: int = 1,
    page_size: int = 50,
    db: Session = Depends(get_db),
    context: AuthContext = Depends(require_roles("Seller")),
) -> ListResponse[SellerOrderRead]:
    seller = _seller_for_context(db, context)
    order_ids = select(OrderItem.order_id).where(
        OrderItem.organization_id == context.organization_id,
        OrderItem.seller_id == seller.id,
    )
    query = select(Order).where(Order.organization_id == context.organization_id, Order.id.in_(order_ids))
    count_query = select(func.count(Order.id)).where(Order.organization_id == context.organization_id, Order.id.in_(order_ids))
    needle = _search(search)
    if needle:
        query = query.where(Order.order_number.ilike(needle) | Order.buyer_name.ilike(needle))
        count_query = count_query.where(Order.order_number.ilike(needle) | Order.buyer_name.ilike(needle))
    if status_filter:
        query = query.where(Order.status == status_filter)
        count_query = count_query.where(Order.status == status_filter)
    offset, limit = _page(page, page_size)
    orders = db.scalars(query.order_by(Order.placed_at.desc()).offset(offset).limit(limit)).all()
    result = []
    for item in orders:
        payment = db.scalar(select(Payment).where(Payment.order_id == item.id))
        result.append(SellerOrderRead(
            order_number=item.order_number,
            buyer_name=item.buyer_name,
            item_count=item.item_count,
            total=item.total,
            status=item.status,
            payment_status=payment.status if payment else "Unknown",
            placed_at=item.placed_at,
        ))
    return ListResponse(items=result, page=page, page_size=limit, total=db.scalar(count_query) or 0)


@router.post("/seller/orders/{order_id}/mark-shipped", response_model=SellerOrderRead)
def mark_seller_order_shipped(
    order_id: uuid.UUID,
    db: Session = Depends(get_db),
    context: AuthContext = Depends(require_roles("Seller")),
) -> SellerOrderRead:
    seller = _seller_for_context(db, context)
    item = db.scalar(select(Order).where(Order.id == order_id, Order.organization_id == context.organization_id, Order.id.in_(select(OrderItem.order_id).where(OrderItem.seller_id == seller.id))))
    if not item:
        raise HTTPException(status_code=404, detail="Order not found for this seller")
    if item.status not in {"Confirmed", "Active", "Processing"}:
        raise HTTPException(status_code=409, detail=f"Cannot ship an order that is {item.status}")
    item.status = "Shipped"
    db.commit()
    payment = db.scalar(select(Payment).where(Payment.order_id == item.id))
    return SellerOrderRead(order_number=item.order_number, buyer_name=item.buyer_name, item_count=item.item_count, total=item.total, status=item.status, payment_status=payment.status if payment else "Unknown", placed_at=item.placed_at)


@router.get("/seller/commission", response_model=CommissionBalanceRead)
def get_seller_commission(
    db: Session = Depends(get_db),
    context: AuthContext = Depends(require_roles("Seller")),
) -> CommissionBalanceRead:
    return _commission_balance(db, _seller_for_context(db, context), context)


@router.post("/seller/commission/pay", response_model=CommissionBalanceRead)
def pay_seller_commission(
    payload: CommissionPaymentCreate,
    db: Session = Depends(get_db),
    context: AuthContext = Depends(require_roles("Seller")),
) -> CommissionBalanceRead:
    seller = _seller_for_context(db, context)
    balance = _commission_balance(db, seller, context)
    if payload.amount < balance.due_amount:
        raise HTTPException(status_code=409, detail=f"Pay the full outstanding commission of {balance.due_amount:.2f} before submitting settlement")
    rows = db.scalars(select(CommissionLedger).where(CommissionLedger.organization_id == context.organization_id, CommissionLedger.seller_id == seller.id, CommissionLedger.status.in_(["Due", "Overdue"]))).all()
    paid_at = datetime.now(timezone.utc)
    for row in rows:
        row.status = "Paid"
        row.paid_at = paid_at
    db.commit()
    return _commission_balance(db, seller, context)


@router.post("/auth/register", response_model=AuthSessionRead, status_code=status.HTTP_201_CREATED)
def register_local_account(
    payload: RegisterRequest,
    db: Session = Depends(get_db),
) -> AuthSessionRead:
    settings = get_settings()
    if settings.argo_auth_mode != "dev":
        raise HTTPException(status_code=404, detail="Use the ARGO authentication platform for account registration")
    email = payload.email.lower()
    if db.scalar(select(MarketplaceUser).where(MarketplaceUser.organization_id == DEV_ORGANIZATION_ID, func.lower(MarketplaceUser.email) == email)):
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    seller_id = None
    account_status = "Active"
    business_name = payload.business_name.strip() if payload.business_name else None
    if payload.role == "Seller":
        if not business_name or len(business_name) < 2:
            raise HTTPException(status_code=422, detail="Business name is required for seller registration")
        account_status = "Pending Approval"
    user = MarketplaceUser(
        id=uuid.uuid4(),
        organization_id=DEV_ORGANIZATION_ID,
        subject=f"local-user-{uuid.uuid4().hex}",
        email=email,
        full_name=payload.full_name,
        password_hash=password_context.hash(payload.password),
        seller_id=seller_id,
        role=payload.role,
        status=account_status,
    )
    db.add(user)
    if payload.role == "Seller":
        db.add(SellerApplication(id=uuid.uuid4(), organization_id=DEV_ORGANIZATION_ID, business_name=business_name, owner_name=payload.full_name, email=email, phone=payload.phone))
    db.commit()
    token = create_local_access_token(user.subject, user.organization_id, frozenset({user.role}), user.seller_id, settings) if account_status == "Active" else None
    return AuthSessionRead(access_token=token, user=AuthUserRead(subject=user.subject, full_name=user.full_name, email=user.email, role=user.role, seller_id=user.seller_id))


@router.post("/auth/login", response_model=AuthSessionRead)
def login_local_account(
    payload: LoginRequest,
    db: Session = Depends(get_db),
) -> AuthSessionRead:
    settings = get_settings()
    if settings.argo_auth_mode != "dev":
        raise HTTPException(status_code=404, detail="Use the ARGO authentication platform for login")
    user = db.scalar(select(MarketplaceUser).where(MarketplaceUser.organization_id == DEV_ORGANIZATION_ID, func.lower(MarketplaceUser.email) == payload.email.lower()))
    if not user or not password_context.verify(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if user.status != "Active":
        raise HTTPException(status_code=403, detail="This account is awaiting seller approval")
    token = create_local_access_token(user.subject, user.organization_id, frozenset({user.role}), user.seller_id, settings)
    return AuthSessionRead(access_token=token, user=AuthUserRead(subject=user.subject, full_name=user.full_name, email=user.email, role=user.role, seller_id=user.seller_id))


@router.post("/applications", response_model=SellerApplicationRead, status_code=status.HTTP_201_CREATED)
def create_seller_application(
    payload: SellerApplicationCreate,
    db: Session = Depends(get_db),
    context: AuthContext = Depends(get_auth_context),
) -> SellerApplicationRead:
    duplicate = db.scalar(
        select(SellerApplication).where(
            SellerApplication.organization_id == context.organization_id,
            func.lower(SellerApplication.email) == payload.email.lower(),
            SellerApplication.status == "Pending Approval",
        )
    )
    if duplicate:
        raise HTTPException(status_code=409, detail="An application for this email is already under review")
    item = SellerApplication(
        id=uuid.uuid4(),
        organization_id=context.organization_id,
        business_name=payload.business_name,
        owner_name=payload.owner_name,
        email=payload.email.lower(),
        phone=payload.phone,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return SellerApplicationRead.model_validate(item)


@router.get("/applications", response_model=ListResponse[SellerApplicationRead])
def list_seller_applications(
    status_filter: str | None = Query(default="Pending Approval", alias="status"),
    search: str | None = None,
    page: int = 1,
    page_size: int = 50,
    db: Session = Depends(get_db),
    context: AuthContext = Depends(require_roles("Marketplace Admin")),
) -> ListResponse[SellerApplicationRead]:
    offset, limit = _page(page, page_size)
    query = select(SellerApplication).where(SellerApplication.organization_id == context.organization_id)
    count_query = select(func.count(SellerApplication.id)).where(SellerApplication.organization_id == context.organization_id)
    needle = _search(search)
    if status_filter:
        query = query.where(SellerApplication.status == status_filter)
        count_query = count_query.where(SellerApplication.status == status_filter)
    if needle:
        query = query.where(SellerApplication.business_name.ilike(needle) | SellerApplication.owner_name.ilike(needle) | SellerApplication.email.ilike(needle))
        count_query = count_query.where(SellerApplication.business_name.ilike(needle) | SellerApplication.owner_name.ilike(needle) | SellerApplication.email.ilike(needle))
    rows = db.scalars(query.order_by(SellerApplication.created_at.desc()).offset(offset).limit(limit)).all()
    return ListResponse(items=[SellerApplicationRead.model_validate(item) for item in rows], page=page, page_size=limit, total=db.scalar(count_query) or 0)


@router.post("/applications/{application_id}/decision", response_model=SellerApplicationRead)
def decide_seller_application(
    application_id: uuid.UUID,
    payload: SellerApplicationDecision,
    db: Session = Depends(get_db),
    context: AuthContext = Depends(require_roles("Marketplace Admin")),
) -> SellerApplicationRead:
    item = db.scalar(select(SellerApplication).where(SellerApplication.id == application_id, SellerApplication.organization_id == context.organization_id))
    if not item:
        raise HTTPException(status_code=404, detail="Seller application not found")
    if item.status != "Pending Approval":
        raise HTTPException(status_code=409, detail="This application has already been decided")
    item.status = payload.decision
    item.decision_note = payload.note
    item.reviewed_at = datetime.now(timezone.utc)
    if payload.decision == "Approved":
        config = _commission_configuration(db, context.organization_id)
        default_rate = Decimal(str(config.get("default_rate", 12)))
        existing = db.scalar(select(Seller).where(Seller.organization_id == context.organization_id, func.lower(Seller.business_name) == item.business_name.lower()))
        if not existing:
            existing = Seller(id=uuid.uuid4(), organization_id=context.organization_id, business_name=item.business_name, owner_name=item.owner_name, commission_rate=default_rate, rating=Decimal("0.00"), status="Active", joined_on=date.today())
            db.add(existing)
            db.flush()
        account = db.scalar(select(MarketplaceUser).where(MarketplaceUser.organization_id == context.organization_id, func.lower(MarketplaceUser.email) == item.email.lower()))
        if account:
            account.seller_id = existing.id
            account.status = "Active"
    db.commit()
    db.refresh(item)
    return SellerApplicationRead.model_validate(item)


@router.post("/store/checkout", response_model=list[CustomerOrderRead], status_code=status.HTTP_201_CREATED)
def checkout(
    payload: CheckoutCreate,
    db: Session = Depends(get_db),
    context: AuthContext = Depends(require_roles("Customer")),
) -> list[CustomerOrderRead]:
    quantities: dict[uuid.UUID, int] = {}
    for checkout_item in payload.items:
        quantities[checkout_item.product_id] = quantities.get(checkout_item.product_id, 0) + checkout_item.quantity
    products_by_id = {
        product.id: (product, seller, category)
        for product, seller, category in db.execute(
            select(Product, Seller, Category)
            .join(Seller, Product.seller_id == Seller.id)
            .join(Category, Product.category_id == Category.id)
            .where(Product.organization_id == context.organization_id, Product.id.in_(quantities), Product.status == "Active", Seller.status == "Active", Category.status == "Active")
        ).all()
    }
    if len(products_by_id) != len(quantities):
        raise HTTPException(status_code=404, detail="One or more products are unavailable")
    for product_id, quantity in quantities.items():
        product = products_by_id[product_id][0]
        if product.stock < quantity:
            raise HTTPException(status_code=409, detail=f"Only {product.stock} units remain for {product.name}")
    grouped: dict[uuid.UUID, list[tuple[Product, Seller, Category, int]]] = {}
    for product_id, quantity in quantities.items():
        product, seller, category = products_by_id[product_id]
        grouped.setdefault(seller.id, []).append((product, seller, category, quantity))
    created: list[CustomerOrderRead] = []
    for seller_items in grouped.values():
        seller = seller_items[0][1]
        total = sum((product.price * quantity for product, _, _, quantity in seller_items), Decimal("0"))
        order = Order(id=uuid.uuid4(), organization_id=context.organization_id, order_number=f"ORD-{datetime.now(timezone.utc):%y%m%d%H%M%S}-{uuid.uuid4().hex[:4].upper()}", buyer_name=payload.customer_name, item_count=sum(quantity for _, _, _, quantity in seller_items), total=total, status="Confirmed")
        db.add(order)
        db.flush()
        db.add(OrderCustomer(id=uuid.uuid4(), organization_id=context.organization_id, order_id=order.id, subject=context.subject, full_name=payload.customer_name, email=payload.customer_email.lower(), delivery_address=payload.delivery_address))
        for product, _, _, quantity in seller_items:
            line_total = product.price * quantity
            db.add(OrderItem(id=uuid.uuid4(), organization_id=context.organization_id, order_id=order.id, product_id=product.id, seller_id=seller.id, product_name=product.name, quantity=quantity, unit_price=product.price, line_total=line_total))
            product.stock -= quantity
        db.add(Payment(id=uuid.uuid4(), organization_id=context.organization_id, order_id=order.id, method=payload.payment_method, status="Pending"))
        created.append(CustomerOrderRead(order_number=order.order_number, seller_name=seller.business_name, item_count=order.item_count, total=order.total, status=order.status, payment_method=payload.payment_method, payment_status="Pending", placed_at=order.placed_at))
    db.commit()
    return created


@router.get("/store/orders", response_model=ListResponse[CustomerOrderRead])
def list_customer_orders(
    db: Session = Depends(get_db),
    context: AuthContext = Depends(require_roles("Customer")),
) -> ListResponse[CustomerOrderRead]:
    customer_orders = db.scalars(select(Order).join(OrderCustomer, OrderCustomer.order_id == Order.id).where(Order.organization_id == context.organization_id, OrderCustomer.subject == context.subject).order_by(Order.placed_at.desc())).all()
    result: list[CustomerOrderRead] = []
    for order in customer_orders:
        item = db.scalar(select(OrderItem).where(OrderItem.order_id == order.id))
        seller = db.scalar(select(Seller.business_name).where(Seller.id == item.seller_id)) if item else "Marketplace seller"
        payment = db.scalar(select(Payment).where(Payment.order_id == order.id))
        result.append(CustomerOrderRead(order_number=order.order_number, seller_name=seller or "Marketplace seller", item_count=order.item_count, total=order.total, status=order.status, payment_method=payment.method if payment else "Unknown", payment_status=payment.status if payment else "Unknown", placed_at=order.placed_at))
    return ListResponse(items=result, page=1, page_size=len(result) or 25, total=len(result))


@router.post("/admin/payments/{order_id}/verify")
def verify_payment(
    order_id: uuid.UUID,
    db: Session = Depends(get_db),
    context: AuthContext = Depends(require_roles("Marketplace Admin", "Finance/Payouts")),
) -> dict[str, str]:
    order = db.scalar(select(Order).where(Order.id == order_id, Order.organization_id == context.organization_id))
    payment = db.scalar(select(Payment).where(Payment.order_id == order_id, Payment.organization_id == context.organization_id))
    if not order or not payment:
        raise HTTPException(status_code=404, detail="Order payment not found")
    if payment.status == "Paid":
        raise HTTPException(status_code=409, detail="Payment is already verified")
    now = datetime.now(timezone.utc)
    payment.status = "Paid"
    payment.paid_at = now
    order_items = db.scalars(select(OrderItem).where(OrderItem.order_id == order.id, OrderItem.organization_id == context.organization_id)).all()
    config = _commission_configuration(db, context.organization_id)
    grace_days = int(config.get("grace_period_days", 7))
    for order_item in order_items:
        seller = db.get(Seller, order_item.seller_id)
        if not seller or db.scalar(select(CommissionLedger.id).where(CommissionLedger.order_id == order.id, CommissionLedger.seller_id == seller.id)):
            continue
        category = db.scalar(select(Category.slug).join(Product, Product.category_id == Category.id).where(Product.id == order_item.product_id)) if order_item.product_id else None
        rate = Decimal(str(config.get("overrides", {}).get(category, seller.commission_rate)))
        db.add(CommissionLedger(id=uuid.uuid4(), organization_id=context.organization_id, seller_id=seller.id, order_id=order.id, gross_amount=order_item.line_total, commission_rate=rate, commission_amount=(order_item.line_total * rate / Decimal("100")).quantize(Decimal("0.01")), status="Due", due_on=date.today() + timedelta(days=grace_days)))
    db.commit()
    return {"order_number": order.order_number, "payment_status": payment.status}


@router.get("/admin/commission", response_model=list[CommissionBalanceRead])
def list_commission_balances(
    db: Session = Depends(get_db),
    context: AuthContext = Depends(require_roles("Marketplace Admin", "Finance/Payouts")),
) -> list[CommissionBalanceRead]:
    sellers = db.scalars(select(Seller).where(Seller.organization_id == context.organization_id).order_by(Seller.business_name)).all()
    return [_commission_balance(db, seller, context) for seller in sellers]


@router.post("/admin/commission/{seller_id}/remind")
def remind_seller_commission(
    seller_id: uuid.UUID,
    db: Session = Depends(get_db),
    context: AuthContext = Depends(require_roles("Marketplace Admin")),
) -> dict[str, str]:
    seller = db.scalar(select(Seller).where(Seller.id == seller_id, Seller.organization_id == context.organization_id))
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")
    balance = _commission_balance(db, seller, context)
    if balance.due_amount <= 0:
        raise HTTPException(status_code=409, detail="Seller has no outstanding commission")
    return {"seller": seller.business_name, "message": "Commission reminder queued", "status": balance.status}


@router.post("/admin/commission/{seller_id}/suspend")
def suspend_seller_for_commission(
    seller_id: uuid.UUID,
    db: Session = Depends(get_db),
    context: AuthContext = Depends(require_roles("Marketplace Admin")),
) -> dict[str, str]:
    seller = db.scalar(select(Seller).where(Seller.id == seller_id, Seller.organization_id == context.organization_id))
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")
    balance = _commission_balance(db, seller, context)
    if balance.overdue_amount <= 0:
        raise HTTPException(status_code=409, detail="Seller is not overdue")
    seller.status = "Suspended"
    db.commit()
    return {"seller": seller.business_name, "status": seller.status}


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
        attributes={"description": payload.description, "image_url": payload.image_url} if payload.image_url else {"description": payload.description},
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _product_read(item, seller.business_name, category.name)


@router.post("/products/quick", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
def quick_create_product(
    context: AuthContext = Depends(require_roles("Catalog Moderator")),
) -> ProductRead:
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Use the complete product form to choose the seller, category, price, and stock.",
    )


@router.post("/products/bulk-delete")
def bulk_delete_products(
    payload: ProductBulkDelete,
    db: Session = Depends(get_db),
    context: AuthContext = Depends(require_roles("Catalog Moderator")),
) -> dict[str, int]:
    items = db.scalars(
        select(Product).where(
            Product.id.in_(payload.product_ids),
            Product.organization_id == context.organization_id,
        )
    ).all()
    if len(items) != len(payload.product_ids):
        raise HTTPException(status_code=404, detail="One or more products were not found in this marketplace")
    for item in items:
        db.delete(item)
    db.commit()
    return {"deleted": len(items)}


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


@router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(
    product_id: uuid.UUID,
    db: Session = Depends(get_db),
    context: AuthContext = Depends(require_roles("Catalog Moderator")),
) -> None:
    item = db.scalar(
        select(Product).where(Product.id == product_id, Product.organization_id == context.organization_id)
    )
    if not item:
        raise HTTPException(status_code=404, detail="Product not found")
    db.delete(item)
    db.commit()


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
    updates = payload.model_dump(exclude_unset=True)
    if "seller_id" in updates:
        target_seller = db.scalar(
            select(Seller).where(
                Seller.id == updates["seller_id"],
                Seller.organization_id == context.organization_id,
            )
        )
        if not target_seller:
            raise HTTPException(status_code=404, detail="Seller not found in organization")
        if target_seller.status != "Active":
            raise HTTPException(status_code=409, detail="Products can only be assigned to active sellers")
    if "category_id" in updates:
        target_category = db.scalar(
            select(Category).where(
                Category.id == updates["category_id"],
                Category.organization_id == context.organization_id,
            )
        )
        if not target_category:
            raise HTTPException(status_code=404, detail="Category not found in organization")
        if target_category.status != "Active":
            raise HTTPException(status_code=409, detail="Products can only be assigned to active categories")
    if "sku" in updates:
        updates["sku"] = updates["sku"].upper()
        duplicate_sku = db.scalar(
            select(Product.id).where(
                Product.organization_id == context.organization_id,
                Product.id != item.id,
                func.lower(Product.sku) == updates["sku"].lower(),
            )
        )
        if duplicate_sku:
            raise HTTPException(status_code=409, detail="SKU already exists in this marketplace")
    metadata_updates = {key: updates.pop(key) for key in ("description", "image_url") if key in updates}
    if metadata_updates:
        attributes = dict(item.attributes or {})
        attributes.update(metadata_updates)
        item.attributes = attributes
    for field, value in updates.items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    seller = db.scalar(select(Seller.business_name).where(Seller.id == item.seller_id)) or "Unknown seller"
    category = db.scalar(select(Category.name).where(Category.id == item.category_id)) or "Uncategorized"
    return _product_read(item, seller, category)


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
