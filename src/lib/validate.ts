import { z } from "zod";
import { AppError } from "./errors";

// Valida com o Zod ou lança um erro 400 com os detalhes
export function validate<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(400, "Dados inválidos", z.flattenError(result.error));
  }
  return result.data;
}

// Converte o :id da URL em número ou lança um erro 400
export function parseId(value: string | undefined) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(400, "id inválido");
  }
  return id;
}