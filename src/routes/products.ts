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

// Converte o :id da URL em número, ou null se for inválido
function parseId(value: string | undefined) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// GET /products/:id: busca um produto
productsRouter.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "id inválido" });
    return;
  }

  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) {
    res.status(404).json({ error: "Produto não encontrado" });
    return;
  }
  res.json(product);
});

// PATCH /products/:id: edita só os campos enviados
productsRouter.patch("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "id inválido" });
    return;
  }

  const exists = await prisma.product.findUnique({ where: { id } });
  if (!exists) {
    res.status(404).json({ error: "Produto não encontrado" });
    return;
  }

  const { name, description, price, category, available } = req.body;
  const product = await prisma.product.update({
    where: { id },
    data: { name, description, price, category, available },
  });
  res.json(product);
});

// DELETE /products/:id: desativa em vez de apagar
productsRouter.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "id inválido" });
    return;
  }

  const exists = await prisma.product.findUnique({ where: { id } });
  if (!exists) {
    res.status(404).json({ error: "Produto não encontrado" });
    return;
  }

  await prisma.product.update({ where: { id }, data: { available: false } });
  res.status(204).send();
});