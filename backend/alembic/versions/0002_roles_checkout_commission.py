"""Add role workflows, checkout payments, and commission ledger."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID


revision = "0002_roles_checkout_commission"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def _create_table_if_missing(table_name: str, *columns, **kwargs) -> None:
    # Migration 0001 runs Base.metadata.create_all(), which already creates the
    # full current schema (including these tables). Guard against double-creation
    # so `alembic upgrade head` is idempotent on both fresh and pre-created databases.
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if table_name in inspector.get_table_names():
        return
    op.create_table(table_name, *columns, **kwargs)


def _create_index_if_missing(index_name: str, table_name: str, *columns, **kwargs) -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = {idx["name"] for idx in inspector.get_indexes(table_name)}
    if index_name in existing:
        return
    op.create_index(index_name, table_name, *columns, **kwargs)


def upgrade() -> None:
    _create_table_if_missing(
        "marketplace_users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("subject", sa.String(length=160), nullable=False),
        sa.Column("email", sa.String(length=200), nullable=False),
        sa.Column("full_name", sa.String(length=160), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("seller_id", UUID(as_uuid=True), sa.ForeignKey("sellers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("role", sa.String(length=32), server_default="Customer", nullable=False),
        sa.Column("status", sa.String(length=24), server_default="Active", nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("organization_id", "subject", name="uq_marketplace_user_subject"),
    )
    _create_index_if_missing("ix_marketplace_users_organization_id", "marketplace_users", ["organization_id"])
    _create_index_if_missing("ix_marketplace_users_seller_id", "marketplace_users", ["seller_id"])

    _create_table_if_missing(
        "seller_applications",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("business_name", sa.String(length=160), nullable=False),
        sa.Column("owner_name", sa.String(length=160), nullable=False),
        sa.Column("email", sa.String(length=200), nullable=False),
        sa.Column("phone", sa.String(length=40), nullable=True),
        sa.Column("status", sa.String(length=32), server_default="Pending Approval", nullable=False),
        sa.Column("decision_note", sa.Text(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
    )
    _create_index_if_missing("ix_seller_applications_organization_id", "seller_applications", ["organization_id"])

    _create_table_if_missing(
        "order_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("order_id", UUID(as_uuid=True), sa.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", UUID(as_uuid=True), sa.ForeignKey("products.id", ondelete="SET NULL"), nullable=True),
        sa.Column("seller_id", UUID(as_uuid=True), sa.ForeignKey("sellers.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("product_name", sa.String(length=200), nullable=False),
        sa.Column("quantity", sa.Integer(), server_default="1", nullable=False),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("line_total", sa.Numeric(12, 2), nullable=False),
        *_timestamps(),
    )
    _create_index_if_missing("ix_order_items_organization_id", "order_items", ["organization_id"])
    _create_index_if_missing("ix_order_items_order_id", "order_items", ["order_id"])
    _create_index_if_missing("ix_order_items_seller_id", "order_items", ["seller_id"])

    _create_table_if_missing(
        "order_customers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("order_id", UUID(as_uuid=True), sa.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("subject", sa.String(length=160), nullable=False),
        sa.Column("full_name", sa.String(length=160), nullable=False),
        sa.Column("email", sa.String(length=200), nullable=False),
        sa.Column("delivery_address", sa.String(length=300), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("order_id", name="uq_order_customer_order"),
    )
    _create_index_if_missing("ix_order_customers_organization_id", "order_customers", ["organization_id"])
    _create_index_if_missing("ix_order_customers_order_id", "order_customers", ["order_id"])
    _create_index_if_missing("ix_order_customers_subject", "order_customers", ["subject"])

    _create_table_if_missing(
        "payments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("order_id", UUID(as_uuid=True), sa.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("method", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), server_default="Pending", nullable=False),
        sa.Column("reference", sa.String(length=120), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("order_id", name="uq_payment_order"),
    )
    _create_index_if_missing("ix_payments_organization_id", "payments", ["organization_id"])
    _create_index_if_missing("ix_payments_order_id", "payments", ["order_id"])

    _create_table_if_missing(
        "commission_ledger",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("seller_id", UUID(as_uuid=True), sa.ForeignKey("sellers.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("order_id", UUID(as_uuid=True), sa.ForeignKey("orders.id", ondelete="SET NULL"), nullable=True),
        sa.Column("gross_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("commission_rate", sa.Numeric(5, 2), nullable=False),
        sa.Column("commission_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("status", sa.String(length=24), server_default="Due", nullable=False),
        sa.Column("due_on", sa.Date(), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
    )
    _create_index_if_missing("ix_commission_ledger_organization_id", "commission_ledger", ["organization_id"])
    _create_index_if_missing("ix_commission_ledger_seller_id", "commission_ledger", ["seller_id"])
    _create_index_if_missing("ix_commission_ledger_order_id", "commission_ledger", ["order_id"])


def downgrade() -> None:
    op.drop_table("commission_ledger")
    op.drop_table("payments")
    op.drop_table("order_items")
    op.drop_table("order_customers")
    op.drop_table("seller_applications")
    op.drop_table("marketplace_users")
