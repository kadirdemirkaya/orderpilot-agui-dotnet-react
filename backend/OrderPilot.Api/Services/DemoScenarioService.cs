using Microsoft.AspNetCore.SignalR;
using OrderPilot.Api.Data;
using OrderPilot.Api.Hubs;

namespace OrderPilot.Api.Services;

// Başlangıçtan ~5 sn sonra OrderDelayed yayınlar. autoRunAt'e kadar UserActivity gelmezse
// AutoRunRequested gönderir; AG-UI çalıştırmasını frontend başlatır (burada Gemini çağrılmaz).
public class DemoScenarioService(
    IHubContext<NotificationHub> hub,
    OrderRepository repository,
    IConfiguration configuration,
    ILogger<DemoScenarioService> logger) : BackgroundService
{
    private const string OrderId = "12345";
    private readonly Lock _lock = new();
    private CancellationTokenSource? _countdown;
    private CancellationToken _stopping;

    public void RecordUserActivity()
    {
        lock (_lock) _countdown?.Cancel();
    }

    public async Task ResetAsync()
    {
        repository.Reset();
        await StartScenarioAsync();
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _stopping = stoppingToken;
        await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
        await StartScenarioAsync();
    }

    private async Task StartScenarioAsync()
    {
        CancellationTokenSource countdown;
        lock (_lock)
        {
            _countdown?.Cancel();
            _countdown = countdown = CancellationTokenSource.CreateLinkedTokenSource(_stopping);
        }

        var delay = TimeSpan.FromSeconds(configuration.GetValue("Demo:AutoRunSeconds", 180));
        var order = repository.GetById(OrderId)!;
        await hub.Clients.All.SendAsync("OrderDelayed", new
        {
            orderId = OrderId,
            delayDays = order.DelayDays,
            autoRunAt = DateTimeOffset.UtcNow.Add(delay)
        }, _stopping);

        _ = Task.Run(async () =>
        {
            try
            {
                await Task.Delay(delay, countdown.Token);
                logger.LogInformation("Kullanıcı yanıt vermedi, AutoRunRequested gönderiliyor.");
                await hub.Clients.All.SendAsync("AutoRunRequested",
                    new { orderId = OrderId, reason = "Kullanıcı yanıt vermedi" }, _stopping);
            }
            catch (OperationCanceledException)
            {
                // Kullanıcı aktivitesi veya sıfırlama: bu senaryoda otomatik çalışma yok.
            }
        });
    }
}
