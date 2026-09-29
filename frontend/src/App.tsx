import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAgUiChat } from './hooks/useAgUiChat';
import { useNotificationHub } from './hooks/useNotificationHub';
import { ChatMessages } from './components/ChatMessages';
import { EventLog } from './components/EventLog';
import { NotificationBanner } from './components/NotificationBanner';

const API = 'http://localhost:5000';

export default function App() {
  const chat = useAgUiChat(`${API}/agent`);
  const hub = useNotificationHub(`${API}/hub/notifications`, e => {
    // Backend tetikledi (senaryo B): run'ı yine frontend başlatır, mesaj "Otomatik" olarak işaretlenir.
    chat.sendMessage(
      `[OTOMATİK] Sipariş ${e.orderId}: gecikmiş sipariş tespit edildi, kullanıcı yanıt vermedi. Durumu incele ve çözüm öner.`,
      true,
    );
  });
  const [input, setInput] = useState('');
  const [showLog, setShowLog] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat.messages, chat.interrupt]);

  // Kullanıcı tetikledi (senaryo A)
  const send = (text: string) => {
    if (!text.trim() || chat.isRunning) return;
    hub.reportActivity();
    chat.sendMessage(text.trim());
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(input);
    setInput('');
  };

  const resetScenario = async () => {
    chat.reset();
    hub.dismiss();
    await fetch(`${API}/api/dev/reset`, { method: 'POST' });
  };

  return (
    <div className={`app ${showLog ? 'with-log' : ''}`}>
      <header className="topbar">
        <div className="brand">OrderPilot <span className="muted">AG-UI · .NET · React</span></div>
        <span className={`status ${hub.connected ? 'on' : 'off'}`}>
          SignalR {hub.connected ? 'bağlı' : 'bağlı değil'}
        </span>
        <button className="btn btn-ghost" onClick={() => setShowLog(v => !v)}>
          Olay günlüğü ({chat.log.length})
        </button>
        <button className="btn btn-ghost" onClick={resetScenario}>Senaryoyu sıfırla</button>
      </header>

      <main className="chat">
        {hub.delayed && (
          <NotificationBanner
            notification={hub.delayed}
            autoRunAt={hub.autoRunAt}
            onInspect={() => { send(`${hub.delayed!.orderId} numaralı gecikmiş siparişi incele.`); hub.dismiss(); }}
            onDismiss={hub.dismiss}
          />
        )}

        <div className="messages">
          {chat.messages.length === 0 && (
            <div className="empty">
              <h2>Sipariş asistanı</h2>
              <p className="muted">Gecikmiş siparişleri inceleyin, durum sorgulayın, iade başlatın.</p>
              <div className="actions">
                <button className="btn btn-ghost" onClick={() => send('Gecikmiş siparişleri listele')}>
                  Gecikmiş siparişleri listele
                </button>
                <button className="btn btn-ghost" onClick={() => send('12345 numaralı siparişin durumu nedir?')}>
                  #12345 durumunu sorgula
                </button>
              </div>
            </div>
          )}
          <ChatMessages
            messages={chat.messages}
            autoMessageIds={chat.autoMessageIds}
            interrupt={chat.interrupt}
            isRunning={chat.isRunning}
            onRespond={chat.respondToInterrupt}
          />
          {chat.isRunning && <div className="muted typing">Asistan yazıyor…</div>}
          {chat.error && <div className="card card-error">{chat.error}</div>}
          <div ref={bottomRef} />
        </div>

        <form className="composer" onSubmit={onSubmit}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={chat.interrupt ? 'Önce iade onayını yanıtlayın' : 'Mesaj yazın… (örn. 12345 siparişini iade et)'}
            disabled={chat.isRunning || !!chat.interrupt}
          />
          <button className="btn btn-primary" disabled={!input.trim() || chat.isRunning || !!chat.interrupt}>
            Gönder
          </button>
        </form>
      </main>

      {showLog && <EventLog log={chat.log} onClear={chat.clearLog} onClose={() => setShowLog(false)} />}
    </div>
  );
}
