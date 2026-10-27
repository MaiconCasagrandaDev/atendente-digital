import { z } from "zod";

export const orderStatuses = [
  "DRAFT",
  "CONFIRMED",
  "PREPARING",
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
  notes: z.string().trim().max(200).optional(),
});

export const confirmOrderSchema = z
  .object({
    deliveryType: z.enum(["DELIVERY", "PICKUP"], { error: "deliveryType deve ser DELIVERY ou PICKUP" }),
    address: z.string().trim().min(5, "Endereço muito curto").optional(),
    paymentMethod: z.enum(["PIX", "CARD", "CASH"], { error: "paymentMethod deve ser PIX, CARD ou CASH" }),
    changeFor: z.number().positive().optional(),
    notes: z.string().trim().max(300).optional(),
  })
  .refine((data) => data.deliveryType === "PICKUP" || data.address, {
    error: "Endereço é obrigatório para entrega",
    path: ["address"],
  })
  .refine((data) => data.changeFor === undefined || data.paymentMethod === "CASH", {
    error: "Troco só vale para pagamento em dinheiro",
    path: ["changeFor"],
  });

export type ConfirmOrderInput = z.output<typeof confirmOrderSchema>;

export const updateStatusSchema = z.object({
  status: z.enum(orderStatuses, { error: "status inválido" }),
});

export const listOrdersSchema = z.object({
  status: z.enum(orderStatuses, { error: "status inválido" }).optional(),
});