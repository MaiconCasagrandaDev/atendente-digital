import express from "express";
import { productsRouter } from "./routes/products";

const app = express();
app.use(express.json());
app.use("/products", productsRouter);

app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});