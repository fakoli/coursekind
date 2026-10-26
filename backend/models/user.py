from datetime import datetime
from enum import Enum

from pydantic import BaseModel, EmailStr, Field


class UserRole(str, Enum):
    USER = "user"
    ADMIN = "admin"


class UserBase(BaseModel):
    email: EmailStr
    name: str


class UserCreate(UserBase):
    password: str = Field(..., min_length=8)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class User(UserBase):
    id: str
    timezone: str = "UTC"
    created_at: datetime
    token_balance: int = 100
    role: UserRole = (
        UserRole.USER
    )  # Defaults to "user" for backward compatibility with existing records


class UserInDB(User):
    hashed_password: str


class UserResponse(User):
    pass


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenBalanceResponse(BaseModel):
    balance: int


class ConsumeTokensRequest(BaseModel):
    amount: int = Field(..., gt=0)
