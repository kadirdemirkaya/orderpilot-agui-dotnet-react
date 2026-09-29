using System.ComponentModel;
using OrderPilot.Api.Data;
using OrderPilot.Api.Models;

namespace OrderPilot.Api.Tools;

// Ajanın çağırabildiği araçlar. Dönen nesneler JSON olarak hem modele hem de UI'a (TOOL_CALL_RESULT) gider.
public class OrderTools(OrderRepository repository)
{
    [Description("Teslimatı gecikmiş siparişlerin özet listesini getirir.")]
    public DelayedOrderSummary[] ListDelayedOrders() =>
        repository.GetAll()
            .Where(o => o.Status == "Delayed")
            .Select(o => new DelayedOrderSummary(o.Id, o.CustomerName, o.DelayDays))
            .ToArray();

    [Description("Sipariş numarasına göre müşteri, durum, tutar ve gecikme bilgisini getirir.")]
    public OrderStatusResult GetOrderStatus(
        [Description("Sipariş numarası, örn. '12345'")] string orderId)
    {
        var order = repository.GetById(orderId);
        return order is null
            ? new OrderStatusResult(orderId, "Bilinmiyor", "NotFound", "-", 0, 0m, "TRY")
            : new OrderStatusResult(order.Id, order.CustomerName, order.Status, order.ExpectedDate,
                order.DelayDays, order.Amount, order.Currency);
    }

    [Description("Sipariş için iade başlatır. Kullanıcı onayı gerektirir.")]
    public StartRefundResult StartRefund(
        [Description("İade edilecek sipariş numarası")] string orderId,
        [Description("İade gerekçesi")] string reason)
    {
        var order = repository.GetById(orderId);
        if (order is null)
            return new StartRefundResult("OrderNotFound", "", 0m, "TRY", 0);

        order.Status = "Refunded";
        return new StartRefundResult("RefundInitiated", $"REF-{orderId}-{DateTime.UtcNow:MMddHHmm}",
            order.Amount, order.Currency, 3);
    }
}
