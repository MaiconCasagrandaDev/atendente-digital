import express, { type ErrorRequestHandler } from "express";
import { productsRouter } from "./routes/products";
import { ordersRouter } from "./routes/orders";
import { AppError } from "./lib/errors";
import { requireAdmin } from "./lib/auth";
import { describeHours, isStoreOpen, validateStoreConfig } from "./lib/hours";
import { webhookRouter } from "./routes/webhook";
import { devRouter } from "./routes/dev";
import { deliveryRouter } from "./routes/delivery";
import { rateLimit } from "./lib/rate-limit";
import { deliveryProblem, quoteDelivery } from "./services/delivery";

const app = express();

// O Render fica na frente do servidor: isso faz o req.ip ser o IP real do cliente
app.set("trust proxy", 1);
app.use(express.json());

// Fotos do cardápio, em public/imagens
app.use("/imagens", express.static("public/imagens"));

// Dados públicos da loja, usados pelo cardápio
app.get("/store", (_req, res) => {
  const live = process.env.WHATSAPP_MODE === "live";
  res.json({
    name: process.env.STORE_NAME ?? "Minha Loja",
    whatsappNumber: live ? process.env.WHATSAPP_DISPLAY_NUMBER || null : null,
    open: isStoreOpen(),
    hours: describeHours(),
    contactWhatsapp: process.env.CONTACT_WHATSAPP?.replace(/\D/g, "") || null,
    contactName: process.env.CONTACT_NAME || null,
  });
});

// GET /delivery/quote?cep=...&bairro=...: endereço e taxa para o cardápio
app.get("/delivery/quote", rateLimit({ windowMs: 60_000, max: 20 }), async (req, res) => {
  const cep = String(req.query.cep ?? "");
  const bairro = typeof req.query.bairro === "string" ? req.query.bairro : undefined;

  const quote = await quoteDelivery(cep, bairro);
  if (!quote.ok) {
    const problem = deliveryProblem(quote);
    res.status(problem.status).json({
      ok: false,
      reason: quote.reason,
      error: problem.message,
      city: quote.address?.city ?? null,
      state: quote.address?.state ?? null,
    });
    return;
  }

  res.json({
    ok: true,
    cep: quote.address.cep,
    street: quote.address.street,
    neighborhood: quote.neighborhood,
    city: quote.address.city,
    state: quote.address.state,
    fee: quote.fee.toFixed(2),
  });
});

// Cardápio digital
app.get("/cardapio", (_req, res) => {
  res.sendFile("cardapio.html", { root: "public" });
});

// Painel do dono (os dados exigem a chave de administrador)
app.get("/painel", (_req, res) => {
  res.sendFile("painel.html", { root: "public" });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/products", productsRouter);
app.use("/orders", requireAdmin, ordersRouter);
app.use("/delivery-zones", requireAdmin, deliveryRouter);
app.use("/webhook", webhookRouter);

// Rotas de teste e simulador: só existem fora do modo "live"
if (process.env.WHATSAPP_MODE !== "live") {
  app.use("/dev", devRouter);

  app.get("/simulador", (_req, res) => {
    res.sendFile("simulador.html", { root: "public" });
  });
}

// Tratamento de erros: precisa ficar depois das rotas
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }
  if (err.type === "entity.parse.failed") {
    res.status(400).json({ error: "JSON inválido" });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Erro interno do servidor" });
};
app.use(errorHandler);

const PORT = Number(process.env.PORT) || 3000;

// Confere o horário da loja no .env; se estiver errado, mostra o motivo e não sobe
validateStoreConfig();

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
