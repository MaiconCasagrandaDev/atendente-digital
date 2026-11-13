import type { RequestHandler } from "express";

// Limita quantas requisições cada endereço IP faz numa janela de tempo
export function rateLimit({ windowMs, max }: { windowMs: number; max: number }): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req, res, next) => {
    const now = Date.now();

    // Limpeza ocasional, para o mapa não crescer para sempre
    if (hits.size > 5000) {
      for (const [key, entry] of hits) if (entry.resetAt < now) hits.delete(key);
    }

    const key = req.ip ?? "desconhecido";
    const entry = hits.get(key);

    if (!entry || entry.resetAt < now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (entry.count >= max) {
      res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
      res.status(429).json({ error: "Muitas consultas seguidas. Tente de novo em instantes." });
      return;
    }

    entry.count++;
    next();
  };
}
