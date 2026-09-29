import { useCallback, useRef, useState } from 'react';
import { HttpAgent, randomUUID, type Interrupt, type Message, type RunAgentInput } from '@ag-ui/client';
import type { LogEntry } from '../types';

type RunParams = Parameters<HttpAgent['runAgent']>[0];

// Tek sohbet kancası. Konuşma geçmişini HttpAgent tutar (agent.messages): olaylar geldikçe
// asistan mesajlarını, tool çağrılarını ve tool sonuçlarını kendisi ekler. Biz sadece React state'e kopyalarız.
export function useAgUiChat(url: string) {
  // Sıfırlamada yeni agent = yeni threadId ve boş geçmiş.
  const [agent, setAgent] = useState(() => new HttpAgent({ url }));
  const [messages, setMessages] = useState<Message[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [interrupt, setInterrupt] = useState<Interrupt | null>(null);
  const [autoMessageIds, setAutoMessageIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const addLog = useCallback((direction: LogEntry['direction'], type: string, payload: unknown) => {
    const time = new Date().toLocaleTimeString('tr-TR');
    setLog(prev => [...prev, { id: ++seq.current, time, direction, type, payload }]);
  }, []);

  const run = useCallback(async (params?: RunParams) => {
    setIsRunning(true);
    setError(null);
    try {
      await agent.runAgent(params, {
        onRunInitialized: ({ input }: { input: RunAgentInput }) => addLog('out', 'POST /agent', input),
        onEvent: ({ event }) => addLog('in', event.type, event),
        onMessagesChanged: ({ messages }) => setMessages([...messages]),
        // Onay gerektiren tool: backend çalıştırmayı "interrupt" ile bitirir, kullanıcı cevabını bekler.
        onRunFinishedEvent: p => setInterrupt(p.outcome === 'interrupt' ? p.interrupts[0] : null),
      });
    } catch (e) {
      setError(`Asistana ulaşılamadı: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsRunning(false);
    }
  }, [agent, addLog]);

  const sendMessage = useCallback((content: string, auto = false) => {
    const id = randomUUID();
    agent.addMessage({ id, role: 'user', content });
    if (auto) setAutoMessageIds(prev => new Set(prev).add(id));
    setMessages([...agent.messages]);
    return run();
  }, [agent, run]);

  // Onay kartındaki karar, aynı tool çağrısını "resume" ile backend'e geri gönderir.
  // Backend onaylanan çağrıyı Gemini'ye tekrar sormadan çalıştırır.
  const respondToInterrupt = useCallback((approved: boolean) => {
    if (!interrupt) return;
    const call = agent.messages.flatMap(m => (m.role === 'assistant' ? m.toolCalls ?? [] : []))
      .find(c => c.id === interrupt.toolCallId);
    if (!call) return;
    setInterrupt(null);

    // Bekleyen çağrıyı geçmişten çıkarıyoruz: backend onu resume'dan yeniden kurar, yoksa modele iki kez gider.
    agent.setMessages(agent.messages.flatMap(m => {
      if (m.role !== 'assistant' || !m.toolCalls?.some(c => c.id === call.id)) return [m];
      const toolCalls = m.toolCalls.filter(c => c.id !== call.id);
      return toolCalls.length || m.content ? [{ ...m, toolCalls }] : [];
    }));

    return run({
      resume: [{
        interruptId: interrupt.id,
        status: 'resolved',
        payload: {
          approved,
          toolCall: { callId: call.id, name: call.function.name, arguments: JSON.parse(call.function.arguments) },
        },
      }],
    });
  }, [agent, interrupt, run]);

  const reset = useCallback(() => {
    setAgent(new HttpAgent({ url }));
    setMessages([]);
    setLog([]);
    setInterrupt(null);
    setAutoMessageIds(new Set());
    setError(null);
  }, [url]);

  return {
    messages, log, isRunning, interrupt, autoMessageIds, error,
    sendMessage, respondToInterrupt, reset, clearLog: () => setLog([]),
  };
}
