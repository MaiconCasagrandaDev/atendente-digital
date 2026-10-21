import { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";

// Sempre devolve o pedido com os itens e os produtos
const includeItems = {
  items: { include: { product: true }, orderBy: { id: "asc" } },
} satisfies Prisma.OrderInclude;

// Busca o carrinho (DRAFT) do cliente ou cria um novo
export async function getOrCreateCart(phone: string, name?: string) {
  const customer = await prisma.customer.upsert({
    where: { phone },
    update: name ? { name } : {},
    create: { phone, name },
  });

  const cart = await prisma.order.findFirst({
    where: { customerId: customer.id, status: "DRAFT" },
    include: includeItems,
  });
  if (cart) return cart;

  return prisma.order.create({
    data: { customerId: customer.id },
    include: includeItems,
  });
}

export async function getOrder(orderId: number) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { ...includeItems, customer: true },
  });
  if (!order) throw new AppError(404, "Pedido não encontrado");
  return order;
}

// Garante que o pedido existe e ainda é um carrinho
async function getDraft(orderId: number) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError(404, "Pedido não encontrado");
  if (order.status !== "DRAFT") {
    throw new AppError(409, "Este pedido já foi fechado e não pode ser alterado");
  }
  return order;
}

// Soma quantidade x preço de cada item e salva no pedido
async function recalcTotal(orderId: number) {
  const items = await prisma.orderItem.findMany({ where: { orderId } });
  const total = items.reduce(
    (sum, item) => sum.plus(item.unitPrice.mul(item.quantity)),
    new Prisma.Decimal(0),
  );
  return prisma.order.update({
    where: { id: orderId },
    data: { total },
    include: includeItems,
  });
}

export async function addItem(orderId: number, productId: number, quantity: number, notes?: string) {
  await getDraft(orderId);

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || !product.available) {
    throw new AppError(404, "Produto não encontrado ou indisponível");
  }

  // Mesmo produto com a mesma observação: soma na quantidade
  const existing = await prisma.orderItem.findFirst({
    where: { orderId, productId, notes: notes ?? null },
  });

  if (existing) {
    await prisma.orderItem.update({
      where: { id: existing.id },
      data: { quantity: existing.quantity + quantity },
    });
  } else {
    await prisma.orderItem.create({
      data: { orderId, productId, quantity, unitPrice: product.price, notes },
    });
  }

  return recalcTotal(orderId);
}

export async function removeItem(orderId: number, itemId: number) {
  await getDraft(orderId);

  const item = await prisma.orderItem.findFirst({ where: { id: itemId, orderId } });
  if (!item) throw new AppError(404, "Item não encontrado neste pedido");

  await prisma.orderItem.delete({ where: { id: itemId } });
  return recalcTotal(orderId);
}