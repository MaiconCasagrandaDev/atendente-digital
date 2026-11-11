import { describe, expect, it } from "vitest";
import { Prisma } from "../src/generated/prisma/client";
import { feeFor, sameCity } from "../src/services/delivery";

const d = (value: number) => new Prisma.Decimal(value);
const zones = [
  { name: "Centro", key: "centro", fee: d(5), active: true },
  { name: "São Bento", key: "sao bento", fee: d(6), active: true },
  { name: "Fechado", key: "fechado", fee: d(9), active: false },
];

describe("feeFor", () => {
  it("acha o bairro ignorando acento e maiúsculas", () => {
    expect(feeFor(zones, "SAO BENTO", null)).toEqual({ name: "São Bento", fee: d(6) });
  });

  it("ignora bairro desativado", () => {
    expect(feeFor(zones, "Fechado", null)).toBeNull();
  });

  it("usa a taxa padrão para bairro fora da lista", () => {
    expect(feeFor(zones, "Planalto", d(8))).toEqual({ name: "Planalto", fee: d(8) });
  });

  it("sem taxa padrão, bairro fora da lista não é atendido", () => {
    expect(feeFor(zones, "Planalto", null)).toBeNull();
  });
});

describe("sameCity", () => {
  const address = { cep: "95700000", street: "", neighborhood: "", city: "Bento Gonçalves", state: "RS" };

  it("aceita a cidade da loja, sem ligar para acento", () => {
    expect(sameCity(address, "bento goncalves", "rs")).toBe(true);
  });

  it("recusa outra cidade", () => {
    expect(sameCity(address, "Garibaldi", "RS")).toBe(false);
  });

  it("com cidade vazia, aceita qualquer uma", () => {
    expect(sameCity(address, "", "")).toBe(true);
  });
});
