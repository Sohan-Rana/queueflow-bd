import secrets
from datetime import date, datetime

from sqlalchemy import (Boolean, Date, DateTime, ForeignKey, Integer, String,
                        Text, UniqueConstraint, Index)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base, utcnow


class Organization(Base):
    __tablename__ = "organizations"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    services: Mapped[list["Service"]] = relationship(back_populates="organization", cascade="all, delete-orphan")


class Service(Base):
    __tablename__ = "services"
    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    name_bn: Mapped[str | None] = mapped_column(String(120), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    prefix: Mapped[str] = mapped_column(String(4), default="A")   # টোকেনের অক্ষর, যেমন A-012
    avg_minutes: Mapped[int] = mapped_column(Integer, default=10)  # শুরুর আনুমানিক সেবা-সময়
    daily_limit: Mapped[int] = mapped_column(Integer, default=0)   # 0 = সীমাহীন
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    organization: Mapped[Organization] = relationship(back_populates="services")


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    email: Mapped[str] = mapped_column(String(160), unique=True)
    password_hash: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(10))  # admin | staff
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    organization: Mapped[Organization] = relationship()


class Ticket(Base):
    __tablename__ = "tickets"
    __table_args__ = (
        UniqueConstraint("service_id", "queue_date", "number", name="uq_ticket_number"),
        Index("ix_ticket_queue", "service_id", "queue_date", "status", "number"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    service_id: Mapped[int] = mapped_column(ForeignKey("services.id", ondelete="CASCADE"))
    number: Mapped[int] = mapped_column(Integer)
    code: Mapped[str] = mapped_column(String(12))
    # গ্রাহককে দেওয়া গোপন লিঙ্কের অংশ — ID অনুমান করে অন্যের তথ্য দেখা যাবে না
    tracking_key: Mapped[str] = mapped_column(String(32), unique=True, default=lambda: secrets.token_urlsafe(12))
    customer_name: Mapped[str] = mapped_column(String(80))
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    status: Mapped[str] = mapped_column(String(12), default="waiting")  # waiting|called|completed|skipped|cancelled
    queue_date: Mapped[date] = mapped_column(Date)
    preferred_time: Mapped[str | None] = mapped_column(String(5), nullable=True)  # "HH:MM" (তথ্য হিসেবে)
    near_notified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    called_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    service: Mapped[Service] = relationship()


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    ticket_id: Mapped[int | None] = mapped_column(ForeignKey("tickets.id", ondelete="SET NULL"), nullable=True)
    phone: Mapped[str] = mapped_column(String(20))
    kind: Mapped[str] = mapped_column(String(12))  # booked | near | called
    message: Mapped[str] = mapped_column(Text)
    provider: Mapped[str] = mapped_column(String(12))
    status: Mapped[str] = mapped_column(String(12), default="pending")  # pending|sent|failed
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
