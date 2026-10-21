import { Router } from "express";
import { addItem, getOrCreateCart, getOrder, removeItem } from "../services/orders";
import { addItemSchema, cartSchema } from "../schemas/order";
import { parseId, validate } from "../lib/validate";

export const ordersRouter = Router();

// POST /orders/cart: busca ou cria o carrinho do cliente
ordersRouter.post("/cart", async (req, res) => {
  const { phone, name } = validate(cartSchema, req.body);
  res.json(await getOrCreateCart(phone, name));
});

// GET /orders/:id: busca um pedido com os itens
ordersRouter.get("/:id", async (req, res) => {
  res.json(await getOrder(parseId(req.params.id)));
});

// POST /orders/:id/items: adiciona um item ao carrinho
ordersRouter.post("/:id/items", async (req, res) => {
  const orderId = parseId(req.params.id);
  const { productId, quantity, notes } = validate(addItemSchema, req.body);
  res.status(201).json(await addItem(orderId, productId, quantity, notes));
});

// DELETE /orders/:id/items/:itemId: remove um item do carrinho
ordersRouter.delete("/:id/items/:itemId", async (req, res) => {
  res.json(await removeItem(parseId(req.params.id), parseId(req.params.itemId)));
});