using System.Collections.Concurrent;
using OrderPilot.Api.Models;

namespace OrderPilot.Api.Data;

public class OrderRepository
{
    private readonly ConcurrentDictionary<string, Order> _orders = new();

    public OrderRepository() => Reset();

    // Demo senaryosu: yalnızca 12345 gecikmiş (4 gün, 249.90 TRY).
    public void Reset()
    {
        var today = DateTime.UtcNow.Date;
        _orders.Clear();
        foreach (var order in new Order[]
        {
            new() { Id = "12345", CustomerName = "Ahmet Yılmaz", Status = "Delayed", ExpectedDate = today.AddDays(-4).ToString("yyyy-MM-dd"), DelayDays = 4, Amount = 249.90m },
            new() { Id = "10001", CustomerName = "Ayşe Kaya", Status = "Preparing", ExpectedDate = today.AddDays(2).ToString("yyyy-MM-dd"), Amount = 540.00m },
            new() { Id = "10002", CustomerName = "Mehmet Demir", Status = "Shipped", ExpectedDate = today.AddDays(1).ToString("yyyy-MM-dd"), Amount = 189.50m },
            new() { Id = "10003", CustomerName = "Zeynep Çelik", Status = "Delivered", ExpectedDate = today.AddDays(-2).ToString("yyyy-MM-dd"), Amount = 1250.00m },
            new() { Id = "10004", CustomerName = "Caner Özkan", Status = "Shipped", ExpectedDate = today.AddDays(1).ToString("yyyy-MM-dd"), Amount = 75.00m },
        })
        {
            _orders[order.Id] = order;
        }
    }

    public IEnumerable<Order> GetAll() => _orders.Values;

    public Order? GetById(string orderId) => _orders.GetValueOrDefault(orderId);
}
