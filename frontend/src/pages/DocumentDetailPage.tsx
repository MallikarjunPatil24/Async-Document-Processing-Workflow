import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../services/api';
import { useWebSocket } from '../services/websocket';
import type { Document } from '../types';
import { format } from 'date-fns';
import { CheckCircle, Lock, RefreshCcw, Save, Download, Trash2 } from 'lucide-react';

const workflowSteps = [
  'queued',
  'document_received',
  'parsing_started',
  'parsing_completed',
  'extraction_started',
  'extraction_completed',
  'result_stored',
  'job_completed'
];

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<{message: string, time: string}[]>([]);
  const [editData, setEditData] = useState<any>({});
  const lastMessage = useWebSocket();

  useEffect(() => {
    if (id) fetchDocument();
  }, [id]);

  useEffect(() => {
    if (!id || doc?.status === 'completed' || doc?.status === 'failed') return;
    const interval = setInterval(fetchDocument, 2000);
    return () => clearInterval(interval);
  }, [id, doc?.status]);

  useEffect(() => {
    if (lastMessage && lastMessage.job_id === id) {
      setEvents(prev => [...prev, { message: lastMessage.message, time: lastMessage.timestamp }]);
      
      // Reload document if it reaches terminal state or result is stored
      if (['completed', 'failed', 'result_stored'].some(s => lastMessage.message.includes(s))) {
        fetchDocument();
      } else {
        // Optimistic status update
        setDoc(prev => prev ? { ...prev, status: lastMessage.status as Document['status'] } : prev);
      }
    }
  }, [lastMessage, id]);

  const fetchDocument = async () => {
    try {
      const data = await api.getDocument(id!);
      setDoc(data);
      if (data.result_json) {
        setEditData(data.result_json);
      }
      
      // Fallback: if document completed but websocket missed events
      if (data.status === 'completed' && events.length === 0) {
        setEvents(workflowSteps.map(step => ({ message: step, time: new Date().toISOString() })));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const updated = await api.updateDocument(id!, { result_json: editData });
      setDoc(updated);
      alert('Saved successfully!');
    } catch (e) {
      console.error(e);
      alert('Save failed');
    }
  };

  const handleFinalize = async () => {
    if (!window.confirm('Are you sure you want to finalize this document? It cannot be edited afterwards.')) return;
    try {
      const updated = await api.finalizeDocument(id!);
      setDoc(updated);
    } catch (e) {
      console.error(e);
      alert('Finalize failed');
    }
  };

  const handleRetry = async () => {
    try {
      setEvents([]);
      const updated = await api.retryDocument(id!);
      setDoc(updated);
    } catch (e) {
      console.error(e);
      alert('Retry failed');
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to completely delete this document?")) return;
    try {
      await api.deleteDocument(id!);
      window.location.href = "/";
    } catch (e) {
      console.error(e);
      alert('Delete failed');
    }
  };

  if (loading) return <div>Loading...</div>;
  if (!doc) return <div>Document not found.</div>;

  // Compute progress
  const currentStepMsg = events.length > 0 ? events[events.length - 1].message : (doc.status === 'queued' ? 'queued' : '');
  const stepIndex = workflowSteps.indexOf(currentStepMsg);
  const progressPercent = doc.status === 'completed' ? 100 : doc.status === 'failed' ? 100 : Math.max(5, (stepIndex / (workflowSteps.length - 1)) * 100);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '2rem' }}>
      
      {/* Main Content Area */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>{doc.filename}</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>ID: {doc.id}</p>
          </div>
          <span className={`badge badge-${doc.status}`}>{doc.status}</span>
        </div>

        {/* Progress Bar */}
        <div className="card" style={{ padding: '1rem 1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
            <span style={{ fontWeight: 500 }}>Processing Progress</span>
            <span>{doc.status === 'failed' ? 'Failed' : `${Math.round(progressPercent)}%`}</span>
          </div>
          <div style={{ height: '8px', backgroundColor: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ 
              height: '100%', 
              backgroundColor: doc.status === 'failed' ? 'var(--danger)' : 'var(--primary)', 
              width: `${progressPercent}%`,
              transition: 'width 0.5s ease'
            }} />
          </div>
        </div>

        {/* Extracted Data Editor */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Extracted Data</h2>
            {!doc.is_finalized && doc.status === 'completed' && (
              <button className="btn btn-primary" onClick={handleSave}>
                <Save size={16} /> Save Changes
              </button>
            )}
          </div>
          
          {!doc.result_json && doc.status !== 'completed' && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              Data extraction is in progress...
            </div>
          )}

          {doc.result_json && (
            <div>
              {Object.entries(editData).map(([key, value]) => (
                <div key={key} className="form-group">
                  <label className="form-label" style={{ textTransform: 'capitalize' }}>{key}</label>
                  {typeof value === 'object' ? (
                    <textarea 
                      className="form-control" 
                      rows={3}
                      disabled={doc.is_finalized}
                      value={JSON.stringify(value, null, 2)}
                      onChange={(e) => {
                        try {
                          const parsed = JSON.parse(e.target.value);
                          setEditData({ ...editData, [key]: parsed });
                        } catch {
                          // Invalid JSON typing, let them type
                        }
                      }}
                    />
                  ) : (
                    <input 
                      type="text" 
                      className="form-control" 
                      disabled={doc.is_finalized}
                      value={value as string}
                      onChange={(e) => setEditData({ ...editData, [key]: e.target.value })}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sidebar Area */}
      <div>
        <div className="card">
          <h2 className="card-title" style={{ marginBottom: '1.5rem' }}>Actions</h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <button 
              className="btn btn-outline" 
              style={{ width: '100%' }}
              disabled={doc.is_finalized || !['failed', 'completed'].includes(doc.status)}
              onClick={handleRetry}
            >
              <RefreshCcw size={16} /> Retry Processing
            </button>
            
            <button 
              className="btn btn-primary" 
              style={{ width: '100%', backgroundColor: doc.is_finalized ? 'var(--success)' : '' }}
              disabled={doc.is_finalized || doc.status !== 'completed'}
              onClick={handleFinalize}
            >
              {doc.is_finalized ? <><Lock size={16} /> Finalized</> : <><CheckCircle size={16} /> Mark as Finalized</>}
            </button>
            
            {doc.is_finalized && (
              <>
                <div style={{ height: '1px', backgroundColor: 'var(--border)', margin: '0.5rem 0' }} />
                <button 
                  className="btn btn-outline" 
                  style={{ width: '100%' }}
                  onClick={() => window.open(`http://localhost:8001/api/export/csv/${doc.id}?session_id=${localStorage.getItem('sessionId')}`, '_blank')}
                >
                  <Download size={16} /> Export CSV
                </button>
                <button 
                  className="btn btn-outline" 
                  style={{ width: '100%' }}
                  onClick={() => window.open(`http://localhost:8001/api/export/json/${doc.id}?session_id=${localStorage.getItem('sessionId')}`, '_blank')}
                >
                  <Download size={16} /> Export JSON
                </button>
              </>
            )}
            
            <div style={{ height: '1px', backgroundColor: 'var(--border)', margin: '0.5rem 0' }} />
            <button 
              className="btn btn-outline" 
              style={{ width: '100%', color: 'var(--danger)', borderColor: 'var(--danger-bg)' }}
              onClick={handleDelete}
            >
              <Trash2 size={16} /> Delete Document
            </button>
          </div>
        </div>

        <div className="card">
          <h2 className="card-title" style={{ marginBottom: '1.5rem' }}>Event Timeline</h2>
          <div className="timeline">
            {events.length === 0 && <div className="timeline-item"><div className="timeline-content" style={{ color: 'var(--text-muted)' }}>Waiting for events...</div></div>}
            
            {events.map((ev, i) => (
              <div key={i} className={`timeline-item ${ev.message.includes('completed') ? 'completed' : 'active'}`}>
                <div className="timeline-time">{format(new Date(ev.time), 'HH:mm:ss')}</div>
                <div className="timeline-content">{ev.message.replace(/_/g, ' ')}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
