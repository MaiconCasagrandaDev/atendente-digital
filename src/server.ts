import express, { type ErrorRequestHandler } from "express";
import { productsRouter } from "./routes/products";
import { ordersRouter } from "./routes/orders";
import { AppError } from "./lib/errors";
import { requireAdmin } from "./lib/auth";
import { webhookRouter } from "./routes/webhook";
import { devRouter } from "./routes/dev";

const app = express();
app.use(express.json());

// Fotos do cardápio, em public/imagens
app.use("/imagens", express.static("public/imagens"));

// Dados públicos da loja, usados pelo cardápio
app.get("/store", (_req, res) => {
  const live = process.env.WHATSAPP_MODE === "live";
  res.json({
    name: process.env.STORE_NAME ?? "Minha Loja",
    whatsappNumber: live ? process.env.WHATSAPP_DISPLAY_NUMBER || null : null,
  });
});

// Cardápio digital
app.get("/cardapio", (_req, res) => {
  res.sendFile("cardapio.html", { root: "public" });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/products", productsRouter);
app.use("/orders", requireAdmin, ordersRouter);
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

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
