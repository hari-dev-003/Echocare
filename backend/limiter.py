from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from auth_utils import decode_token


def user_or_ip(request: Request) -> str:
    """Rate-limit key: the JWT subject if a valid bearer token is present,
    otherwise the client IP."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.lower().startswith("bearer "):
        sub = decode_token(auth_header[7:].strip())
        if sub:
            return sub
    return get_remote_address(request)


# ponytail: in-memory storage, single instance only -- switch storage_uri to
# MongoDB/Redis if this ever runs behind more than one process/instance.
limiter = Limiter(key_func=user_or_ip)
