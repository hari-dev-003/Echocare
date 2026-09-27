from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, Field
from pymongo.errors import DuplicateKeyError
from datetime import datetime
from database import get_db
from auth_utils import hash_password, verify_password, create_access_token, decode_token, verify_google_token
from limiter import limiter

router = APIRouter(prefix="/api/auth", tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


# ── Schemas ───────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=100)


class GoogleLoginRequest(BaseModel):
    id_token: str


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    active_plan: str


# ── Dependency ────────────────────────────────────────────────────────────────

async def get_current_user(token: str = Depends(oauth2_scheme)):
    db = get_db()
    email = decode_token(token)
    if not email:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/register", response_model=UserResponse)
@limiter.limit("5/minute")
async def register(request: Request, data: RegisterRequest):
    db = get_db()
    email = str(data.email).lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    doc = {
        "email": email,
        "full_name": data.full_name.strip(),
        "hashed_password": hash_password(data.password),
        "active_plan": "Free",
        "created_at": datetime.utcnow().isoformat(),
    }
    try:
        result = await db.users.insert_one(doc)
    except DuplicateKeyError:
        # Closes the find_one/insert_one race: two concurrent registers for
        # the same email can both pass the check above, but only one insert
        # wins against the unique index.
        raise HTTPException(status_code=409, detail="Email already registered")

    return UserResponse(
        id=str(result.inserted_id),
        email=doc["email"],
        full_name=doc["full_name"],
        active_plan="Free",
    )


@router.post("/login")
@limiter.limit("10/minute")
async def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends()):
    db = get_db()
    user = await db.users.find_one({"email": form_data.username.lower().strip()})
    if not user or not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    token = create_access_token({"sub": user["email"]})
    return {"access_token": token, "token_type": "bearer"}


@router.post("/google")
@limiter.limit("10/minute")
async def google_login(request: Request, data: GoogleLoginRequest):
    payload = verify_google_token(data.id_token)
    if not payload:
        raise HTTPException(status_code=400, detail="Invalid Google ID token")

    email = payload.get("email").lower().strip()
    name = payload.get("name", "Google User").strip()

    db = get_db()
    user = await db.users.find_one({"email": email})

    if not user:
        doc = {
            "email": email,
            "full_name": name,
            "hashed_password": "",
            "active_plan": "Free",
            "created_at": datetime.utcnow().isoformat(),
        }
        try:
            result = await db.users.insert_one(doc)
            user = await db.users.find_one({"_id": result.inserted_id})
        except DuplicateKeyError:
            # Same email raced in via another request (e.g. register); the
            # unique index let exactly one insert win.
            user = await db.users.find_one({"email": email})

    token = create_access_token({"sub": user["email"]})
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me", response_model=UserResponse)
async def me(current_user: dict = Depends(get_current_user)):
    return UserResponse(
        id=str(current_user["_id"]),
        email=current_user["email"],
        full_name=current_user["full_name"],
        active_plan=current_user.get("active_plan", "Free"),
    )
