import os
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from dotenv import load_dotenv

load_dotenv()


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


SECRET_KEY = require_env("SECRET_KEY")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

import bcrypt

pwd_context = None  # replaced passlib with native bcrypt


def hash_password(password: str) -> str:
    pwd_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(pwd_bytes, salt)
    return hashed.decode('utf-8')


def verify_password(plain: str, hashed: str) -> bool:
    if not hashed or not hashed.startswith(("$2a$", "$2b$", "$2y$")):
        return False
    try:
        pwd_bytes = plain.encode('utf-8')
        hashed_bytes = hashed.encode('utf-8')
        return bcrypt.checkpw(pwd_bytes, hashed_bytes)
    except Exception:
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None


import urllib.request
import json
import re
import time

GOOGLE_CLIENT_ID = require_env("GOOGLE_CLIENT_ID")
GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"

_certs_cache: dict = {"certs": None, "expires_at": 0.0}


def _fetch_google_certs() -> dict:
    """Fetch Google's JWK cert set, cached for Cache-Control: max-age."""
    if _certs_cache["certs"] is not None and time.time() < _certs_cache["expires_at"]:
        return _certs_cache["certs"]

    req = urllib.request.Request(
        GOOGLE_CERTS_URL,
        headers={'User-Agent': 'Mozilla/5.0'}
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            certs = json.loads(response.read().decode())
            cache_control = response.headers.get("Cache-Control", "")
            match = re.search(r"max-age=(\d+)", cache_control)
            max_age = int(match.group(1)) if match else 0
    except Exception as e:
        if _certs_cache["certs"] is not None:
            # Transient network error: keep serving the stale-but-still-known
            # cert set rather than rejecting every Google login in the meantime.
            print("Google certs refetch failed, using cached certs:", type(e).__name__)
            return _certs_cache["certs"]
        raise

    _certs_cache["certs"] = certs
    _certs_cache["expires_at"] = time.time() + max_age
    return certs


def verify_google_token(id_token: str) -> Optional[dict]:
    try:
        certs = _fetch_google_certs()

        payload = jwt.decode(
            id_token,
            certs,
            algorithms=["RS256"],
            audience=GOOGLE_CLIENT_ID,
            issuer=["https://accounts.google.com", "accounts.google.com"]
        )
        if payload.get("email_verified") is not True:
            return None
        return payload
    except Exception as e:
        print("Google token verification failed:", type(e).__name__)
        return None
