import { useEffect, useState } from 'react';
import type { JobUpdate } from '../types';

export function useWebSocket() {
  const [lastMessage, setLastMessage] = useState<JobUpdate | null>(null);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8001/ws/updates');

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
