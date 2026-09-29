# OrderPilot

AG-UI protokolünü .NET backend ve React frontend ile uçtan uca gösteren küçük, öğretici bir örnek.

## AG-UI nedir?

AG-UI, bir AI ajanı ile kullanıcı arayüzü arasındaki konuşmanın kurallarıdır.
Frontend ajana bir istek gönderir (`RunAgentInput`: mesaj geçmişi). Backend cevabı standart olaylar halinde akıtır:
metin parçaları, tool çağrıları, tool sonuçları, çalıştırmanın başı ve sonu.
Arayüz bu olayları dinleyerek sohbeti, tool kartlarını ve onay ekranlarını çizer.
Hangi LLM veya ajan çerçevesi kullanılırsa kullanılsın, olay sözleşmesi aynıdır.

## Mimari

```
┌──────────── Tarayıcı (React, :5173) ────────────┐
│  useAgUiChat          useNotificationHub        │
│  (sohbet, kartlar,    (bildirim bandı,          │
│   onay, olay günlüğü)  geri sayım, auto-run)    │
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
│   └─ StartRefund (onaylı)                       │
│        │            │                           │
│        │            └──▶ OrderRepository ◀──────┤ POST /api/dev/reset
│        ▼                 (bellek içi)           │
│  IChatClient (OpenAI uyumlu)                    │
└────────┬────────────────────────────────────────┘
         │ HTTPS
         ▼
   Gemini API (tool seçer, cevap yazar)
```

- **AG-UI kanalı (HTTP + SSE):** Her çalıştırmayı frontend başlatır. Backend Gemini'ye sorar, seçilen tool'u çalıştırır ve olayları geri akıtır.
- **SignalR kanalı (WebSocket):** Backend kendiliğinden bildirim gönderir. Arka plan servisi Gemini'yi hiç çağırmaz.

## Çalıştırma

Gereksinimler: .NET 10 SDK, Node 20+, bir Gemini API anahtarı.

```bash
# Backend: http://localhost:5000
dotnet user-secrets set "Gemini:ApiKey" "<anahtar>" --project backend/OrderPilot.Api
dotnet run --project backend/OrderPilot.Api

# Frontend: http://localhost:5173
cd frontend
npm install
npm run dev
```

Model `appsettings.json` içindeki `Gemini:Model` ayarından okunur. Anahtar hiçbir dosyaya yazılmaz.

## AG-UI olayları

| Olay | Anlamı | Arayüzde |
|---|---|---|
| `RUN_STARTED` | Çalıştırma başladı | "Asistan yazıyor…" |
| `TOOL_CALL_START` | Model bir tool seçti (`toolCallName`) | Tool adına göre kart, "çalışıyor" durumu |
| `TOOL_CALL_ARGS` | Tool argümanları, parça parça | Argümanlar birikir |
| `TOOL_CALL_END` | Argümanlar tamamlandı | |
| `TOOL_CALL_RESULT` | Backend tool'u çalıştırdı, sonuç JSON | Sonuç kartı |
| `TEXT_MESSAGE_START` / `CONTENT` / `END` | Modelin metin cevabı, akarak | Sohbet balonu |
| `RUN_FINISHED` | Bitti. `outcome`: `success` veya `interrupt` | `interrupt` ise onay kartı |
| `RUN_ERROR` | Çalıştırma hata ile bitti | Hata mesajı |

Sağdaki **AG-UI Olay Günlüğü**, frontend'in gönderdiği isteği (`→ POST /agent`) ve gelen her olayı (`←`) ham JSON olarak gösterir.

## Örnek akış: bir iade, üç istek

Olay günlüğünden alınmış gerçek bir akış (`→` frontend'in isteği, `←` backend'in olayları):

```
→ POST /agent  1 mesaj                  "12345 siparişini iade etmek istiyorum"
← RUN_STARTED
← TOOL_CALL_START   GetOrderStatus        Model önce siparişi doğrular
← TOOL_CALL_ARGS    {"orderId":"12345"}
← TOOL_CALL_END
← TOOL_CALL_RESULT  {"orderId":"12345","status":"Delayed",...}   → sipariş kartı
← TEXT_MESSAGE_START / END              "4 gün gecikmiş, iade başlatayım mı?"
← RUN_FINISHED      success

→ POST /agent  5 mesaj                  "Evet" (geçmişin tamamı gider)
← RUN_STARTED
← TOOL_CALL_START   StartRefund
← TOOL_CALL_ARGS    {"orderId":"12345","reason":"Gecikmiş sipariş"}
← TOOL_CALL_END                         TOOL_CALL_RESULT yok: tool çalışmadı
← RUN_FINISHED      interrupt           → onay kartı

→ POST /agent  resume: onay             Kullanıcı "Onayla"ya bastı
← RUN_STARTED
← TOOL_CALL_START   StartRefund          Gemini'ye sorulmadan, onaylanan çağrı çalışır
← TOOL_CALL_ARGS    {"orderId":"12345","reason":"Gecikmiş sipariş"}
← TOOL_CALL_END
← TOOL_CALL_RESULT  {"status":"RefundInitiated","refundId":"REF-12345-...",...}   → iade kartı
← TEXT_MESSAGE_START / END              "İade başlatıldı"
← RUN_FINISHED      success
```

Onay mekanizması: `StartRefund` backend'de `ApprovalRequiredAIFunction` ile sarılıdır. Backend onu çalıştırmak yerine
çalıştırmayı `interrupt` ile bitirir. Kullanıcının kararı `resume: [{ interruptId, payload: { approved, toolCall } }]`
ile geri gelir. Reddedilirse tool hiç çalışmaz ve model bunu kullanıcıya açıklar. İstek gövdesinin ayrıntısı için bkz.
[frontend/README.md](frontend/README.md).

> **Güvenlik notu:** Bu demoda backend konuşmayı saklamaz; geçmişi ve onaylanan tool çağrısını frontend geri gönderir.
> Bu yüzden `Program.cs` içinde `DisableApprovalResponseBinding = true` ayarlıdır. Gerçek bir uygulamada oturum
> sunucuda tutulmalı (`AgentSessionStore`) ve bu bağlama açık kalmalıdır; böylece frontend onaylanan argümanları değiştiremez.

## Demo

Uygulama her başlatıldığında veriler sıfırlanır. `12345` numaralı sipariş 4 gün gecikmiştir (249.90 TRY).
Başlangıçtan ~5 sn sonra üstte bildirim bandı çıkar.

**A. Kullanıcı başlatır**
1. Banttaki **İncele**'ye basın ya da "12345 siparişini iade etmek istiyorum" yazın.
2. Olay günlüğünde `GetOrderStatus` çağrısını ve sonuç kartını izleyin.
3. Model iade önerir. Onay kartında **Onayla**'ya basın ve iade numarasını görün.

**B. Backend başlatır**
1. **Senaryoyu sıfırla**'ya basın ve hiçbir şey yapmayın.
2. Banttaki geri sayım (`Demo:AutoRunSeconds`, varsayılan 180 sn) bitince backend SignalR ile `AutoRunRequested` gönderir.
3. Frontend "Otomatik" rozetli bir mesajla AG-UI çalıştırmasını kendisi başlatır.
4. Model iade önerse bile onay yine sizden istenir. Otomatik iade yapılmaz.

Mesaj göndermek veya **İncele**'ye basmak `UserActivity()` ile backend'e bildirilir ve otomatik çalıştırma o senaryo için iptal olur.

## Önce hangi dosyayı okumalı?

1. [backend/OrderPilot.Api/Program.cs](backend/OrderPilot.Api/Program.cs): Gemini istemcisi, ajan, tool'lar, `/agent` uç noktası
2. [backend/OrderPilot.Api/Tools/OrderTools.cs](backend/OrderPilot.Api/Tools/OrderTools.cs): tool olan C# metotları
3. [frontend/src/hooks/useAgUiChat.ts](frontend/src/hooks/useAgUiChat.ts): AG-UI isteği, olaylar, onay/resume
4. [frontend/src/components/ToolCards.tsx](frontend/src/components/ToolCards.tsx): tool adı → React bileşeni
5. [backend/OrderPilot.Api/Services/DemoScenarioService.cs](backend/OrderPilot.Api/Services/DemoScenarioService.cs) ve [frontend/src/hooks/useNotificationHub.ts](frontend/src/hooks/useNotificationHub.ts): SignalR ve otomatik çalıştırma

`Services/GeminiThoughtSignatureHandler.cs` Gemini'ye özgü bir ayrıntıdır: Gemini 3.x'in tool çağrılarına eklediği
`thought_signature` değerini bir sonraki isteğe geri taşır. AG-UI'yi anlamak için okunması gerekmez.
#   o r d e r p i l o t - a g u i - d o t n e t - r e a c t  
 