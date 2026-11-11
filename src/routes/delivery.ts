import { Router } from "express";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { normalizeText } from "../lib/text";
import { parseId, validate } from "../lib/validate";
import { updateZoneSchema, zoneSchema } from "../schemas/delivery";

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

// POST /delivery-zones: cadastra um bairro
deliveryRouter.post("/", async (req, res) => {
  const { name, fee } = validate(zoneSchema, req.body);
  const zone = await prisma.deliveryZone
    .create({ data: { name, key: normalizeText(name), fee } })
    .catch(rethrowDuplicate);
  res.status(201).json(zone);
});

// PATCH /delivery-zones/:id: edita nome, taxa ou ativa/desativa
deliveryRouter.patch("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const data = validate(updateZoneSchema, req.body);

  const exists = await prisma.deliveryZone.findUnique({ where: { id } });
  if (!exists) throw new AppError(404, "Bairro não encontrado");

  const zone = await prisma.deliveryZone
    .update({
      where: { id },
      data: { ...data, ...(data.name ? { key: normalizeText(data.name) } : {}) },
    })
    .catch(rethrowDuplicate);
  res.json(zone);
});
