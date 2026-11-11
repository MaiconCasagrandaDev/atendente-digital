import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { lookupCep } from "../lib/cep";
import { validate } from "../lib/validate";
import { prisma } from "../lib/prisma";
import { handleIncomingMessage } from "../services/bot";
import { getRecentMessages } from "../services/messages";
import { quoteDelivery } from "../services/delivery";

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

// GET /dev/history?phone=...&after=...: mensagens da conversa, para o simulador
// Sem "after", devolve as últimas 50; com "after", só as que vieram depois desse id
devRouter.get("/history", async (req, res) => {
  const phone = String(req.query.phone ?? "");
  const after = Number(req.query.after ?? 0);

  const customer = await prisma.customer.findUnique({ where: { phone } });
  if (!customer) {
    res.json([]);
    return;
  }

  const messages =
    after > 0
      ? await prisma.message.findMany({
          where: { customerId: customer.id, id: { gt: after } },
          orderBy: { id: "asc" },
        })
      : await getRecentMessages(customer.id, 50);

  res.json(
    messages.map((m) => ({ id: m.id, text: m.text, direction: m.direction, createdAt: m.createdAt })),
  );
});

// GET /dev/cep/95700000: consulta um CEP no ViaCEP (só para testes)
devRouter.get("/cep/:cep", async (req, res) => {
  try {
    const address = await lookupCep(req.params.cep);
    res.json(address ?? { error: "CEP inválido ou não encontrado" });
  } catch {
    res.status(502).json({ error: "ViaCEP indisponível" });
  }
});

// GET /dev/delivery/:cep?bairro=...: endereço e taxa de entrega (só para testes)
devRouter.get("/delivery/:cep", async (req, res) => {
  const bairro = typeof req.query.bairro === "string" ? req.query.bairro : undefined;
  res.json(await quoteDelivery(req.params.cep, bairro));
});
