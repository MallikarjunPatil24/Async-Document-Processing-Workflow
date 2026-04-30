import { useEffect, useState } from 'react';
import type { JobUpdate } from '../types';

export function useWebSocket() {
  const [lastMessage, setLastMessage] = useState<JobUpdate | null>(null);

  useEffect(() => {
    const host = import.meta.env.VITE_API_HOST;
    const WS_URL = import.meta.env.VITE_WS_URL || (host ? `wss://${host}/ws/updates` : 'ws://localhost:8001/ws/updates');
    const ws = new WebSocket(WS_URL);

    ws.onmessage = (event) => {
      try {
        const data: JobUpdate = JSON.parse(event.data);
        setLastMessage(data);
      } catch (e) {
        console.error("Failed to parse websocket message", e);
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  return lastMessage;
}
