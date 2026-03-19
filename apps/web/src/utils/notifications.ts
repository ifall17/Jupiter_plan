export type AppNotificationSeverity = 'INFO' | 'WARN' | 'CRITICAL';

export type AppNotificationPayload = {
  message: string;
  severity?: AppNotificationSeverity;
};

export function emitAppNotification(payload: AppNotificationPayload): void {
  if (!payload.message.trim()) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent('app:notify', {
      detail: {
        message: payload.message,
        severity: payload.severity ?? 'INFO',
      },
    }),
  );
}

export function emitAppError(message: string): void {
  const normalized = message.trim();
  if (!normalized) {
    return;
  }

  // Backward-compatible channel used by existing consumers (e.g. LoginPage).
  window.dispatchEvent(new CustomEvent('app:error', { detail: normalized }));
  emitAppNotification({ message: normalized, severity: 'CRITICAL' });
}
