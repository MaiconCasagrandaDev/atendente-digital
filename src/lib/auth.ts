import type { NextFunction, Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { AppError } from "./errors";

// Libera a rota só para quem mandar a chave certa no header x-admin-key
// (genérico, para não mudar o tipo de req.params nas rotas que o usam)
export function requireAdmin<P>(req: Request<P>, _res: Response, next: NextFunction) {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) {
    throw new AppError(503, "ADMIN_API_KEY não configurada no servidor");
  }

  const received = Buffer.from(req.header("x-admin-key") ?? "");
  const correct = Buffer.from(expected);

  // Compara em tempo constante, para não dar pistas da chave pelo tempo de resposta
  if (received.length !== correct.length || !timingSafeEqual(received, correct)) {
    throw new AppError(401, "Não autorizado");
  }

  next();
}
