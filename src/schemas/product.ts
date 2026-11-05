import { z } from "zod";

export const productOptionGroupSchema = z.object({
  name: z.string().trim().min(1),
  type: z.enum(["single", "multiple"]),
  required: z.boolean().default(false),
  prefix: z.string().optional(),
  choices: z.array(z.string().trim().min(1)).min(1),
});

export const productOptionsSchema = z.array(productOptionGroupSchema);

export type ProductOptionGroup = z.output<typeof productOptionGroupSchema>;

export const createProductSchema = z.object({
  name: z
    .string({ error: "name é obrigatório e deve ser texto" })
    .trim()
    .min(1, "name não pode ser vazio"),
  description: z.string().trim().optional(),
  imageUrl: z.string().trim().min(1, "imageUrl não pode ser vazio").optional(),
  options: productOptionsSchema.optional(),
  price: z
    .number({ error: "price é obrigatório e deve ser um número" })
    .positive("price deve ser maior que zero"),
  category: z
    .string({ error: "category é obrigatório e deve ser texto" })
    .trim()
    .min(1, "category não pode ser vazio"),
});

// Na edição, todos os campos são opcionais, mas precisa vir pelo menos um
export const updateProductSchema = createProductSchema
  .extend({ available: z.boolean().optional() })
  .partial()
  .refine((data) => Object.keys(data).length > 0, "Envie pelo menos um campo para editar");