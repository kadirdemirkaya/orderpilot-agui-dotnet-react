# OrderPilot

A small, educational end-to-end sample of the AG-UI protocol with a .NET backend and a React frontend.

> The app UI and the agent's prompts are in Turkish; the code and docs are in English.

## What is AG-UI?

AG-UI is a protocol for the conversation between an AI agent and a user interface.
The frontend sends the agent a request (`RunAgentInput`: the message history). The backend streams the answer
back as standard events: text chunks, tool calls, tool results, and the start and end of the run.
The UI listens to these events to render the chat, tool cards and approval prompts.
The event contract is the same no matter which LLM or agent framework sits behind it.

## Architecture

```
┌──────────── Browser (React, :5173) ─────────────┐
│  useAgUiChat          useNotificationHub        │
│  (chat, tool cards,   (notification banner,     │
│   approval, event log) countdown, auto-run)     │
└──────┬─────────────────────────┬────────────────┘
       │ AG-UI                   │ SignalR
       │ POST /agent + SSE       │ WebSocket /hub/notifications
       ▼                         ▼
┌──────────── ASP.NET Core (:5000) ───────────────┐
│  MapAGUIServer("/agent")    NotificationHub     │
│        │                     ▲    UserActivity()│
│        ▼                     │                  │
│  AIAgent (Agent Framework)  DemoScenarioService │
│   ├─ ListDelayedOrders       OrderDelayed       │
│   ├─ GetOrderStatus          AutoRunRequested   │
│   └─ StartRefund (approval)                     │
│        │            │                           │
│        │            └──▶ OrderRepository ◀──────┤ POST /api/dev/reset
│        ▼                 (in-memory)            │
│  IChatClient (OpenAI-compatible)                │
└────────┬────────────────────────────────────────┘
         │ HTTPS
         ▼
   Gemini API (picks tools, writes answers)
```

- **AG-UI channel (HTTP + SSE):** The frontend starts every run. The backend asks Gemini, runs the chosen tool and streams the events back.
- **SignalR channel (WebSocket):** The backend pushes notifications on its own. The background service never calls Gemini.

## Running

Requirements: .NET 10 SDK, Node 20+, a Gemini API key.

```bash
# Backend: http://localhost:5000
dotnet user-secrets set "Gemini:ApiKey" "<your-key>" --project backend/OrderPilot.Api
dotnet run --project backend/OrderPilot.Api

# Frontend: http://localhost:5173
cd frontend
npm install
npm run dev
```

The model id is read from `Gemini:Model` in `appsettings.json`. The key is never written to any file in the repo.

## AG-UI events

| Event | Meaning | In the UI |
|---|---|---|
| `RUN_STARTED` | A run has started | "Assistant is typing…" |
| `TOOL_CALL_START` | The model picked a tool (`toolCallName`) | Card chosen by tool name, "running" state |
| `TOOL_CALL_ARGS` | Tool arguments, streamed in chunks | Arguments accumulate |
| `TOOL_CALL_END` | Arguments are complete | |
| `TOOL_CALL_RESULT` | The backend ran the tool, result as JSON | Result card |
| `TEXT_MESSAGE_START` / `CONTENT` / `END` | The model's text answer, streamed | Chat bubble |
| `RUN_FINISHED` | Done. `outcome`: `success` or `interrupt` | `interrupt` shows the approval card |
| `RUN_ERROR` | The run ended with an error | Error message |

The **AG-UI event log** on the right shows the request the frontend sent (`→ POST /agent`) and every incoming event (`←`) as raw JSON.

## Example flow: one refund, three requests

A real flow taken from the event log (`→` frontend request, `←` backend events):

```
→ POST /agent  1 message                "12345 siparişini iade etmek istiyorum" (I want a refund for order 12345)
← RUN_STARTED
← TOOL_CALL_START   GetOrderStatus        The model checks the order first
← TOOL_CALL_ARGS    {"orderId":"12345"}
← TOOL_CALL_END
← TOOL_CALL_RESULT  {"orderId":"12345","status":"Delayed",...}   → order card
← TEXT_MESSAGE_START / END              "4 days late, shall I start a refund?"
← RUN_FINISHED      success

→ POST /agent  5 messages               "Evet" (Yes); the whole history is sent
← RUN_STARTED
← TOOL_CALL_START   StartRefund
← TOOL_CALL_ARGS    {"orderId":"12345","reason":"Gecikmiş sipariş"}
← TOOL_CALL_END                         No TOOL_CALL_RESULT: the tool did not run
← RUN_FINISHED      interrupt           → approval card

→ POST /agent  resume: approved         The user clicked "Onayla" (Approve)
← RUN_STARTED
← TOOL_CALL_START   StartRefund          The approved call runs without asking Gemini again
← TOOL_CALL_ARGS    {"orderId":"12345","reason":"Gecikmiş sipariş"}
← TOOL_CALL_END
← TOOL_CALL_RESULT  {"status":"RefundInitiated","refundId":"REF-12345-...",...}   → refund card
← TEXT_MESSAGE_START / END              "Refund started"
← RUN_FINISHED      success
```

How approval works: on the backend, `StartRefund` is wrapped in `ApprovalRequiredAIFunction`. Instead of running it,
the backend ends the run with an `interrupt`. The user's decision comes back as
`resume: [{ interruptId, payload: { approved, toolCall } }]`. If rejected, the tool never runs and the model explains
that to the user. See [frontend/README.md](frontend/README.md) for the request body in detail.

> **Security note:** In this demo the backend does not store the conversation; the frontend sends back the history
> and the approved tool call. That is why `Program.cs` sets `DisableApprovalResponseBinding = true`. A real app should
> keep the session on the server (`AgentSessionStore`) and leave this binding on, so the frontend cannot change the
> approved arguments.

## Demo

Data is reseeded on every start. Order `12345` is 4 days late (249.90 TRY).
About 5 seconds after startup a notification banner appears at the top.

**A. User-triggered**
1. Click **İncele** (Inspect) on the banner, or type "12345 siparişini iade etmek istiyorum".
2. Watch the `GetOrderStatus` call and its result card in the event log.
3. The model suggests a refund. Click **Onayla** (Approve) on the approval card and see the refund id.

**B. Backend-triggered**
1. Click **Senaryoyu sıfırla** (Reset scenario) and do nothing.
2. When the banner countdown ends (`Demo:AutoRunSeconds`, default 180 s), the backend sends `AutoRunRequested` over SignalR.
3. The frontend starts an AG-UI run by itself with a message marked **Otomatik** (Automatic).
4. Even if the model suggests a refund, approval is still required. There is no automatic refund.

Sending a message or clicking **İncele** reports `UserActivity()` to the backend, which cancels the auto-run for that scenario.

## What to read first

1. [backend/OrderPilot.Api/Program.cs](backend/OrderPilot.Api/Program.cs): Gemini client, agent, tools, `/agent` endpoint
2. [backend/OrderPilot.Api/Tools/OrderTools.cs](backend/OrderPilot.Api/Tools/OrderTools.cs): the C# methods exposed as tools
3. [frontend/src/hooks/useAgUiChat.ts](frontend/src/hooks/useAgUiChat.ts): AG-UI request, events, approval/resume
4. [frontend/src/components/ToolCards.tsx](frontend/src/components/ToolCards.tsx): tool name → React component
5. [backend/OrderPilot.Api/Services/DemoScenarioService.cs](backend/OrderPilot.Api/Services/DemoScenarioService.cs) and [frontend/src/hooks/useNotificationHub.ts](frontend/src/hooks/useNotificationHub.ts): SignalR and auto-run

`Services/GeminiThoughtSignatureHandler.cs` is a Gemini-specific detail: it carries the `thought_signature` that
Gemini 3.x attaches to tool calls over to the next request. You don't need it to understand AG-UI.
