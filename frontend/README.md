# OrderPilot Frontend

React + Vite + TypeScript. Backend ile iki kanaldan konuşur:

| Kanal | Taşıma | Ne için |
|---|---|---|
| AG-UI (`@ag-ui/client`) | HTTP `POST /agent` + SSE cevap | Sohbet, tool çağrıları, onay |
| SignalR (`@microsoft/signalr`) | WebSocket `/hub/notifications` | Gecikme bildirimi, otomatik çalıştırma |

## AG-UI veri akışı

Her çalıştırmayı frontend başlatır. Backend aynı isteğin cevabı olarak olay akıtır.
Tool'lar backend'de tanımlı. Frontend yalnızca **tool adına** bakıp hangi kartı çizeceğine karar verir.

```
FE ── POST /agent { messages } ───────────────▶ BE ──▶ Gemini (tool seçer)
FE ◀─ RUN_STARTED                               BE tool'u çalıştırır
FE ◀─ TOOL_CALL_START  { toolCallName }         → "çalışıyor" kartı
FE ◀─ TOOL_CALL_ARGS   { delta }  (parça parça) → argümanlar birikir
FE ◀─ TOOL_CALL_END
FE ◀─ TOOL_CALL_RESULT { content }              → sonuç kartı (tool adına göre)
FE ◀─ TEXT_MESSAGE_START / CONTENT / END        → asistan mesajı akarak yazılır
FE ◀─ RUN_FINISHED { outcome: "success" }
```

## Onay akışı (StartRefund)

`StartRefund` backend'de onay gerektiren tool olarak işaretli. Gemini onu seçtiğinde backend **çalıştırmaz**:

```
İstek 1
FE ◀─ TOOL_CALL_START/ARGS/END  StartRefund {orderId, reason}   (RESULT yok: tool çalışmadı)
FE ◀─ RUN_FINISHED { outcome: { type: "interrupt",
                                interrupts: [{ id, toolCallId }] } }
      → onay kartı gösterilir

İstek 2 (Onayla / Reddet)
FE ── POST /agent { messages, resume: [{
        interruptId, status: "resolved",
        payload: { approved: true|false,
                   toolCall: { callId, name, arguments } } }] }
FE ◀─ TOOL_CALL_RESULT          (yalnızca onaylandıysa: backend tool'u şimdi çalıştırır)
FE ◀─ TEXT_MESSAGE_*            (Gemini sonucu özetler)
FE ◀─ RUN_FINISHED
```

Gemini'ye onaydan sonra tekrar "hangi tool?" diye sorulmaz. İlk istekte seçilen çağrı `resume.payload.toolCall`
ile aynen geri gelir ve backend onu çalıştırır.

> Not: Bu demoda backend konuşmayı saklamaz, geçmişi her istekte frontend gönderir.
> Gerçek bir uygulamada bekleyen çağrı backend'de tutulur, frontend yalnızca `approved` gönderir.

## Sözleşme

Tool argüman ve sonuç alan adları elle yazılmış bir sözleşmedir. Backend `Models/Order.cs` ile
`src/types.ts` birebir aynı olmalıdır.

## Çalıştırma

```bash
npm install
npm run dev   # http://localhost:5173, backend http://localhost:5000
```
