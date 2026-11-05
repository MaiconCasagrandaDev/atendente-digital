import type { Prisma } from "../generated/prisma/client";

type OrderWithItems = Prisma.OrderGetPayload<{
  include: { items: { include: { product: true } } };
}>;

const LINE = "━━━━━━━━━━━━━━";

const paymentLabels: Record<string, string> = {
  PIX: "Pix",
  CARD: "Cartão",
  CASH: "Dinheiro",
};

function money(value: Prisma.Decimal | number) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function section(title: string) {
  return [LINE, title, LINE];
}

// Comprovante do pedido no formato do WhatsApp
export function formatOrderReceipt(order: OrderWithItems) {
  const lines: string[] = [`✅ *Pedido nº ${order.id} confirmado!*`, ""];

  if (order.deliveryType === "DELIVERY") {
    lines.push(...section("🛵 *ENTREGA*"));
    lines.push(`Endereço: ${order.address ?? "não informado"}`);
  } else {
    lines.push(...section("🏪 *RETIRADA NO BALCÃO*"));
    lines.push("Te avisamos por aqui quando estiver pronto.");
  }
  lines.push("");

  lines.push(...section("🛍️ *PRODUTOS*"));
  for (const item of order.items) {
    const subtotal = item.unitPrice.mul(item.quantity);
    lines.push(`➤ ${item.quantity}x ${item.product.name} — ${money(subtotal)}`);
    if (item.notes) lines.push(`   ⎿ ${item.notes}`);
  }
  if (order.notes) lines.push(`Observação: ${order.notes}`);
  lines.push("");

  lines.push(...section("💰 *PAGAMENTO*"));
  lines.push(`Forma de pagamento: ${paymentLabels[order.paymentMethod ?? ""] ?? "não informada"}`);
  if (order.changeFor) {
    const change = order.changeFor.minus(order.total);
    lines.push(`Troco para ${money(order.changeFor)} (levar ${money(change)} de troco)`);
  }
  lines.push("");
  lines.push(`*TOTAL: ${money(order.total)}*`);
  lines.push(LINE);
  lines.push("Vamos te avisando por aqui a cada etapa do pedido! 😊");

  return lines.join("\n");
}
