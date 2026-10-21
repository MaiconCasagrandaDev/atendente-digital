import { Router } from "express";
import { prisma } from "../lib/prisma";

export const productsRouter = Router();

// GET /products: lista os produtos disponíveis
productsRouter.get("/", async (_req, res) => {
  const products = await prisma.product.findMany({
    where: { available: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  res.json(products);
});

// POST /products: cria um produto
productsRouter.post("/", async (req, res) => {
  const { name, description, price, category } = req.body;

  if (!name || price === undefined || !category) {
    res.status(400).json({ error: "name, price e category são obrigatórios" });
    return;
  }

  const product = await prisma.product.create({
    data: { name, description, price, category },
  });
  res.status(201).json(product);
});