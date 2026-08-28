from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import delete

from .db import Base, SessionLocal, engine
from .models import (
    Category,
    CommissionLedger,
    Dispute,
    MarketplaceProfile,
    Order,
    OrderCustomer,
    OrderItem,
    Organization,
    Payment,
    Payout,
    Policy,
    Product,
    Review,
    Seller,
    SellerApplication,
)

ORG_ID = uuid.UUID("6c0e9b55-4f6d-4e60-90c5-8cf4c4f3f5a0")
UTC = timezone.utc


def seed() -> None:
    """Replace only the local ARGO demo tenant with a coherent, realistic dataset."""
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        for model in (Review, CommissionLedger, Payment, OrderItem, OrderCustomer, Product, Dispute, Payout, Policy, SellerApplication, Seller, Category):
            db.execute(delete(model).where(model.organization_id == ORG_ID))
        db.execute(delete(Order).where(Order.organization_id == ORG_ID))

        org = db.get(Organization, ORG_ID)
        if org is None:
            org = Organization(id=ORG_ID, name="ArgoPH Marketplace")
            db.add(org)
        else:
            org.name = "ArgoPH Marketplace"
        db.flush()
        profile = db.query(MarketplaceProfile).filter_by(organization_id=ORG_ID).one_or_none()
        if profile is None:
            db.add(
                MarketplaceProfile(
                    organization_id=ORG_ID,
                    display_name="ArgoPH Marketplace",
                    currency="PHP",
                    timezone="Asia/Manila",
                )
            )
        else:
            profile.display_name = "ArgoPH Marketplace"

        category_specs = [
            ("Electronics", "electronics", None),
            ("Home & Living", "home-living", None),
            ("Food & Beverage", "food-beverage", None),
            ("Coffee & Tea", "coffee-tea", "food-beverage"),
            ("Tools", "tools", None),
            ("Fashion", "fashion", None),
            ("Wellness", "wellness", None),
            ("Seasonal 2025", "seasonal-2025", None),
        ]
        categories = {
            slug: Category(
                id=uuid.uuid4(),
                organization_id=ORG_ID,
                name=name,
                slug=slug,
                status="Archived" if slug == "seasonal-2025" else "Active",
            )
            for name, slug, _ in category_specs
        }
        db.add_all(categories.values())
        db.flush()
        categories["coffee-tea"].parent_id = categories["food-beverage"].id

        seller_specs = [
            ("Northstar Gadgets", "Rafael Cruz", "12.00", "4.80", "2024-09-12"),
            ("Luntian Living Co.", "Mara Santos", "10.00", "4.90", "2025-01-20"),
            ("Kape Lokal Collective", "Jules Bautista", "10.00", "4.80", "2025-03-08"),
            ("Dahon Studio", "Inez Ramos", "12.00", "4.70", "2025-04-17"),
            ("Werkhaus Supply", "Leo Navarro", "11.00", "4.60", "2025-06-02"),
            ("Bayan Audio", "Aira Flores", "12.00", "4.70", "2025-07-11"),
            ("Timpla Wellness", "Carlo Lim", "10.00", "4.80", "2025-09-01"),
            ("Habi Activewear", "Bea Mercado", "12.00", "4.60", "2025-10-15"),
            ("Sining Stationery", "Paolo Reyes", "12.00", "4.50", "2026-01-19"),
            ("Ridge & River", "Nina Garcia", "11.00", "4.70", "2026-02-08"),
        ]
        sellers = {
            name: Seller(
                id=uuid.uuid4(),
                organization_id=ORG_ID,
                business_name=name,
                owner_name=owner,
                commission_rate=Decimal(rate),
                rating=Decimal(rating),
                status="Active",
                joined_on=date.fromisoformat(joined),
            )
            for name, owner, rate, rating, joined in seller_specs
        }
        db.add_all(sellers.values())
        db.flush()

        product_specs = [
            (
                "Nimble Air ANC Earbuds",
                "NSG-AUD-210",
                "Northstar Gadgets",
                "electronics",
                "3490.00",
                86,
                "Active",
            ),
            (
                "Pulse Fit Activity Watch",
                "NSG-WEL-031",
                "Northstar Gadgets",
                "wellness",
                "2790.00",
                23,
                "Pending Review",
            ),
            (
                "Gaia Mini Bluetooth Speaker",
                "NSG-AUD-142",
                "Northstar Gadgets",
                "electronics",
                "1990.00",
                49,
                "Active",
            ),
            (
                "Bamboo Modular Storage Set",
                "LLC-HOM-044",
                "Luntian Living Co.",
                "home-living",
                "1280.00",
                41,
                "Active",
            ),
            (
                "Insulated Flask 750ml",
                "LLC-HOM-053",
                "Luntian Living Co.",
                "home-living",
                "890.00",
                74,
                "Active",
            ),
            (
                "Linen Table Runner",
                "LLC-HOM-067",
                "Luntian Living Co.",
                "home-living",
                "640.00",
                31,
                "Active",
            ),
            (
                "Mt. Apo Arabica Coffee Beans 500g",
                "KLC-FNB-118",
                "Kape Lokal Collective",
                "coffee-tea",
                "425.00",
                122,
                "Active",
            ),
            (
                "Benguet Cold Brew Concentrate",
                "KLC-FNB-124",
                "Kape Lokal Collective",
                "coffee-tea",
                "330.00",
                68,
                "Active",
            ),
            ("Everyday Canvas Tote", "DHS-FAS-072", "Dahon Studio", "fashion", "750.00", 58, "Active"),
            ("Habi Weekend Sling", "DHS-FAS-082", "Dahon Studio", "fashion", "1290.00", 16, "Active"),
            (
                "Seasonal Woven Market Basket",
                "DHS-HOM-008",
                "Dahon Studio",
                "seasonal-2025",
                "650.00",
                0,
                "Archived",
            ),
            (
                "18V Compact Drill Driver Kit",
                "WHS-TOL-019",
                "Werkhaus Supply",
                "tools",
                "4950.00",
                17,
                "Pending Review",
            ),
            ("Heavy Duty Tool Tote", "WHS-TOL-031", "Werkhaus Supply", "tools", "1050.00", 42, "Active"),
            ("Stereo Turntable Stand", "BAY-HOM-015", "Bayan Audio", "home-living", "2450.00", 18, "Active"),
            (
                "Studio Monitor Headphones",
                "BAY-AUD-019",
                "Bayan Audio",
                "electronics",
                "4290.00",
                11,
                "Active",
            ),
            ("Calm Night Magnesium", "TMW-WEL-004", "Timpla Wellness", "wellness", "690.00", 95, "Active"),
            (
                "Daily Hydration Electrolytes",
                "TMW-WEL-011",
                "Timpla Wellness",
                "wellness",
                "380.00",
                116,
                "Active",
            ),
            ("Core Motion Training Tee", "HAB-FAS-013", "Habi Activewear", "fashion", "980.00", 65, "Active"),
            ("Flex Trail Running Belt", "HAB-FAS-022", "Habi Activewear", "fashion", "720.00", 38, "Active"),
            (
                "Dot Grid Journal A5",
                "SIN-HOM-009",
                "Sining Stationery",
                "home-living",
                "265.00",
                150,
                "Active",
            ),
            (
                "Archival Gel Pen Set",
                "SIN-HOM-014",
                "Sining Stationery",
                "home-living",
                "320.00",
                72,
                "Active",
            ),
            ("Waterproof Daypack 20L", "RVR-FAS-017", "Ridge & River", "fashion", "1890.00", 27, "Active"),
            ("Travel Utility Pouch", "RVR-FAS-021", "Ridge & River", "fashion", "560.00", 46, "Active"),
        ]
        product_objects = [
            Product(
                id=uuid.uuid4(),
                organization_id=ORG_ID,
                seller_id=sellers[seller].id,
                category_id=categories[category].id,
                name=name,
                sku=sku,
                price=Decimal(price),
                stock=stock,
                status=status,
                attributes={"demo": True},
            )
            for name, sku, seller, category, price, stock, status in product_specs
        ]
        db.add_all(product_objects)
        product_by_sku = {item.sku: item for item in product_objects}

        buyer_names = [
            "Mika Reyes",
            "Jericho Tan",
            "Paula Villanueva",
            "Noel Garcia",
            "Aira Flores",
            "Sam Dela Cruz",
            "Camille Go",
            "Victor Co",
            "Andrea Yu",
            "Loren Chan",
        ]
        order_statuses = ["Completed"] * 29 + ["Confirmed"] * 8 + ["Active"] * 5 + ["Cancelled"] * 3
        base_date = datetime(2026, 8, 4, 14, tzinfo=UTC)
        orders = []
        for index, status in enumerate(order_statuses):
            orders.append(
                Order(
                    id=uuid.uuid4(),
                    organization_id=ORG_ID,
                    order_number=f"ORD-{20842 - index}",
                    buyer_name=buyer_names[index % len(buyer_names)],
                    item_count=(index % 3) + 1,
                    total=Decimal(str(750 + (index * 275) % 6100)),
                    status=status,
                    placed_at=base_date - timedelta(hours=index * 13),
                )
            )
        db.add_all(orders)
        order_by_number = {item.order_number: item for item in orders}
        seeded_order_lines = [
            ("ORD-20842", "NSG-AUD-210", 1, "Mika Reyes", "mika.reyes@example.com", "Makati City, Metro Manila"),
            ("ORD-20841", "LLC-HOM-044", 1, "Jericho Tan", "jericho.tan@example.com", "Quezon City, Metro Manila"),
            ("ORD-20836", "NSG-AUD-142", 1, "Paula Villanueva", "paula.villanueva@example.com", "Cebu City, Cebu"),
            ("ORD-20831", "WHS-TOL-019", 1, "Noel Garcia", "noel.garcia@example.com", "Davao City, Davao del Sur"),
        ]
        for order_number, sku, quantity, buyer, email, address in seeded_order_lines:
            order = order_by_number[order_number]
            product = product_by_sku[sku]
            db.add(OrderItem(id=uuid.uuid4(), organization_id=ORG_ID, order_id=order.id, product_id=product.id, seller_id=product.seller_id, product_name=product.name, quantity=quantity, unit_price=product.price, line_total=product.price * quantity))
            db.add(OrderCustomer(id=uuid.uuid4(), organization_id=ORG_ID, order_id=order.id, subject="local-customer", full_name=buyer, email=email, delivery_address=address))
            db.add(Payment(id=uuid.uuid4(), organization_id=ORG_ID, order_id=order.id, method="GCash" if order.status == "Completed" else "Cash", status="Paid" if order.status == "Completed" else "Pending", paid_at=base_date - timedelta(hours=2) if order.status == "Completed" else None))

        db.add_all(
            [
                Review(
                    id=uuid.uuid4(),
                    organization_id=ORG_ID,
                    product_name="Nimble Air ANC Earbuds",
                    buyer_name="Andrea Yu",
                    rating=5,
                    comment="Clear calls, balanced sound, and delivery arrived a day early.",
                    status="Published",
                ),
                Review(
                    id=uuid.uuid4(),
                    organization_id=ORG_ID,
                    product_name="Mt. Apo Arabica Coffee Beans 500g",
                    buyer_name="Victor Co",
                    rating=5,
                    comment="Fresh roast with a rich chocolate finish. Great value for the size.",
                    status="Published",
                ),
                Review(
                    id=uuid.uuid4(),
                    organization_id=ORG_ID,
                    product_name="Bamboo Modular Storage Set",
                    buyer_name="Camille Go",
                    rating=4,
                    comment="Well made and easy to assemble. One panel had a small scuff.",
                    status="Published",
                ),
                Review(
                    id=uuid.uuid4(),
                    organization_id=ORG_ID,
                    product_name="Core Motion Training Tee",
                    buyer_name="Mika Reyes",
                    rating=5,
                    comment="Breathable fabric and accurate sizing.",
                    status="Published",
                ),
                Review(
                    id=uuid.uuid4(),
                    organization_id=ORG_ID,
                    product_name="Pulse Fit Activity Watch",
                    buyer_name="Jericho Tan",
                    rating=4,
                    comment="Useful insights after a week of use.",
                    status="Published",
                ),
                Review(
                    id=uuid.uuid4(),
                    organization_id=ORG_ID,
                    product_name="18V Compact Drill Driver Kit",
                    buyer_name="Anonymous",
                    rating=1,
                    comment="",
                    status="Flagged",
                    flag_reason="Potential competitor review pattern",
                ),
                Review(
                    id=uuid.uuid4(),
                    organization_id=ORG_ID,
                    product_name="Pulse Fit Activity Watch",
                    buyer_name="Nico Reyes",
                    rating=1,
                    comment="",
                    status="Flagged",
                    flag_reason="Contains offensive language",
                ),
            ]
        )

        open_disputes = [
            (
                "DSP-1048",
                "ORD-20836",
                "Paula Villanueva",
                "Northstar Gadgets",
                "Item not as described",
                "Open",
            ),
            (
                "DSP-1045",
                "ORD-20831",
                "Noel Garcia",
                "Werkhaus Supply",
                "Damaged on arrival",
                "Investigating",
            ),
            ("DSP-1042", "ORD-20827", "Aira Flores", "Luntian Living Co.", "Late delivery", "Open"),
        ]
        db.add_all(
            Dispute(
                id=uuid.uuid4(),
                organization_id=ORG_ID,
                dispute_number=number,
                order_number=order,
                raised_by=buyer,
                seller_name=seller,
                reason=reason,
                status=status,
            )
            for number, order, buyer, seller, reason, status in open_disputes
        )
        db.add_all(
            [
                Dispute(
                    id=uuid.uuid4(),
                    organization_id=ORG_ID,
                    dispute_number="DSP-1039",
                    order_number="ORD-20812",
                    raised_by="Loren Chan",
                    seller_name="Kape Lokal Collective",
                    reason="Damaged on arrival",
                    status="Resolved",
                    outcome="Refunded",
                    resolved_at=base_date - timedelta(days=6),
                ),
                Dispute(
                    id=uuid.uuid4(),
                    organization_id=ORG_ID,
                    dispute_number="DSP-1034",
                    order_number="ORD-20794",
                    raised_by="Mina De Leon",
                    seller_name="Dahon Studio",
                    reason="Item not as described",
                    status="Resolved",
                    outcome="Rejected",
                    resolved_at=base_date - timedelta(days=11),
                ),
            ]
        )

        payout_specs = [
            ("Luntian Living Co.", "Jul 16-31, 2026", "74860.00", "Pending"),
            ("Northstar Gadgets", "Jul 16-31, 2026", "96420.00", "Pending"),
            ("Kape Lokal Collective", "Jul 16-31, 2026", "58740.00", "Processing"),
            ("Dahon Studio", "Jul 1-15, 2026", "46210.00", "Paid"),
            ("Werkhaus Supply", "Jul 1-15, 2026", "52890.00", "Paid"),
            ("Bayan Audio", "Jul 1-15, 2026", "42300.00", "Paid"),
        ]
        db.add_all(
            Payout(
                id=uuid.uuid4(),
                organization_id=ORG_ID,
                seller_name=seller,
                period=period,
                amount=Decimal(amount),
                status=status,
                generated_at=base_date - timedelta(days=index),
            )
            for index, (seller, period, amount, status) in enumerate(payout_specs)
        )
        db.add_all(
            [
                SellerApplication(
                    id=uuid.uuid4(),
                    organization_id=ORG_ID,
                    business_name="Metro Electronics",
                    owner_name="Paolo Reyes",
                    email="paolo.reyes@example.com",
                    phone="0917 555 0182",
                    status="Pending Approval",
                ),
                SellerApplication(
                    id=uuid.uuid4(),
                    organization_id=ORG_ID,
                    business_name="Bella Fashion House",
                    owner_name="Anna Bautista",
                    email="anna.bautista@example.com",
                    phone="0917 555 0146",
                    status="Pending Approval",
                ),
            ]
        )
        db.add_all(
            [
                CommissionLedger(
                    id=uuid.uuid4(),
                    organization_id=ORG_ID,
                    seller_id=sellers["Northstar Gadgets"].id,
                    order_id=order_by_number["ORD-20836"].id,
                    gross_amount=Decimal("18400.00"),
                    commission_rate=Decimal("12.00"),
                    commission_amount=Decimal("2208.00"),
                    status="Overdue",
                    due_on=date(2026, 8, 18),
                ),
                CommissionLedger(
                    id=uuid.uuid4(),
                    organization_id=ORG_ID,
                    seller_id=sellers["Northstar Gadgets"].id,
                    order_id=order_by_number["ORD-20831"].id,
                    gross_amount=Decimal("4950.00"),
                    commission_rate=Decimal("12.00"),
                    commission_amount=Decimal("594.00"),
                    status="Due",
                    due_on=date(2026, 9, 2),
                ),
                CommissionLedger(
                    id=uuid.uuid4(),
                    organization_id=ORG_ID,
                    seller_id=sellers["Luntian Living Co."].id,
                    order_id=order_by_number["ORD-20827"].id,
                    gross_amount=Decimal("1315.00"),
                    commission_rate=Decimal("10.00"),
                    commission_amount=Decimal("131.50"),
                    status="Due",
                    due_on=date(2026, 9, 4),
                ),
            ]
        )
        db.add_all(
            [
                Policy(
                    id=uuid.uuid4(),
                    organization_id=ORG_ID,
                    kind="commission",
                    configuration={
                        "default_rate": 12.0,
                        "overrides": {"electronics": 12.0, "food-beverage": 10.0, "wellness": 10.0},
                        "grace_period_days": 7,
                    },
                ),
                Policy(
                    id=uuid.uuid4(),
                    organization_id=ORG_ID,
                    kind="dispute",
                    configuration={"response_window_days": 3, "auto_escalate_after_days": 7},
                ),
            ]
        )
        db.commit()
        print("Seeded ArgoPH Marketplace demo tenant")


if __name__ == "__main__":
    seed()
