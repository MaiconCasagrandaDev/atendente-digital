import { generateReply } from "./ai";
import { saveIncomingMessage, saveOutgoingMessage } from "./messages";
import { getOrder } from "./orders";
import { formatOrderReceipt } from "./receipt";
import { sendText, type IncomingMessage } from "./whatsapp";

// Envia uma mensagem ao cliente e salva no histórico
async function reply(customerId: number, phone: string, text: string) {
  const waMessageId = await sendText(phone, text);
  await saveOutgoingMessage(customerId, text, waMessageId);
}

// Resposta quando a IA falha; na demonstração, a cota esgotada vira um convite de contato
function fallbackReply(error: unknown) {
  const status = (error as { status?: number }).status;
  const message = String((error as { message?: unknown }).message ?? "");
  const quotaExceeded = status === 429 || message.includes("sem cota");

  const contact = process.env.CONTACT_WHATSAPP?.replace(/\D/g, "");
  const name = process.env.CONTACT_NAME || "a gente";

  if (quotaExceeded && contact) {
    return `A demonstração atingiu o limite de testes de hoje. 😅\n\nQuer ver um atendente assim funcionando no seu negócio? Fale com ${name} pelo WhatsApp: https://wa.me/${contact}`;
  }
  if (quotaExceeded) {
    return "Estamos com muitos atendimentos agora. Pode tentar de novo em alguns minutos?";
  }
  return "Desculpe, estou com uma instabilidade agora. Pode tentar de novo em instantes?";
}

// Recebe a mensagem do cliente, gera a resposta com a IA e envia
export async function handleIncomingMessage(message: IncomingMessage) {
  const saved = await saveIncomingMessage(message);
  if (!saved) {
    console.log(`Mensagem ${message.messageId} repetida, ignorada`);
    return [];
  }

  const replies: string[] = [];

  try {
    const { text, confirmedOrderId } = await generateReply(saved.customerId, message.phone);
    replies.push(text);

    // Pedido confirmado nesta resposta: o código monta o comprovante
    if (confirmedOrderId) {
      const order = await getOrder(confirmedOrderId);
      replies.push(formatOrderReceipt(order));
    }
  } catch (error) {
    console.error("Erro na IA", error);
    replies.push(fallbackReply(error));
  }

  for (const text of replies) {
    await reply(saved.customerId, message.phone, text);
  }

  return replies;
}
