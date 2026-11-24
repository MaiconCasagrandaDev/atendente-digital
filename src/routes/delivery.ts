import { Router } from "express";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { normalizeText } from "../lib/text";
import { cityNeighborhoods, findNeighborhood } from "../lib/neighborhoods";
import { parseId, validate } from "../lib/validate";
import { createZoneSchema, updateZoneSchema } from "../schemas/delivery";
import { deliveryProblem, quoteDelivery } from "../services/delivery";

export const deliveryRouter = Router();

// Bairro com nome repetido vira 409, em vez de erro 500
function rethrowDuplicate(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new AppError(409, "Já existe um bairro com esse nome");
  }
  throw error;
}

// GET /delivery-zones: lista os bairros
deliveryRouter.get("/", async (_req, res) => {
  res.json(await prisma.deliveryZone.findMany({ orderBy: { name: "asc" } }));
});

// Lista de bairros da cidade da loja (data/bairros); null = sem lista
const storeNeighborhoods = () =>
  cityNeighborhoods(process.env.STORE_CITY ?? "", process.env.STORE_STATE ?? "");

// GET /delivery-zones/known: bairros da cidade, para as sugestões do painel
deliveryRouter.get("/known", (_req, res) => {
  const list = storeNeighborhoods();
  res.json({ neighborhoods: list ?? [], restricted: list !== null });
});

// GET /delivery-zones/check/:cep: mostra como o ViaCEP escreve o bairro e se ele está cadastrado
// Fica antes das rotas /:id, para o "check" não ser lido como id
deliveryRouter.get("/check/:cep", async (req, res) => {
  const quote = await quoteDelivery(String(req.params.cep));
  const address = quote.address;

  // Bairro como o ViaCEP escreve, com a mesma normalização da key do cadastro
  const zone = address?.neighborhood
    ? await prisma.deliveryZone.findUnique({ where: { key: normalizeText(address.neighborhood) } })
    : null;

  const details = {
    cep: address?.cep ?? null,
    street: address?.street ?? null,
    neighborhood: address?.neighborhood ?? null, // texto do ViaCEP, antes de casar com o cadastro
    city: address?.city ?? null,
    state: address?.state ?? null,
    zone: zone ? { id: zone.id, name: zone.name, fee: zone.fee.toFixed(2), active: zone.active } : null,
  };

  if (!quote.ok) {
    // Mesmo tratamento de erro da rota /delivery/quote, com o endereço quando houver
    const problem = deliveryProblem(quote);
    res.status(problem.status).json({ ok: false, reason: quote.reason, error: problem.message, ...details });
    return;
  }

  res.json({ ok: true, ...details, fee: quote.fee.toFixed(2) });
});

// POST /delivery-zones: cadastra um bairro pelo nome ou pelo CEP
deliveryRouter.post("/", async (req, res) => {
  const data = validate(createZoneSchema, req.body);

  let name = data.name ?? "";
  let verifiedAt: Date | null = null;

  // Pelo CEP: o nome vem do ViaCEP, então o bairro já nasce confirmado.
  // "not_served" é justamente o bairro que ainda não está na lista: esse pode cadastrar.
  if (data.cep) {
    const quote = await quoteDelivery(data.cep);
    if (!quote.ok && quote.reason !== "not_served") {
      const problem = deliveryProblem(quote);
      throw new AppError(problem.status, problem.message);
    }
    name = quote.address?.neighborhood ?? "";
    if (!name) throw new AppError(400, "Este CEP não informa o bairro. Cadastre pelo nome.");
    verifiedAt = new Date();
  } else {
    // Pelo nome: se a cidade tem lista de bairros, o nome precisa estar nela (e fica com a grafia dela)
    const list = storeNeighborhoods();
    if (list) {
      const found = findNeighborhood(list, name);
      if (!found) {
        throw new AppError(
          400,
          "Bairro não encontrado na lista da cidade. Confira o nome ou teste o CEP de uma rua do bairro.",
        );
      }
      name = found;
    }
  }

  const zone = await prisma.deliveryZone
    .create({ data: { name, key: normalizeText(name), fee: data.fee, verifiedAt } })
    .catch(rethrowDuplicate);
  res.status(201).json(zone);
});

// PATCH /delivery-zones/:id: edita a taxa ou ativa/desativa (o nome não muda)
deliveryRouter.patch("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const data = validate(updateZoneSchema, req.body);

  const exists = await prisma.deliveryZone.findUnique({ where: { id } });
  if (!exists) throw new AppError(404, "Bairro não encontrado");

  res.json(await prisma.deliveryZone.update({ where: { id }, data }));
});

// DELETE /delivery-zones/:id: exclui um bairro (os pedidos antigos guardam o endereço e a taxa)
deliveryRouter.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const zone = await prisma.deliveryZone.findUnique({ where: { id } });
  if (!zone) throw new AppError(404, "Bairro não encontrado");

  await prisma.deliveryZone.delete({ where: { id } });
  res.status(204).end();
});
