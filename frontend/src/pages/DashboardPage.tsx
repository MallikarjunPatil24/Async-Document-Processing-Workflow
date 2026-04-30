import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useWebSocket } from '../services/websocket';
import type { Document } from '../types';
import { format } from 'date-fns';
import { Download, RefreshCw, Eye, Trash2 } from 'lucide-react';

const StatusBadge = ({ status }: { status: string }) => {
  return <span className={`badge badge-${status}`}>{status}</span>;
};

export default function DashboardPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  
  const lastMessage = useWebSocket();

  useEffect(() => {
    fetchDocuments();
  }, []);

  useEffect(() => {
    if (lastMessage) {
      setDocuments(prevDocs => 
        prevDocs.map(doc => {
          if (doc.id === lastMessage.job_id) {
            // Optimistically update status
            const newStatus = lastMessage.status as Document['status'];
            return { ...doc, status: newStatus };
          }
          return doc;
        })
      );
    }
  }, [lastMessage]);

  const fetchDocuments = async () => {
    try {
      const docs = await api.getDocuments();
      setDocuments(docs);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    const sid = localStorage.getItem('sessionId');
    window.open(`http://localhost:8001/api/export/csv?session_id=${sid}`, '_blank');
  };

  const handleExportJSON = () => {
    const sid = localStorage.getItem('sessionId');
    window.open(`http://localhost:8001/api/export/json?session_id=${sid}`, '_blank');
  };

  const filteredDocs = filter === 'all' ? documents : documents.filter(d => d.status === filter);

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this document?")) return;
    try {
      await api.deleteDocument(id);
      setDocuments(prev => prev.filter(doc => doc.id !== id));
    } catch (e) {
      console.error(e);
      alert("Failed to delete document.");
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Document Dashboard</h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <select 
            className="form-control" 
            style={{ width: 'auto' }} 
            value={filter} 
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="queued">Queued</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
          <button className="btn btn-outline" onClick={fetchDocuments}>
            <RefreshCw size={16} /> Refresh
          </button>
          <button className="btn btn-primary" onClick={handleExportCSV}>
            <Download size={16} /> Export CSV
          </button>
          <button className="btn btn-primary" onClick={handleExportJSON} style={{ marginLeft: '0.5rem' }}>
            <Download size={16} /> Export JSON
          </button>
        </div>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Filename</th>
                <th>Status</th>
                <th>Created At</th>
                <th>Finalized</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocs.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    No documents found.
                  </td>
                </tr>
              ) : (
                filteredDocs.map(doc => (
                  <tr key={doc.id}>
                    <td style={{ fontWeight: 500 }}>{doc.filename}</td>
                    <td><StatusBadge status={doc.status} /></td>
                    <td>{format(new Date(doc.created_at), 'MMM dd, yyyy HH:mm')}</td>
                    <td>{doc.is_finalized ? 'Yes' : 'No'}</td>
                    <td style={{ display: 'flex', gap: '0.5rem' }}>
                      <Link to={`/document/${doc.id}`} className="btn btn-outline" style={{ padding: '0.25rem 0.5rem' }}>
                        <Eye size={16} /> View
                      </Link>
                      <button 
                        className="btn btn-outline" 
                        style={{ padding: '0.25rem 0.5rem' }}
                        disabled={!doc.is_finalized}
                        title={doc.is_finalized ? "Export as CSV" : "Finalize to enable export"}
                        onClick={() => window.open(`http://localhost:8001/api/export/csv/${doc.id}?session_id=${localStorage.getItem('sessionId')}`, '_blank')}
                      >
                        <Download size={16} /> CSV
                      </button>
                      <button 
                        className="btn btn-outline" 
                        style={{ padding: '0.25rem 0.5rem', color: 'var(--danger)', borderColor: 'var(--danger-bg)' }}
                        title="Delete Document"
                        onClick={() => handleDelete(doc.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
