from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Header
from sqlalchemy.orm import Session
from typing import List
import uuid
from app.core.database import get_db
from app.models.document import Document
from app.schemas.document import DocumentResponse, DocumentUpdate
from app.core.storage import storage_service
from app.worker.tasks import process_document
import csv
from fastapi.responses import StreamingResponse
import io
import json
from urllib.parse import quote

router = APIRouter()

def get_doc_or_404(db: Session, doc_id: uuid.UUID, session_id: str = None):
    query = db.query(Document).filter(Document.id == doc_id)
    if session_id:
        query = query.filter(Document.session_id == session_id)
    doc = query.first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc

@router.post("/upload", response_model=DocumentResponse)
async def upload_document(file: UploadFile = File(...), db: Session = Depends(get_db), x_session_id: str = Header(None)):
    doc_id = uuid.uuid4()
    ext = file.filename.split('.')[-1] if '.' in file.filename else ''
    new_filename = f"{doc_id}.{ext}" if ext else str(doc_id)
    
    storage_service.save(file, new_filename)
    
    new_doc = Document(id=doc_id, filename=file.filename, status="queued", session_id=x_session_id)
    db.add(new_doc)
    db.commit()
    db.refresh(new_doc)
    
    process_document.delay(str(new_doc.id))
    
    return new_doc

@router.get("/documents", response_model=List[DocumentResponse])
def get_documents(db: Session = Depends(get_db), skip: int = 0, limit: int = 100, x_session_id: str = Header(None)):
    query = db.query(Document)
    if x_session_id:
        query = query.filter(Document.session_id == x_session_id)
    return query.order_by(Document.created_at.desc()).offset(skip).limit(limit).all()

@router.get("/documents/{doc_id}", response_model=DocumentResponse)
def get_document(doc_id: uuid.UUID, db: Session = Depends(get_db), x_session_id: str = Header(None)):
    return get_doc_or_404(db, doc_id, x_session_id)

@router.put("/documents/{doc_id}", response_model=DocumentResponse)
def update_document(doc_id: uuid.UUID, update_data: DocumentUpdate, db: Session = Depends(get_db), x_session_id: str = Header(None)):
    doc = get_doc_or_404(db, doc_id, x_session_id)
    if doc.is_finalized:
        raise HTTPException(status_code=400, detail="Cannot edit a finalized document")
        
    if update_data.result_json is not None:
        doc.result_json = update_data.result_json
    elif doc.result_json:
        current_data = dict(doc.result_json)
        if update_data.title: current_data['title'] = update_data.title
        if update_data.category: current_data['category'] = update_data.category
        if update_data.summary: current_data['summary'] = update_data.summary
        if update_data.keywords is not None: current_data['keywords'] = update_data.keywords
        doc.result_json = current_data
        
    db.commit()
    db.refresh(doc)
    return doc

@router.post("/retry/{doc_id}", response_model=DocumentResponse)
def retry_document(doc_id: uuid.UUID, db: Session = Depends(get_db), x_session_id: str = Header(None)):
    doc = get_doc_or_404(db, doc_id, x_session_id)
    if doc.status not in ["failed", "completed"]:
        raise HTTPException(status_code=400, detail="Can only retry failed or completed jobs")
        
    doc.status = "queued"
    doc.is_finalized = False
    db.commit()
    db.refresh(doc)
    
    process_document.delay(str(doc.id))
    return doc

@router.post("/finalize/{doc_id}", response_model=DocumentResponse)
def finalize_document(doc_id: uuid.UUID, db: Session = Depends(get_db), x_session_id: str = Header(None)):
    doc = get_doc_or_404(db, doc_id, x_session_id)
    if doc.status != "completed":
        raise HTTPException(status_code=400, detail="Only completed documents can be finalized")
        
    doc.is_finalized = True
    db.commit()
    db.refresh(doc)
    return doc

@router.delete("/documents/{doc_id}")
def delete_document(doc_id: uuid.UUID, db: Session = Depends(get_db), x_session_id: str = Header(None)):
    doc = get_doc_or_404(db, doc_id, x_session_id)
        
    ext = doc.filename.split('.')[-1] if '.' in doc.filename else ''
    filename_on_disk = f"{doc.id}.{ext}" if ext else str(doc.id)
    storage_service.delete(filename_on_disk)
    
    db.delete(doc)
    db.commit()
    return {"message": "Document deleted successfully"}

@router.get("/export/csv")
def export_csv(session_id: str = None, db: Session = Depends(get_db), x_session_id: str = Header(None)):
    sid = session_id or x_session_id
    query = db.query(Document).filter(Document.is_finalized == True)
    if sid:
        query = query.filter(Document.session_id == sid)
    docs = query.all()
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "ID", "Filename", "Status", "Created At",
        "Title", "Category", "Summary", "Keywords", "Pages"
    ])
    for doc in docs:
        result = doc.result_json or {}
        writer.writerow([
            doc.id,
            doc.filename,
            doc.status,
            doc.created_at,
            result.get("title", ""),
            result.get("category", ""),
            result.get("summary", ""),
            ", ".join(result.get("keywords", [])) if result.get("keywords") else "",
            result.get("pages_processed", "")
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=export.csv"}
    )

@router.get("/export/json")
def export_json(session_id: str = None, db: Session = Depends(get_db), x_session_id: str = Header(None)):
    sid = session_id or x_session_id
    query = db.query(Document).filter(Document.is_finalized == True)
    if sid:
        query = query.filter(Document.session_id == sid)
    docs = query.all()
    
    result = [
        {
            "id": str(doc.id),
            "filename": doc.filename,
            "status": doc.status,
            "created_at": doc.created_at.isoformat(),
            "result_json": doc.result_json
        }
        for doc in docs
    ]
    return StreamingResponse(
        iter([json.dumps(result, indent=2)]),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=export.json"}
    )

@router.get("/export/csv/{doc_id}")
def export_single_csv(doc_id: uuid.UUID, session_id: str = None, db: Session = Depends(get_db), x_session_id: str = Header(None)):
    sid = session_id or x_session_id
    doc = get_doc_or_404(db, doc_id, sid)
    if not doc.is_finalized:
        raise HTTPException(status_code=400, detail="Document not finalized")
        
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "ID", "Filename", "Status", "Created At",
        "Title", "Category", "Summary", "Keywords", "Pages"
    ])
    result = doc.result_json or {}
    writer.writerow([
        doc.id,
        doc.filename,
        doc.status,
        doc.created_at,
        result.get("title", ""),
        result.get("category", ""),
        result.get("summary", ""),
        ", ".join(result.get("keywords", [])) if result.get("keywords") else "",
        result.get("pages_processed", "")
    ])
    output.seek(0)
    safe_filename = quote(doc.filename)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename*=utf-8''{safe_filename}.csv"}
    )

@router.get("/export/json/{doc_id}")
def export_single_json(doc_id: uuid.UUID, session_id: str = None, db: Session = Depends(get_db), x_session_id: str = Header(None)):
    sid = session_id or x_session_id
    doc = get_doc_or_404(db, doc_id, sid)
    if not doc.is_finalized:
        raise HTTPException(status_code=400, detail="Document not finalized")
        
    result = {
        "id": str(doc.id),
        "filename": doc.filename,
        "status": doc.status,
        "created_at": doc.created_at.isoformat(),
        "result_json": doc.result_json
    }
    safe_filename = quote(doc.filename)
    return StreamingResponse(
        iter([json.dumps(result, indent=2)]),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename*=utf-8''{safe_filename}.json"}
    )
