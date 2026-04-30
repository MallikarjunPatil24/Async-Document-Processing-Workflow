from pydantic import BaseModel, UUID4
from typing import Optional, Dict, Any
from datetime import datetime

class DocumentBase(BaseModel):
    filename: str

class DocumentCreate(DocumentBase):
    pass

class DocumentUpdate(BaseModel):
    result_json: Optional[Dict[str, Any]] = None
    title: Optional[str] = None
    category: Optional[str] = None
    summary: Optional[str] = None
    keywords: Optional[list[str]] = None

class DocumentResponse(DocumentBase):
    id: UUID4
    status: str
    result_json: Optional[Dict[str, Any]] = None
    is_finalized: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class DocumentExportBase(BaseModel):
    id: UUID4
    filename: str
    status: str
    result_json: Optional[Dict[str, Any]] = None
    is_finalized: bool
