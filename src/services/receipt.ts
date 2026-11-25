import type { Prisma } from "../generated/prisma/client";
import { orderLabel } from "./orders";

type OrderWithItems = Prisma.OrderGetPayload<{
  include: { items: { include: { product: true } } };
}>;

const LINE = "━━━━━━━━━━━━━━";

const paymentLabels: Record<string, string> = {
  PIX: "Pix",
  CARD: "Cartão",
  CASH: "Dinheiro",
};

export function money(value: Prisma.Decimal | number) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Dinheiro: mostra o troco já calculado para o entregador
export function cashLine(total: number, changeFor: number | null) {
  if (changeFor && changeFor > total) {
    const levar = Math.round((changeFor - total) * 100) / 100;
    return `Dinheiro (troco para ${money(changeFor)} · levar ${money(levar)} de troco)`;
  }
  return "Dinheiro (sem troco, valor exato)";
}

function section(title: string) {
  return [LINE, title, LINE];
}

// Comprovante do pedido no formato do WhatsApp
export function formatOrderReceipt(order: OrderWithItems) {
  const lines: string[] = [`✅ *Pedido ${orderLabel(order)} confirmado!*`, ""];

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
  const formaPagamento =
    order.paymentMethod === "CASH"
      ? cashLine(Number(order.total), order.changeFor ? Number(order.changeFor) : null)
      : (paymentLabels[order.paymentMethod ?? ""] ?? "não informada");
  lines.push(`Forma de pagamento: ${formaPagamento}`);
  lines.push("");
  if (Number(order.deliveryFee) > 0) {
    lines.push(`Subtotal: ${money(order.total.minus(order.deliveryFee))}`);
    lines.push(`Taxa de entrega: ${money(order.deliveryFee)}`);
  }
  lines.push(`*TOTAL: ${money(order.total)}*`);
  lines.push(LINE);
  lines.push("Vamos te avisando por aqui a cada etapa do pedido! 😊");

  return lines.join("\n");
}
