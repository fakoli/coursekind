from pydantic import BaseModel, EmailStr


class ShareRequest(BaseModel):
    email: EmailStr


class SharingRecipient(BaseModel):
    id: str
    name: str
    email: str


class SharingResponse(BaseModel):
    recipients: list[SharingRecipient]
