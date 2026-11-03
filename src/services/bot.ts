import { generateReply } from "./ai";
import { saveIncomingMessage, saveOutgoingMessage } from "./messages";
import { sendText, type IncomingMessage } from "./whatsapp";

// Recebe a mensagem do cliente, gera a resposta com a IA e envia
export async function handleIncomingMessage(message: IncomingMessage) {
  const saved = await saveIncomingMessage(message);
  if (!saved) {
    console.log(`Mensagem ${message.messageId} repetida, ignorada`);
    return null;
  }

  let reply: string;
  try {
    reply = await generateReply(saved.customerId, message.phone);
  } catch (error) {
    console.error("Erro na IA", error);
    reply = "Desculpe, estou com uma instabilidade agora. Pode tentar de novo em instantes?";
  }

  const waMessageId = await sendText(message.phone, reply);
  await saveOutgoingMessage(saved.customerId, reply, waMessageId);

  return reply;
}
