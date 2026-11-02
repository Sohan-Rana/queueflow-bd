"""পাসওয়ার্ড হ্যাশ (bcrypt), JWT, আর সহজ rate limiter।"""
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .models import User


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode()[:72], bcrypt.gensalt(12)).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode()[:72], hashed.encode())
    except ValueError:
        return False


def create_token(user: User) -> str:
    payload = {
        "sub": str(user.id), "role": user.role, "org": user.organization_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=settings.jwt_hours),
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


_bearer = HTTPBearer(auto_error=False)


def current_user(
    cred: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if not cred:
        raise HTTPException(401, "লগইন করতে হবে")
    try:
        data = jwt.decode(cred.credentials, settings.secret_key, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "টোকেন ভুল বা মেয়াদ শেষ")
    user = db.get(User, int(data["sub"]))
    if not user or not user.is_active:
        raise HTTPException(401, "অ্যাকাউন্ট পাওয়া যায়নি")
    return user


def require_staff(user: User = Depends(current_user)) -> User:
    if user.role not in ("staff", "admin"):
        raise HTTPException(403, "স্টাফ অ্যাক্সেস লাগবে")
    return user


def require_admin(user: User = Depends(current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(403, "অ্যাডমিন অ্যাক্সেস লাগবে")
    return user


class RateLimiter:
    """একই key (যেমন IP) থেকে window সেকেন্ডে সর্বোচ্চ limit বার।
    এটা memory-ভিত্তিক; একাধিক সার্ভার চালালে Redis ব্যবহার করুন।"""

    def __init__(self, limit: int, window: int):
        self.limit, self.window = limit, window
        self.hits: dict[str, deque] = defaultdict(deque)
        self.lock = threading.Lock()

    def check(self, key: str) -> None:
        now = time.monotonic()
        with self.lock:
            q = self.hits[key]
            while q and now - q[0] > self.window:
                q.popleft()
            if len(q) >= self.limit:
                raise HTTPException(429, "অনেক বেশি অনুরোধ, একটু পরে চেষ্টা করুন")
            q.append(now)

    def reset(self) -> None:
        with self.lock:
            self.hits.clear()


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"
