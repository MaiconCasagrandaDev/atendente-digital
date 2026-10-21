import { z } from "zod";

export const cartSchema = z.object({
  phone: z
    .string({ error: "phone é obrigatório" })
    .regex(/^\d{10,15}$/, "phone deve ter de 10 a 15 dígitos, só números"),
  name: z.string().trim().min(1).optional(),
});

export const addItemSchema = z.object({
  productId: z.number({ error: "productId é obrigatório" }).int().positive(),
  quantity: z.number().int().positive().max(50, "Máximo de 50 unidades por item").default(1),
  notes: z.string().trim().max(200).optional(),
});