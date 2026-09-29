using Microsoft.AspNetCore.SignalR;
using OrderPilot.Api.Services;

namespace OrderPilot.Api.Hubs;

// Sunucu -> istemci: OrderDelayed, AutoRunRequested. İstemci -> sunucu: UserActivity.
public class NotificationHub(DemoScenarioService scenario) : Hub
{
    public void UserActivity() => scenario.RecordUserActivity();
}
