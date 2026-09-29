using System.ClientModel;
using System.ClientModel.Primitives;
using System.Text.Json.Serialization;
using Microsoft.Agents.AI;
using Microsoft.Agents.AI.Hosting.AGUI.AspNetCore;
using Microsoft.Extensions.AI;
using OpenAI;
using OrderPilot.Api.Data;
using OrderPilot.Api.Hubs;
using OrderPilot.Api.Services;
using OrderPilot.Api.Tools;

var builder = WebApplication.CreateBuilder(args);

var modelId = builder.Configuration["Gemini:Model"] ?? "gemini-3.1-flash-lite";
// Anahtar user-secrets / Gemini__ApiKey'den gelir. Yoksa Gemini 4xx döner ve sohbette hata mesajı görünür.
var apiKey = builder.Configuration["Gemini:ApiKey"] is { Length: > 0 } key ? key : "missing-key";

builder.Services.AddAGUIServer();
// @ag-ui/client şema doğrulaması null alanları (örn. RUN_STARTED.parentRunId) reddediyor; hiç yazmıyoruz.
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull);
builder.Services.AddSignalR();
builder.Services.AddSingleton<OrderRepository>();
builder.Services.AddSingleton<DemoScenarioService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<DemoScenarioService>());
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins("http://localhost:5173")
    .AllowAnyHeader()
    .AllowAnyMethod()
    .AllowCredentials())); // SignalR için gerekli

var app = builder.Build();

// Gemini, OpenAI uyumlu endpoint üzerinden IChatClient olarak kullanılır.
var openAiClient = new OpenAIClient(new ApiKeyCredential(apiKey), new OpenAIClientOptions
{
    Endpoint = new Uri("https://generativelanguage.googleapis.com/v1beta/openai/"),
    Transport = new HttpClientPipelineTransport(new HttpClient(new GeminiThoughtSignatureHandler()))
});
IChatClient chatClient = new GeminiFriendlyErrorChatClient(
    openAiClient.GetChatClient(modelId).AsIChatClient());

// AIFunctionFactory.Create, metot imzası ve [Description] niteliklerinden modele gidecek JSON şemasını üretir.
// ApprovalRequiredAIFunction: StartRefund çağrısı çalışmadan önce AG-UI interrupt'ı ile kullanıcı onayı bekler.
var tools = new OrderTools(app.Services.GetRequiredService<OrderRepository>());
AIAgent agent = chatClient.AsAIAgent(new ChatClientAgentOptions
{
    Name = "OrderPilot",
    ChatOptions = new ChatOptions
    {
        Instructions = "Sipariş operasyon asistanısın. Kısa ve net yanıt ver. " +
                       "İade başlatmadan önce her zaman GetOrderStatus ile durumu doğrula. " +
                       "İade her zaman kullanıcı onayı gerektirir. Bilmediğin sipariş için tahmin yürütme.",
        Tools =
        [
            AIFunctionFactory.Create(tools.ListDelayedOrders),
            AIFunctionFactory.Create(tools.GetOrderStatus),
            new ApprovalRequiredAIFunction(AIFunctionFactory.Create(tools.StartRefund))
        ]
    },
    // Sunucu oturum saklamıyor: geçmişi ve onaylanan tool call'u (resume.payload.toolCall) istemci geri gönderir.
    // Bu bağlama, onayı sunucuda kayıtlı isteğe eşler; kayıt olmadığı için kapalı (bkz. README güvenlik notu).
    DisableApprovalResponseBinding = true
});

app.UseCors();

app.MapAGUIServer("/agent", agent);
app.MapHub<NotificationHub>("/hub/notifications");
app.MapPost("/api/dev/reset", async (DemoScenarioService scenario) =>
{
    await scenario.ResetAsync();
    return Results.Ok();
});

app.Run();
