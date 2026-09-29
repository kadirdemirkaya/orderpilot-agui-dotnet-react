namespace OrderPilot.Api.Models;

public class Order
{
    public required string Id { get; init; }
    public required string CustomerName { get; init; }
    public required string Status { get; set; } // Preparing | Shipped | Delayed | Delivered | Refunded
    public required string ExpectedDate { get; init; }
    public int DelayDays { get; init; }
    public decimal Amount { get; init; }
    public string Currency { get; init; } = "TRY";
}

// Araç sonuçları. Alan adları frontend/src/types.ts ile birebir aynı olmalı.
public record DelayedOrderSummary(string OrderId, string CustomerName, int DelayDays);

public record OrderStatusResult(
    string OrderId, string CustomerName, string Status, string ExpectedDate,
    int DelayDays, decimal Amount, string Currency);

public record StartRefundResult(
    string Status, string RefundId, decimal Amount, string Currency, int EstimatedDays);
