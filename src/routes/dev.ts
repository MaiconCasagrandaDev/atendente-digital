import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { validate } from "../lib/validate";
import { handleIncomingMessage } from "../services/bot";

export const devRouter = Router();

const chatSchema = z.object({
  phone: z.string().regex(/^\d{10,15}$/, "phone deve ter de 10 a 15 dígitos"),
  name: z.string().trim().min(1).optional(),
  text: z.string().trim().min(1, "text não pode ser vazio"),
});

// POST /dev/chat: simula uma mensagem do cliente e devolve a resposta do bot
devRouter.post("/chat", async (req, res) => {
  const { phone, name, text } = validate(chatSchema, req.body);

  const reply = await handleIncomingMessage({
    messageId: `dev.${randomUUID()}`,
    phone,
    name,
    text,
  });

  res.json({ reply });
});
