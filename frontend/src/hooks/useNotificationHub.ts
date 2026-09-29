import { useCallback, useEffect, useRef, useState } from 'react';
import * as signalR from '@microsoft/signalr';
import type { AutoRunRequested, OrderDelayed } from '../types';

// SignalR (WebSocket) kanalı: backend'in kendiliğinden gönderdiği bildirimler.
export function useNotificationHub(url: string, onAutoRun: (e: AutoRunRequested) => void) {
  const [connected, setConnected] = useState(false);
  const [delayed, setDelayed] = useState<OrderDelayed | null>(null);
  const [autoRunAt, setAutoRunAt] = useState<number | null>(null);
  const connection = useRef<signalR.HubConnection | null>(null);
  const onAutoRunRef = useRef(onAutoRun);
  useEffect(() => { onAutoRunRef.current = onAutoRun; });

  useEffect(() => {
    const conn = new signalR.HubConnectionBuilder()
      .withUrl(url, { transport: signalR.HttpTransportType.WebSockets, skipNegotiation: true })
      .withAutomaticReconnect()
      .build();

    conn.on('OrderDelayed', (e: OrderDelayed) => {
      setDelayed(e);
      setAutoRunAt(Date.parse(e.autoRunAt));
    });
    conn.on('AutoRunRequested', (e: AutoRunRequested) => {
      setAutoRunAt(null);
      onAutoRunRef.current(e);
    });
    conn.onreconnecting(() => setConnected(false));
    conn.onreconnected(() => setConnected(true));
    conn.onclose(() => setConnected(false));
    conn.start().then(() => setConnected(true), () => setConnected(false));
    connection.current = conn;
    return () => { conn.stop(); };
  }, [url]);

  // Kullanıcı sohbete yazdı ya da "İncele"ye bastı: backend otomatik çalıştırmayı iptal eder.
  const reportActivity = useCallback(() => {
    setAutoRunAt(null);
    if (connection.current?.state === signalR.HubConnectionState.Connected) {
      connection.current.invoke('UserActivity');
    }
  }, []);

  return { connected, delayed, autoRunAt, reportActivity, dismiss: () => setDelayed(null) };
}
