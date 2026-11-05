import type { Prisma } from "../generated/prisma/client";
import { saveOutgoingMessage } from "./messages";
import { money } from "./receipt";
import { sendText } from "./whatsapp";

type OrderWithCustomer = Prisma.OrderGetPayload<{ include: { customer: true } }>;

const PUBLIC_URL = process.env.PUBLIC_URL?.replace(/\/+$/, "");

// Mensagem de cada status; null quando não há aviso
function statusMessage(order: OrderWithCustomer): string | null {
  const number = `nº ${order.id}`;
  const delivery = order.deliveryType === "DELIVERY";

  switch (order.status) {
    case "PREPARING":
      return `👨‍🍳 Seu pedido ${number} já está sendo preparado!\n\nAssim que estiver pronto, te avisamos por aqui. 😊`;

    case "READY":
      return delivery
        ? `😋 Seu pedido ${number} está pronto!\n\nO motoboy já vai sair com ele. 🛵`
        : `😋 Seu pedido ${number} está pronto!\n\nJá pode retirar no balcão. 🏪`;

    case "OUT_FOR_DELIVERY": {
      const change =
        order.paymentMethod === "CASH" && order.changeFor
          ? `\n\nSe puder, deixe o dinheiro separado: o troco é para ${money(order.changeFor)}. 😉`
          : "";
      return `🛵 Seu pedido ${number} saiu para entrega!\n\nLogo chega aí, ainda quentinho.${change}`;
    }

    case "DELIVERED": {
      const link = PUBLIC_URL ? `\n\nQuando quiser pedir de novo, é só mandar uma mensagem ou ver o cardápio: ${PUBLIC_URL}/cardapio` : "";
      const text = delivery ? `✅ Seu pedido ${number} foi entregue!` : `✅ Pedido ${number} retirado!`;
      return `${text}\n\nObrigado pela preferência! 🥰${link}`;
    }

    case "CANCELED":
      return `😕 Seu pedido ${number} foi cancelado.\n\nSe tiver alguma dúvida, é só responder esta mensagem.`;

    default:
      return null;
  }
}

// Avisa o cliente da mudança de status; uma falha aqui não desfaz a mudança
export async function notifyStatusChange(order: OrderWithCustomer) {
  const text = statusMessage(order);
  if (!text) return;

  try {
    const waMessageId = await sendText(order.customer.phone, text);
    await saveOutgoingMessage(order.customerId, text, waMessageId);
  } catch (error) {
    console.error(`Erro ao avisar o cliente do pedido ${order.id}`, error);
  }
}
