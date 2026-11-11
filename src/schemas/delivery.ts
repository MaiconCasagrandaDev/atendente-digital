import { z } from "zod";

export const zoneSchema = z.object({
  name: z.string({ error: "name é obrigatório" }).trim().min(2, "name muito curto"),
  fee: z.number({ error: "fee é obrigatório e deve ser número" }).min(0).max(1000),
});

export const updateZoneSchema = zoneSchema
  .extend({ active: z.boolean().optional() })
  .partial()
  .refine((data) => Object.keys(data).length > 0, "Envie pelo menos um campo para editar");
