import type { Interrupt, Message } from '@ag-ui/client';
import { ToolCard } from './ToolCards';

type Props = {
  messages: Message[];
  autoMessageIds: Set<string>;
  interrupt: Interrupt | null;
  isRunning: boolean;
  onRespond: (approved: boolean) => void;
};

// Geçmiş AG-UI mesaj biçimindedir: user, assistant (metin ve/veya toolCalls) ve tool (sonuç).
// Tool mesajları ayrı çizilmez; sonucu ilgili tool çağrısının kartında gösterilir.
export function ChatMessages({ messages, autoMessageIds, interrupt, isRunning, onRespond }: Props) {
  const results = new Map<string, string>();
  for (const m of messages) {
    if (m.role === 'tool') results.set(m.toolCallId, typeof m.content === 'string' ? m.content : JSON.stringify(m.content));
  }

  return messages.map(m => {
    if (m.role === 'user') {
      return (
        <div key={m.id} className="msg msg-user">
          {autoMessageIds.has(m.id) && <span className="badge badge-auto">Otomatik</span>}
          <div className="bubble">{typeof m.content === 'string' ? m.content : ''}</div>
        </div>
      );
    }
    if (m.role !== 'assistant') return null;
    return (
      <div key={m.id} className="msg msg-assistant">
        {m.toolCalls?.map(call => (
          <ToolCard
            key={call.id}
            call={call}
            result={results.get(call.id)}
            awaitingApproval={interrupt?.toolCallId === call.id}
            onRespond={onRespond}
            disabled={isRunning}
          />
        ))}
        {m.content && <div className="bubble">{m.content}</div>}
      </div>
    );
  });
}
