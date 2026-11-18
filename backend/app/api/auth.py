from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func, select

from app.core.deps import CurrentUser, DbSession
from app.core.security import create_access_token, verify_password
from app.models import User
from app.schemas.auth import LoginRequest, TokenResponse, UserOut

router = APIRouter(tags=["auth"])


def _authenticate(db: DbSession, email: str, password: str) -> TokenResponse:
    user = db.scalar(select(User).where(func.lower(User.email) == email.strip().lower()))
    if user is None or not verify_password(password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password.")
    return TokenResponse(
        access_token=create_access_token(user.id, user.role),
        user=UserOut.model_validate(user),
    )


@router.post("/auth/login", response_model=TokenResponse)
def login(body: LoginRequest, db: DbSession) -> TokenResponse:
    """FR-01. JSON login used by the frontend."""
    return _authenticate(db, body.email, body.password)


@router.post("/auth/token", response_model=TokenResponse, include_in_schema=False)
def token(form: Annotated[OAuth2PasswordRequestForm, Depends()], db: DbSession) -> TokenResponse:
    """Form-based login so the Swagger "Authorize" button works (username = email)."""
    return _authenticate(db, form.username, form.password)


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> User:
    return user
