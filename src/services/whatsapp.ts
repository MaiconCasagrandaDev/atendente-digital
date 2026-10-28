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