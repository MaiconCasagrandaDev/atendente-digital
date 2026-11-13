import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { describeHours, isStoreOpen } from "../lib/hours";
import { money } from "./receipt";
import { confirmOrder, getOrCreateCart, getOrder } from "./orders";

type Valor = { toString(): string } | number | string;

export type SummaryOrder = {
  items: { quantity: number; unitPrice: Valor; notes: string | null; product: { name: string } }[];
  deliveryType: "DELIVERY" | "PICKUP";
  address: string | null;
  deliveryFee: Valor;
  total: Valor;
  paymentMethod: "PIX" | "CARD" | "CASH" | null;
  changeFor: Valor | null;
  notes: string | null;
};

const NOMES_PAGAMENTO = { PIX: "Pix", CARD: "Cartão", CASH: "Dinheiro" } as const;

// O resumo oficial: a IA nunca escreve este texto, só pede para mostrar
export function formatOrderSummary(order: SummaryOrder) {
  const total = Number(order.total);
  const taxa = order.deliveryType === "DELIVERY" ? Number(order.deliveryFee) : 0;

  const linhas = ["🛍️ *Seu pedido*"];
  for (const item of order.items) {
    const obs = item.notes ? ` (${item.notes})` : "";
    linhas.push(`➤ ${item.quantity}x ${item.product.name}${obs} — ${money(Number(item.unitPrice) * item.quantity)}`);
  }

  linhas.push("", `Subtotal: ${money(total - taxa)}`);
  if (order.deliveryType === "DELIVERY") {
    linhas.push(`Taxa de entrega: ${money(taxa)}`, `📍 Endereço: ${order.address}`);
  } else {
    linhas.push("🏪 Retirada no balcão");
  }

  if (order.paymentMethod) {
    const troco = order.changeFor ? ` (troco para ${money(Number(order.changeFor))})` : "";
    linhas.push(`💳 Pagamento: ${NOMES_PAGAMENTO[order.paymentMethod]}${troco}`);
  }
  if (order.notes) linhas.push(`📝 Observação: ${order.notes}`);

  linhas.push(`*Total: ${money(total)}*`, "", "Está tudo certo com o pedido?");
  return linhas.join("\n");
}

// A última mensagem do bot é o resumo oficial do pedido, como ele está agora?
export async function lastMessageIsSummary(phone: string, order: SummaryOrder) {
  if (!order.paymentMethod) return false;
  const lastBotMessage = await prisma.message.findFirst({
    where: { customer: { phone }, direction: "OUTBOUND" },
    orderBy: { createdAt: "desc" },
  });
  return lastBotMessage?.text.trim() === formatOrderSummary(order).trim();
}

// Confirmação com as travas: usada pela ferramenta da IA e pelo atalho do "sim"
export async function confirmFromSummary(phone: string) {
  if (!isStoreOpen()) {
    return {
      ok: false as const,
      erro: `A loja está fechada agora. Não confirme. Avise o cliente que o horário é ${describeHours()}.`,
    };
  }

  const cart = await getOrCreateCart(phone);
  const order = await getOrder(cart.id);
  if (!order.paymentMethod) {
    return { ok: false as const, erro: "Chame mostrar_resumo com a forma de pagamento antes de confirmar." };
  }

  // Trava: a última mensagem do bot precisa ser o resumo oficial do pedido como ele está agora
  if (!(await lastMessageIsSummary(phone, order))) {
    return {
      ok: false as const,
      erro: "O pedido mudou ou o resumo não foi mostrado. Chame mostrar_resumo de novo antes de confirmar.",
    };
  }

  try {
    const confirmed = await confirmOrder(order.id, {
      paymentMethod: order.paymentMethod,
      changeFor: order.changeFor ? Number(order.changeFor) : undefined,
      notes: order.notes ?? undefined,
    });
    return { ok: true as const, order: confirmed };
  } catch (error) {
    if (error instanceof AppError) return { ok: false as const, erro: error.message };
    throw error;
  }
}
