export type InvoiceStatusValue = "UNPAID" | "PARTIALLY_PAID" | "PAID" | "VOID";

export function computeInvoiceStatus(
  amount: number,
  paidTotal: number,
  currentStatus: InvoiceStatusValue
): InvoiceStatusValue {
  if (currentStatus === "VOID") {
    return "VOID";
  }
  if (paidTotal <= 0) {
    return "UNPAID";
  }
  if (paidTotal >= amount) {
    return "PAID";
  }
  return "PARTIALLY_PAID";
}
