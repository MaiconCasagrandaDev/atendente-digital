import { Router } from "express";
import {
  addItem,
  confirmOrder,
  getOrCreateCart,
  getOrder,
  listOrders,
  removeItem,
  updateStatus,
} from "../services/orders";
import {
  addItemSchema,
  cartSchema,
  confirmOrderSchema,
  listOrdersSchema,
  updateStatusSchema,
} from "../schemas/order";
import { parseId, validate } from "../lib/validate";
import { notifyStatusChange } from "../services/notifications";

export const ordersRouter = Router();

// GET /orders?status=CONFIRMED&day=today: lista os pedidos
ordersRouter.get("/", async (req, res) => {
  const { status, day } = validate(listOrdersSchema, req.query);
  res.json(await listOrders(status, day === "today"));
});

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

// POST /orders/:id/confirm: fecha o carrinho
ordersRouter.post("/:id/confirm", async (req, res) => {
  const orderId = parseId(req.params.id);
  const data = validate(confirmOrderSchema, req.body);
  res.json(await confirmOrder(orderId, data));
});

// PATCH /orders/:id/status: avança o pedido no fluxo e avisa o cliente
ordersRouter.patch("/:id/status", async (req, res) => {
  const orderId = parseId(req.params.id);
  const { status } = validate(updateStatusSchema, req.body);
  const order = await updateStatus(orderId, status);
  await notifyStatusChange(order);
  res.json(order);
});