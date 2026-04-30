import type { Document } from '../types';

const host = import.meta.env.VITE_API_HOST;
const API_BASE = import.meta.env.VITE_API_URL || (host ? `https://${host}/api` : 'http://localhost:8001/api');

const getSessionId = () => {
  let sessionId = localStorage.getItem('sessionId');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem('sessionId', sessionId);
  }
  return sessionId;
};

const getHeaders = (baseHeaders: Record<string, string> = {}) => ({
  ...baseHeaders,
  'X-Session-ID': getSessionId()
});

export const api = {
  async upload(file: File): Promise<Document> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      headers: getHeaders(),
      body: formData,
    });
    if (!res.ok) throw new Error('Upload failed');
    return res.json();
  },

  async getDocuments(): Promise<Document[]> {
    const res = await fetch(`${API_BASE}/documents`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch documents');
    return res.json();
  },

  async getDocument(id: string): Promise<Document> {
    const res = await fetch(`${API_BASE}/documents/${id}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch document');
    return res.json();
  },

  async updateDocument(id: string, data: Partial<Document>): Promise<Document> {
    const res = await fetch(`${API_BASE}/documents/${id}`, {
      method: 'PUT',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Update failed');
    return res.json();
  },

  async retryDocument(id: string): Promise<Document> {
    const res = await fetch(`${API_BASE}/retry/${id}`, { method: 'POST', headers: getHeaders() });
    if (!res.ok) throw new Error('Retry failed');
    return res.json();
  },

  async finalizeDocument(id: string): Promise<Document> {
    const res = await fetch(`${API_BASE}/finalize/${id}`, { method: 'POST', headers: getHeaders() });
    if (!res.ok) throw new Error('Finalize failed');
    return res.json();
  },

  async deleteDocument(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/documents/${id}`, { method: 'DELETE', headers: getHeaders() });
    if (!res.ok) throw new Error('Delete failed');
  }
};
