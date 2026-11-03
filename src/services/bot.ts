import { saveIncomingMessage, saveOutgoingMessage } from "./messages";
import { sendText, type IncomingMessage } from "./whatsapp";

// Recebe a mensagem do cliente, decide a resposta e envia
export async function handleIncomingMessage(message: IncomingMessage) {
  const saved = await saveIncomingMessage(message);
  if (!saved) {
    console.log(`Mensagem ${message.messageId} repetida, ignorada`);
    return null;
  }

  // Por enquanto, o papagaio. No próximo passo, a IA entra aqui.
  const reply = `Você disse: ${message.text}`;

  const waMessageId = await sendText(message.phone, reply);
  await saveOutgoingMessage(saved.customerId, reply, waMessageId);

  return reply;
}
