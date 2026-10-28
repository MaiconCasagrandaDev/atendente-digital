import { z } from "zod";

const messageSchema = z.object({
  from: z.string(),
  id: z.string(),
  timestamp: z.string(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
});

const contactSchema = z.object({
  wa_id: z.string(),
  profile: z.object({ name: z.string() }).optional(),
});

export const webhookSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          field: z.string(),
          value: z.object({
            contacts: z.array(contactSchema).optional(),
            messages: z.array(messageSchema).optional(),
          }),
        }),
      ),
    }),
  ),
});

export type WebhookPayload = z.output<typeof webhookSchema>;