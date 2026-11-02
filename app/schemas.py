import re
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

_PHONE = re.compile(r"^(?:\+?88)?(01[3-9]\d{8})$")


def normalize_phone(v: str | None) -> str | None:
    if v is None or not v.strip():
        return None
    m = _PHONE.match(re.sub(r"[\s-]", "", v))
    if not m:
        raise ValueError("সঠিক বাংলাদেশি মোবাইল নম্বর দিন (যেমন 01712345678)")
    return m.group(1)


class TicketCreate(BaseModel):
    service_id: int
    customer_name: str = Field(min_length=2, max_length=80)
    phone: str | None = None
    appointment_date: date | None = None   # না দিলে আজ
    preferred_time: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")

    @field_validator("customer_name")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()

    @field_validator("phone")
    @classmethod
    def _phone(cls, v):
        return normalize_phone(v)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class RegisterOrgIn(BaseModel):
    organization_name: str = Field(min_length=2, max_length=120)
    admin_name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)


class ServiceIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    name_bn: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    prefix: str = Field(default="A", pattern=r"^[A-Za-z]{1,3}$")
    avg_minutes: int = Field(default=10, ge=1, le=240)
    daily_limit: int = Field(default=0, ge=0, le=5000)
    is_active: bool = True


class ServiceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    name_bn: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    prefix: str | None = Field(default=None, pattern=r"^[A-Za-z]{1,3}$")
    avg_minutes: int | None = Field(default=None, ge=1, le=240)
    daily_limit: int | None = Field(default=None, ge=0, le=5000)
    is_active: bool | None = None


class StaffIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    role: Literal["staff", "admin"] = "staff"


class StaffUpdate(BaseModel):
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=200)
