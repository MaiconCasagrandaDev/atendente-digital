import { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { businessDate } from "../lib/hours";
import type { ConfirmOrderInput, DeliveryInput, OrderStatusValue } from "../schemas/order";
import { deliveryProblem, formatAddress, quoteDelivery } from "./delivery";
import { money } from "./receipt";

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

// Total do pedido: itens + taxa de entrega
export function orderTotal(
  items: { unitPrice: Prisma.Decimal; quantity: number }[],
  deliveryFee: Prisma.Decimal | number = 0,
) {
  return items.reduce(
    (sum, item) => sum.plus(item.unitPrice.mul(item.quantity)),
    new Prisma.Decimal(deliveryFee),
  );
}

// Recalcula e salva o total do pedido
async function recalcTotal(orderId: number) {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: true },
  });
  return prisma.order.update({
    where: { id: orderId },
    data: { total: orderTotal(order.items, order.deliveryFee) },
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

// Entrega: o endereço vem do CEP, e a taxa do bairro entra no total
export async function setDelivery(orderId: number, input: DeliveryInput) {
  await getDraft(orderId);

  const quote = await quoteDelivery(input.cep, input.neighborhood);
  if (!quote.ok) {
    const problem = deliveryProblem(quote);
    throw new AppError(problem.status, problem.message);
  }

  const street = quote.address.street || input.street;
  if (!street) throw new AppError(400, "Este CEP é da cidade toda. Informe também a rua.");

  const address = formatAddress({
    street,
    number: input.number,
    neighborhood: quote.neighborhood,
    city: quote.address.city,
    state: quote.address.state,
    complement: input.complement,
    reference: input.reference,
  });

  await prisma.order.update({
    where: { id: orderId },
    data: { deliveryType: "DELIVERY", cep: quote.address.cep, address, deliveryFee: quote.fee },
  });
  return recalcTotal(orderId);
}

// Retirada: sem endereço e sem taxa
export async function setPickup(orderId: number) {
  await getDraft(orderId);
  await prisma.order.update({
    where: { id: orderId },
    data: { deliveryType: "PICKUP", cep: null, address: null, deliveryFee: 0 },
  });
  return recalcTotal(orderId);
}

export async function confirmOrder(orderId: number, data: ConfirmOrderInput) {
  const order = await getDraft(orderId);

  const itemCount = await prisma.orderItem.count({ where: { orderId } });
  if (itemCount === 0) throw new AppError(409, "O carrinho está vazio");

  // Trava: entrega só com endereço que veio do CEP
  if (order.deliveryType === "DELIVERY" && !order.cep) {
    throw new AppError(409, "Informe o endereço de entrega (pelo CEP) ou escolha retirada antes de confirmar");
  }

  if (data.changeFor !== undefined && order.total.greaterThan(data.changeFor)) {
    throw new AppError(
      400,
      `O troco precisa ser para um valor maior ou igual ao total (${money(order.total)})`,
    );
  }

  // Guarda o endereço no cliente ANTES de confirmar,
  // para a resposta já trazer o cliente atualizado
  if (order.deliveryType === "DELIVERY" && order.address) {
    await prisma.customer.update({ where: { id: order.customerId }, data: { address: order.address } });
  }

  // O número do dia é dado na confirmação. Se dois pedidos confirmarem ao mesmo
  // tempo e pegarem o mesmo número, o banco recusa (P2002) e tentamos de novo.
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const day = businessDate();
        const last = await tx.order.aggregate({
          where: { businessDate: day },
          _max: { dailyNumber: true },
        });

        return tx.order.update({
          where: { id: orderId },
          data: {
            status: "CONFIRMED",
            paymentMethod: data.paymentMethod,
            changeFor: data.changeFor ?? null,
            notes: data.notes ?? null,
            businessDate: day,
            dailyNumber: (last._max.dailyNumber ?? 0) + 1,
            confirmedAt: new Date(),
          },
          include: { ...includeItems, customer: true },
        });
      });
    } catch (error) {
      const isConflict =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!isConflict || attempt >= 3) throw error;
    }
  }
}

// Para onde cada status pode ir
const nextStatuses: Record<OrderStatusValue, OrderStatusValue[]> = {
  DRAFT: ["CANCELED"],
  CONFIRMED: ["PREPARING", "CANCELED"],
  PREPARING: ["READY", "CANCELED"],
  READY: ["OUT_FOR_DELIVERY", "DELIVERED", "CANCELED"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
  DELIVERED: [],
  CANCELED: [],
};

export async function updateStatus(orderId: number, status: OrderStatusValue) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError(404, "Pedido não encontrado");

  if (!nextStatuses[order.status].includes(status)) {
    throw new AppError(409, `Não é possível mudar de ${order.status} para ${status}`);
  }
  if (status === "OUT_FOR_DELIVERY" && order.deliveryType === "PICKUP") {
    throw new AppError(409, "Pedido para retirada não sai para entrega");
  }

  return prisma.order.update({
    where: { id: orderId },
    data: { status },
    include: { ...includeItems, customer: true },
  });
}

// Lista os pedidos; sem filtro de status, esconde os carrinhos (DRAFT).
// Com onlyToday, traz só os do dia de trabalho atual, em ordem de chegada.
export async function listOrders(status?: OrderStatusValue, onlyToday = false) {
  return prisma.order.findMany({
    where: {
      ...(status ? { status } : { status: { not: "DRAFT" } }),
      ...(onlyToday ? { businessDate: businessDate() } : {}),
    },
    orderBy: onlyToday ? { dailyNumber: "asc" } : { createdAt: "desc" },
    include: { ...includeItems, customer: true },
  });
}

// "#012" para pedidos com número do dia; pedidos antigos mostram o id
export function orderLabel(order: { id: number; dailyNumber: number | null }) {
  return order.dailyNumber ? `#${String(order.dailyNumber).padStart(3, "0")}` : `nº ${order.id}`;
}
