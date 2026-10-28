import { Router } from "express";
import { webhookSchema } from "../schemas/webhook";
import { extractTextMessages } from "../services/whatsapp";
import { saveIncomingMessage } from "../services/messages";

export const webhookRouter = Router();

// GET /webhook: a Meta chama uma vez para confirmar que o servidor é seu
webhookRouter.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log("Webhook verificado pela Meta");
    res.status(200).send(challenge);
    return;
  }

  res.sendStatus(403);
});

// POST /webhook: cada mensagem recebida chega aqui
webhookRouter.post("/", async (req, res) => {
  // Responde rápido: se demorar, a Meta reenvia o mesmo evento
  res.sendStatus(200);

  const result = webhookSchema.safeParse(req.body);
  if (!result.success) {
    console.warn("Webhook com formato inesperado, ignorado");
    return;
  }

  for (const message of extractTextMessages(result.data)) {
    try {
      const saved = await saveIncomingMessage(message);
      if (!saved) {
        console.log(`Mensagem ${message.messageId} repetida, ignorada`);
        continue;
      }
      console.log(`Mensagem salva de ${message.phone}: ${message.text}`);
    } catch (error) {
      // A resposta já foi enviada, então o erro só pode ser registrado
      console.error("Erro ao salvar mensagem", error);
    }
  }
});