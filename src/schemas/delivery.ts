import { z } from "zod";

// Nome do bairro: sem símbolos, para não virar lixo no cadastro nem no comprovante
const zoneName = z
  .string({ error: "Digite o nome do bairro" })
  .trim()
  .min(2, "Digite o nome do bairro")
  .max(60, "Nome do bairro muito longo")
  .regex(/^[\p{L}\p{N} .'-]+$/u, "Use só letras, números, espaço, ponto, hífen e apóstrofo");

// Número de verdade (sem coerção): "" ou null não podem virar taxa 0 sem querer
const zoneFee = z
  .number({ error: "A taxa é obrigatória e deve ser um número" })
  .min(0, "A taxa não pode ser negativa")
  .max(999, "Taxa muito alta");

// Criação pelo nome ou pelo CEP (aí o nome vem do ViaCEP)
export const createZoneSchema = z
  .object({
    name: zoneName.optional(),
    cep: z.string().trim().min(8).max(9).optional(),
    fee: zoneFee,
  })
  .refine((d) => d.name || d.cep, { message: "Informe o nome do bairro ou um CEP" });

// Edição: só taxa e ativo. O nome não muda (para corrigir, exclua e cadastre de novo).
// .strict(): um campo a mais (ex.: name) dá 400 em vez de ser ignorado
export const updateZoneSchema = z
  .object({
    fee: zoneFee.optional(),
    active: z.boolean({ error: "active deve ser true ou false" }).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, "Envie pelo menos um campo para editar");
