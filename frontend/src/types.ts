// Backend ile elle yazılmış sözleşme: alan adları backend/OrderPilot.Api/Models/Order.cs ile aynı olmalı.

export type GetOrderStatusArgs = { orderId: string };
export type GetOrderStatusResult = {
  orderId: string;
  customerName: string;
  status: string;
  expectedDate: string;
  delayDays: number;
  amount: number;
  currency: string;
};
export type StartRefundArgs = { orderId: string; reason: string };
export type StartRefundResult = {
  status: string;
  refundId: string;
  amount: number;
  currency: string;
  estimatedDays: number;
};
export type ListDelayedOrdersResult = { orderId: string; customerName: string; delayDays: number }[];

// SignalR olayları
export type OrderDelayed = { orderId: string; delayDays: number; autoRunAt: string };
export type AutoRunRequested = { orderId: string; reason: string };

// Olay günlüğündeki bir satır: backend'den gelen AG-UI olayı ya da frontend'in gönderdiği istek.
export type LogEntry = {
  id: number;
  time: string;
  direction: 'in' | 'out';
  type: string;
  payload: unknown;
};
