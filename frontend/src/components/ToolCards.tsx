import type { ToolCall } from '@ag-ui/client';
import type {
  GetOrderStatusResult, ListDelayedOrdersResult, StartRefundArgs, StartRefundResult,
} from '../types';

// Argümanlar ve sonuç JSON string olarak gelir; argümanlar akış sırasında yarımdır.
function parse<T>(json: string | undefined): T | null {
  try { return json ? (JSON.parse(json) as T) : null; } catch { return null; }
}

const money = (amount: number, currency: string) => `${amount.toFixed(2)} ${currency}`;

type Props = {
  call: ToolCall;
  result?: string;
  awaitingApproval: boolean;
  onRespond: (approved: boolean) => void;
  disabled: boolean;
};

// AG-UI "generative UI": tool ADI hangi bileşenin çizileceğini belirler.
export function ToolCard({ call, result, awaitingApproval, onRespond, disabled }: Props) {
  const name = call.function.name;

  if (name === 'StartRefund' && awaitingApproval) {
    const args = parse<StartRefundArgs>(call.function.arguments);
    return (
      <div className="card card-warning">
        <div className="card-title">İadeyi onaylıyor musunuz?</div>
        <dl className="fields">
          <dt>Sipariş</dt><dd>#{args?.orderId}</dd>
          <dt>Gerekçe</dt><dd>{args?.reason}</dd>
        </dl>
        <div className="actions">
          <button className="btn btn-danger" disabled={disabled} onClick={() => onRespond(false)}>Reddet</button>
          <button className="btn btn-success" disabled={disabled} onClick={() => onRespond(true)}>Onayla</button>
        </div>
      </div>
    );
  }

  if (result === undefined) {
    return <div className="card card-running"><span className="spinner" /> {name} çalışıyor…</div>;
  }

  if (name === 'ListDelayedOrders') {
    const orders = parse<ListDelayedOrdersResult>(result) ?? [];
    return (
      <div className="card">
        <div className="card-title">Gecikmiş siparişler <span className="tag">{name}</span></div>
        {orders.length === 0 && <p className="muted">Gecikmiş sipariş yok.</p>}
        {orders.map(o => (
          <div key={o.orderId} className="row">
            <span>#{o.orderId} · {o.customerName}</span>
            <span className="badge badge-warning">{o.delayDays} gün gecikti</span>
          </div>
        ))}
      </div>
    );
  }

  if (name === 'GetOrderStatus') {
    const o = parse<GetOrderStatusResult>(result);
    if (!o || o.status === 'NotFound') return <div className="card muted">Sipariş bulunamadı.</div>;
    return (
      <div className="card">
        <div className="card-title">
          Sipariş #{o.orderId} <StatusBadge status={o.status} delayDays={o.delayDays} />
        </div>
        <dl className="fields">
          <dt>Müşteri</dt><dd>{o.customerName}</dd>
          <dt>Tutar</dt><dd>{money(o.amount, o.currency)}</dd>
          <dt>Beklenen</dt><dd>{o.expectedDate}</dd>
        </dl>
      </div>
    );
  }

  if (name === 'StartRefund') {
    const r = parse<StartRefundResult>(result);
    // Reddedilen çağrıda backend JSON yerine düz metin döner.
    if (!r || r.status !== 'RefundInitiated') return <div className="card muted">İade başlatılmadı.</div>;
    return (
      <div className="card card-success">
        <div className="card-title">İade başlatıldı</div>
        <dl className="fields">
          <dt>İade no</dt><dd className="mono">{r.refundId}</dd>
          <dt>Tutar</dt><dd>{money(r.amount, r.currency)}</dd>
          <dt>Tahmini süre</dt><dd>{r.estimatedDays} iş günü</dd>
        </dl>
      </div>
    );
  }

  return <div className="card"><div className="card-title">{name}</div><pre>{result}</pre></div>;
}

const statusLabels: Record<string, string> = {
  Preparing: 'Hazırlanıyor', Shipped: 'Kargoda', Delivered: 'Teslim edildi', Refunded: 'İade edildi',
};

function StatusBadge({ status, delayDays }: { status: string; delayDays: number }) {
  if (status === 'Delayed') return <span className="badge badge-warning">{delayDays} gün gecikmiş</span>;
  return <span className="badge">{statusLabels[status] ?? status}</span>;
}
