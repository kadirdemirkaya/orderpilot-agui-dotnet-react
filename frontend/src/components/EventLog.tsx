import { useEffect, useRef, useState } from 'react';
import type { LogEntry } from '../types';

type Props = { log: LogEntry[]; onClear: () => void; onClose: () => void };

// Ham AG-UI trafiği: "→" frontend'in gönderdiği istek, "←" backend'in akıttığı olaylar.
// Listeden bir satır seçilince tam JSON alttaki ayrı panelde görünür.
export function EventLog({ log, onClear, onClose }: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [hideChunks, setHideChunks] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  const visible = hideChunks ? log.filter(e => e.type !== 'TEXT_MESSAGE_CONTENT') : log;
  const selected = log.find(e => e.id === selectedId);

  // Kullanıcı en alttayken yeni olaylar gelirse listeyi aşağıda tut.
  useEffect(() => {
    const el = listRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 80) el.scrollTop = el.scrollHeight;
  }, [visible.length]);

  return (
    <aside className="log">
      <header className="log-header">
        <strong>AG-UI Olay Günlüğü</strong>
        <span className="muted">{log.length}</span>
        <label className="log-toggle">
          <input type="checkbox" checked={hideChunks} onChange={e => setHideChunks(e.target.checked)} />
          metin parçalarını gizle
        </label>
        <button className="btn btn-ghost" onClick={() => { onClear(); setSelectedId(null); }}>Temizle</button>
        <button className="btn btn-ghost" onClick={onClose} aria-label="Kapat">✕</button>
      </header>

      <div className="log-list" ref={listRef}>
        {visible.length === 0 && <p className="muted log-empty">Henüz olay yok. Bir mesaj gönderin.</p>}
        {visible.map(e => (
          <button
            key={e.id}
            className={`log-row ${e.direction} ${e.id === selectedId ? 'selected' : ''}`}
            onClick={() => setSelectedId(e.id === selectedId ? null : e.id)}
          >
            <span className="log-time">{e.time}</span>
            <span className="log-dir">{e.direction === 'out' ? '→' : '←'}</span>
            <span className={`log-type ${typeClass(e.type)}`}>{e.type}</span>
            <span className="log-summary">{summarize(e)}</span>
          </button>
        ))}
      </div>

      <div className="log-detail">
        {selected
          ? <pre>{JSON.stringify(selected.payload, null, 2)}</pre>
          : <p className="muted">JSON'unu görmek için bir olay seçin.</p>}
      </div>
    </aside>
  );
}

function typeClass(type: string) {
  if (type.startsWith('TOOL_CALL')) return 't-tool';
  if (type.startsWith('TEXT_MESSAGE')) return 't-text';
  if (type.startsWith('RUN_ERROR')) return 't-error';
  if (type.startsWith('RUN')) return 't-run';
  return 't-out';
}

// Satırda gösterilecek kısa özet.
function summarize({ payload }: LogEntry): string {
  const p = payload as Record<string, any>;
  if (p.toolCallName) return p.toolCallName;
  if (p.type === 'TOOL_CALL_ARGS' || p.type === 'TEXT_MESSAGE_CONTENT') return p.delta;
  if (p.type === 'TOOL_CALL_RESULT') return p.content;
  if (p.type === 'RUN_FINISHED') return p.outcome?.type ?? '';
  if (p.type === 'RUN_ERROR') return p.message;
  if (p.resume) return `resume: ${p.resume.map((r: any) => r.payload?.approved ? 'onay' : 'ret').join(', ')}`;
  if (Array.isArray(p.messages)) return `${p.messages.length} mesaj`;
  return '';
}
