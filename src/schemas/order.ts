import { z } from "zod";

export const orderStatuses = [
  "DRAFT",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELED",
] as const;

export type OrderStatusValue = (typeof orderStatuses)[number];

export const cartSchema = z.object({
  phone: z
    .string({ error: "phone é obrigatório" })
    .regex(/^\d{10,15}$/, "phone deve ter de 10 a 15 dígitos, só números"),
  name: z.string().trim().min(1).optional(),
});

export const addItemSchema = z.object({
  productId: z.number({ error: "productId é obrigatório" }).int().positive(),
  quantity: z.number().int().positive().max(50, "Máximo de 50 unidades por item").default(1),
  notes: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) =>
      value && /^(sem (altera[cç][aã]o|observa[cç][aã]o|obs)|normal|nenhuma?|-)$/i.test(value) ? undefined : value,
    ),
});

export const confirmOrderSchema = z
  .object({
    paymentMethod: z.enum(["PIX", "CARD", "CASH"], { error: "paymentMethod deve ser PIX, CARD ou CASH" }),
    changeFor: z.number().positive().optional(),
    notes: z.string().trim().max(300).optional(),
  })
  .refine((data) => data.changeFor === undefined || data.paymentMethod === "CASH", {
    error: "Troco só vale para pagamento em dinheiro",
    path: ["changeFor"],
  });

export type ConfirmOrderInput = z.output<typeof confirmOrderSchema>;

// Número da casa: "506", "506A", "s/n", "sn" ou "sem número" (também aceita número em vez de texto)
export const houseNumberSchema = z.preprocess(
  (value) => (value === undefined || value === null ? value : String(value)),
  z.string().trim().regex(/^(\d+[a-z]?|s\/?n|sem n[uú]mero)$/i, "Número da casa inválido"),
);

export const deliverySchema = z.object({
  cep: z.string({ error: "cep é obrigatório" }).trim().min(8, "CEP inválido"),
  number: houseNumberSchema,
  street: z.string().trim().min(3).optional(),        // só quando o CEP é geral da cidade
  neighborhood: z.string().trim().min(2).optional(),  // só quando o CEP é geral da cidade
  complement: z.string().trim().max(100).optional(),
  reference: z.string().trim().max(150).optional(),
});

export type DeliveryInput = z.output<typeof deliverySchema>;

export const updateStatusSchema = z.object({
  status: z.enum(orderStatuses, { error: "status inválido" }),
});

export const listOrdersSchema = z.object({
  status: z.enum(orderStatuses, { error: "status inválido" }).optional(),
  day: z.literal("today", { error: 'day só aceita "today"' }).optional(),
});