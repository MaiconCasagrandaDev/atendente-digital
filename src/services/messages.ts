import { prisma } from "../lib/prisma";
import type { IncomingMessage } from "./whatsapp";

// Salva a mensagem recebida; devolve null se ela já foi salva antes
export async function saveIncomingMessage(message: IncomingMessage) {
  const duplicate = await prisma.message.findUnique({
    where: { waMessageId: message.messageId },
  });
  if (duplicate) return null;

  // Cria o cliente na primeira mensagem; depois, não mexe no nome
  const customer = await prisma.customer.upsert({
    where: { phone: message.phone },
    update: {},
    create: { phone: message.phone, name: message.name },
  });

  return prisma.message.create({
    data: {
      customerId: customer.id,
      direction: "INBOUND",
      waMessageId: message.messageId,
      text: message.text,
    },
  });
}

// Últimas mensagens da conversa, da mais antiga para a mais nova
// (é o histórico que a IA vai receber mais adiante)
export async function getRecentMessages(customerId: number, limit = 20) {
  const messages = await prisma.message.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return messages.reverse();
}