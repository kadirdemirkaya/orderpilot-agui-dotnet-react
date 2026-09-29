import { useEffect, useState } from 'react';
import type { OrderDelayed } from '../types';

type Props = {
  notification: OrderDelayed;
  autoRunAt: number | null;
  onInspect: () => void;
  onDismiss: () => void;
};

export function NotificationBanner({ notification, autoRunAt, onInspect, onDismiss }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!autoRunAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [autoRunAt]);

  const secondsLeft = autoRunAt ? Math.max(0, Math.ceil((autoRunAt - now) / 1000)) : null;
  const mmss = secondsLeft !== null
    ? `${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}`
    : null;

  return (
    <div className="banner">
      <div>
        <strong>Sipariş {notification.orderId} {notification.delayDays} gündür gecikmiş</strong>
        {mmss && <div className="muted">Yanıt vermezseniz asistan otomatik devreye girecek: <b>{mmss}</b></div>}
      </div>
      <div className="actions">
        <button className="btn btn-primary" onClick={onInspect}>İncele</button>
        <button className="btn btn-ghost" onClick={onDismiss} aria-label="Kapat">✕</button>
      </div>
    </div>
  );
}
