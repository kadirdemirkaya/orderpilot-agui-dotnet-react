# OrderPilot Frontend

React + Vite + TypeScript. Talks to the backend over two channels:

| Channel | Transport | Used for |
|---|---|---|
| AG-UI (`@ag-ui/client`) | HTTP `POST /agent` + SSE response | Chat, tool calls, approval |
| SignalR (`@microsoft/signalr`) | WebSocket `/hub/notifications` | Delay notification, auto-run |

## AG-UI data flow

The frontend starts every run. The backend streams events back as the response to that same request.
Tools are defined on the backend. The frontend only looks at the **tool name** to decide which card to render.

```
FE ── POST /agent { messages } ───────────────▶ BE ──▶ Gemini (picks a tool)
FE ◀─ RUN_STARTED                               BE runs the tool
FE ◀─ TOOL_CALL_START  { toolCallName }         → "running" card
FE ◀─ TOOL_CALL_ARGS   { delta }  (chunked)     → arguments accumulate
FE ◀─ TOOL_CALL_END
FE ◀─ TOOL_CALL_RESULT { content }              → result card (by tool name)
FE ◀─ TEXT_MESSAGE_START / CONTENT / END        → assistant message streams in
FE ◀─ RUN_FINISHED { outcome: "success" }
```

## Approval flow (StartRefund)

`StartRefund` is marked on the backend as a tool that requires approval. When Gemini picks it, the backend
**does not run it**:

```
Request 1
FE ◀─ TOOL_CALL_START/ARGS/END  StartRefund {orderId, reason}   (no RESULT: the tool did not run)
FE ◀─ RUN_FINISHED { outcome: { type: "interrupt",
                                interrupts: [{ id, toolCallId }] } }
      → approval card is shown

Request 2 (Approve / Reject)
FE ── POST /agent { messages, resume: [{
        interruptId, status: "resolved",
        payload: { approved: true|false,
                   toolCall: { callId, name, arguments } } }] }
FE ◀─ TOOL_CALL_RESULT          (only if approved: the backend runs the tool now)
FE ◀─ TEXT_MESSAGE_*            (Gemini summarizes the result)
FE ◀─ RUN_FINISHED
```

Gemini is not asked "which tool?" again after approval. The call chosen in the first request comes back unchanged
in `resume.payload.toolCall` and the backend runs it.

> Note: in this demo the backend does not store the conversation; the frontend sends the history on every request.
> In a real app the pending call is kept on the backend and the frontend only sends `approved`.

## Contract

Tool argument and result field names are a hand-written contract. `Models/Order.cs` on the backend and
`src/types.ts` must match exactly.

## Running

```bash
npm install
npm run dev   # http://localhost:5173, backend at http://localhost:5000
```
