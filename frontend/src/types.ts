export interface Document {
  id: string;
  filename: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  result_json: Record<string, any> | null;
  is_finalized: boolean;
  created_at: string;
  updated_at: string;
}

export interface JobUpdate {
  job_id: string;
  status: string;
  message: string;
  timestamp: string;
}
