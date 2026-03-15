import { useEffect, useMemo, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/auth.store';

type ImportProgressEvent = {
  job_id: string;
  progress: number;
  status: string;
};

type ImportDoneEvent = {
  job_id: string;
  inserted: number;
  skipped: number;
};

type CalcDoneEvent = {
  type: 'KPI' | 'SNAPSHOT';
  period_id: string;
};

type PeriodClosedEvent = {
  period_id: string;
  org_id: string;
};

type AlertTriggeredEvent = {
  kpi_code: string;
  severity: 'INFO' | 'WARN' | 'CRITICAL';
  message: string;
};

type SocketHandlers = {
  onImportProgress?: (payload: ImportProgressEvent) => void;
  onImportDone?: (payload: ImportDoneEvent) => void;
  onCalcDone?: (payload: CalcDoneEvent) => void;
  onPeriodClosed?: (payload: PeriodClosedEvent) => void;
  onAlertTriggered?: (payload: AlertTriggeredEvent) => void;
};

export function useSocket(handlers: SocketHandlers = {}) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accessToken = useAuthStore((state) => state.accessToken);
  const socketRef = useRef<Socket | null>(null);
  const socketsEnabled = (import.meta.env.VITE_ENABLE_SOCKET as string | undefined) === 'true';

  const wsUrl = useMemo(() => {
    const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
    return apiUrl ? apiUrl.replace('/api/v1', '') : 'http://localhost:3001';
  }, []);

  useEffect(() => {
    if (!socketsEnabled || !isAuthenticated || !accessToken) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    const socket = io(wsUrl, {
      transports: ['websocket', 'polling'],
      auth: {
        Authorization: `Bearer ${accessToken}`,
      },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    socket.on('IMPORT_PROGRESS', (payload: ImportProgressEvent) => {
      handlers.onImportProgress?.(payload);
    });

    socket.on('IMPORT_DONE', (payload: ImportDoneEvent) => {
      handlers.onImportDone?.(payload);
    });

    socket.on('CALC_DONE', (payload: CalcDoneEvent) => {
      handlers.onCalcDone?.(payload);
    });

    socket.on('PERIOD_CLOSED', (payload: PeriodClosedEvent) => {
      handlers.onPeriodClosed?.(payload);
    });

    socket.on('ALERT_TRIGGERED', (payload: AlertTriggeredEvent) => {
      handlers.onAlertTriggered?.(payload);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [
    accessToken,
    handlers.onAlertTriggered,
    handlers.onCalcDone,
    handlers.onImportDone,
    handlers.onImportProgress,
    handlers.onPeriodClosed,
    isAuthenticated,
    socketsEnabled,
    wsUrl,
  ]);

  return { socket: socketRef.current };
}
