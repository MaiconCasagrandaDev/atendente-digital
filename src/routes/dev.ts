import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { validate } from "../lib/validate";
import { prisma } from "../lib/prisma";
import { handleIncomingMessage } from "../services/bot";
import { getRecentMessages } from "../services/messages";

export const devRouter = Router();

const chatSchema = z.object({
  phone: z.string().regex(/^\d{10,15}$/, "phone deve ter de 10 a 15 dígitos"),
  name: z.string().trim().min(1).optional(),
  text: z.string().trim().min(1, "text não pode ser vazio"),
});

// POST /dev/chat: simula uma mensagem do cliente e devolve a resposta do bot
devRouter.post("/chat", async (req, res) => {
  const { phone, name, text } = validate(chatSchema, req.body);

  const replies = await handleIncomingMessage({
    messageId: `dev.${randomUUID()}`,
    phone,
    name,
    text,
  });

  res.json({ replies });
});

// GET /dev/history?phone=...: últimas mensagens da conversa, para o simulador
devRouter.get("/history", async (req, res) => {
  const phone = String(req.query.phone ?? "");
  const customer = await prisma.customer.findUnique({ where: { phone } });
  if (!customer) {
    res.json([]);
    return;
  }

  const messages = await getRecentMessages(customer.id, 50);
  res.json(
    messages.map((m) => ({ text: m.text, direction: m.direction, createdAt: m.createdAt })),
  );
});
