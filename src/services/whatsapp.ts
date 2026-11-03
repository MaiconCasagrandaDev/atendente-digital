import { normalizeBrazilianPhone } from "../lib/phone";
import type { WebhookPayload } from "../schemas/webhook";

export type IncomingMessage = {
  messageId: string;
  phone: string; // já com o 9
  name?: string;
  text: string;
};

// Um webhook pode trazer várias mensagens; pegamos só as de texto
export function extractTextMessages(payload: WebhookPayload): IncomingMessage[] {
  const result: IncomingMessage[] = [];

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field !== "messages") continue;

      const { contacts = [], messages = [] } = change.value;

      for (const message of messages) {
        if (message.type !== "text" || !message.text) continue;

        const contact = contacts.find((c) => c.wa_id === message.from);

        result.push({
          messageId: message.id,
          phone: normalizeBrazilianPhone(message.from),
          name: contact?.profile?.name,
          text: message.text.body,
        });
      }
    }
  }

  return result;
}

// Envia um texto pelo WhatsApp; devolve o id da mensagem
export async function sendText(to: string, body: string): Promise<string> {
  if (process.env.WHATSAPP_MODE !== "live") {
    console.log(`[SIMULAÇÃO] Bot -> ${to}: ${body}`);
    return `sim.${Date.now()}`;
  }

  const version = process.env.GRAPH_VERSION ?? "v25.0";
  const url = `https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    }),
  });

  if (!response.ok) {
    throw new Error(`Erro do WhatsApp (${response.status}): ${await response.text()}`);
  }

  const data = (await response.json()) as { messages?: { id: string }[] };
  return data.messages?.[0]?.id ?? "";
}
