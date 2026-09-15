"""Share permission levels + claim approval workflow

Revision ID: 004
Revises: 003
Create Date: 2026-09-05
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. สร้าง Enum types ใน PostgreSQL ก่อนนำไปใช้
    share_perm_enum = sa.Enum("view_only", "download", name="sharepermission")
    share_perm_enum.create(op.get_bind(), checkfirst=True)

    claim_status_enum = sa.Enum("pending", "approved", "rejected", name="claimstatus")
    claim_status_enum.create(op.get_bind(), checkfirst=True)

    # 2. เพิ่มคอลัมน์ในตาราง department_shares
    op.add_column(
        "department_shares",
        sa.Column(
            "permission",
            share_perm_enum,
            nullable=False,
            server_default="download",
        ),
    )

    # 3. เพิ่มคอลัมน์ในตาราง department_share_claims
    op.add_column(
        "department_share_claims",
        sa.Column(
            "status",
            claim_status_enum,
            nullable=False,
            server_default="approved",
        ),
    )
    op.add_column(
        "department_share_claims", 
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("department_share_claims", "decided_at")
    op.drop_column("department_share_claims", "status")
    op.execute("DROP TYPE IF EXISTS claimstatus")
    op.drop_column("department_shares", "permission")
    op.execute("DROP TYPE IF EXISTS sharepermission")