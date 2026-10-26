from datetime import datetime, timedelta, timezone
from uuid import uuid4

import bcrypt
from jose import JWTError, jwt

from config import Settings
from exceptions import ConflictException, InsufficientTokensException, UnauthorizedException
from models.user import User, UserCreate, UserInDB, UserRole
from storage.base import StorageBackend
from utils.datetime_utils import ensure_datetime


class AuthService:
    def __init__(self, storage: StorageBackend, settings: Settings):
        self.storage = storage
        self.settings = settings

    def _hash_password(self, password: str) -> str:
        password_bytes = password.encode("utf-8")
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(password_bytes, salt)
        return hashed.decode("utf-8")

    def _verify_password(self, plain_password: str, hashed_password: str) -> bool:
        password_bytes = plain_password.encode("utf-8")
        hashed_bytes = hashed_password.encode("utf-8")
        return bcrypt.checkpw(password_bytes, hashed_bytes)

    def _create_access_token(self, user_id: str) -> str:
        expire = datetime.now(timezone.utc) + timedelta(hours=self.settings.jwt_expiration_hours)
        to_encode = {"sub": user_id, "exp": expire}
        return jwt.encode(
            to_encode, self.settings.jwt_secret, algorithm=self.settings.jwt_algorithm
        )

    async def register(self, user_data: UserCreate) -> User:
        existing = await self.storage.list("users", {"email": user_data.email})
        if existing:
            raise ConflictException("Email already registered")

        user_id = str(uuid4())
        now = datetime.now(timezone.utc)

        user_in_db = UserInDB(
            id=user_id,
            email=user_data.email,
            name=user_data.name,
            created_at=now,
            token_balance=100,
            hashed_password=self._hash_password(user_data.password),
        )

        await self.storage.create("users", user_in_db.model_dump())

        return User(
            id=user_in_db.id,
            email=user_in_db.email,
            name=user_in_db.name,
            created_at=user_in_db.created_at,
            token_balance=user_in_db.token_balance,
            role=user_in_db.role,
        )

    async def login(self, email: str, password: str) -> str:
        users = await self.storage.list("users", {"email": email})
        if not users:
            raise UnauthorizedException("Invalid credentials")

        user_data = users[0]
        if not self._verify_password(password, user_data["hashed_password"]):
            raise UnauthorizedException("Invalid credentials")

        return self._create_access_token(user_data["id"])

    async def get_user_from_token(self, token: str) -> User:
        try:
            payload = jwt.decode(
                token,
                self.settings.jwt_secret,
                algorithms=[self.settings.jwt_algorithm],
            )
            user_id = payload.get("sub")
            if user_id is None:
                raise UnauthorizedException("Invalid token")
        except JWTError:
            raise UnauthorizedException("Invalid token")

        user_data = await self.storage.get("users", user_id)
        if not user_data:
            raise UnauthorizedException("User not found")

        return User(
            id=user_data["id"],
            email=user_data["email"],
            name=user_data["name"],
            timezone=user_data.get("timezone", "UTC"),
            created_at=ensure_datetime(user_data["created_at"]),
            token_balance=user_data.get("token_balance", 100),
            role=UserRole(user_data.get("role", "user")),
        )

    async def get_token_balance(self, user_id: str) -> int:
        user_data = await self.storage.get("users", user_id)
        if not user_data:
            raise UnauthorizedException("User not found")
        return user_data.get("token_balance", 100)

    async def consume_tokens(self, user_id: str, amount: int) -> int:
        user_data = await self.storage.get("users", user_id)
        if not user_data:
            raise UnauthorizedException("User not found")

        current_balance = user_data.get("token_balance", 100)
        if current_balance < amount:
            raise InsufficientTokensException(
                f"Insufficient tokens. Required: {amount}, Available: {current_balance}"
            )

        new_balance = current_balance - amount
        await self.storage.update("users", user_id, {"token_balance": new_balance})
        return new_balance
