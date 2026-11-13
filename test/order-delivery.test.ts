import { describe, expect, it } from "vitest";
import { Prisma } from "../src/generated/prisma/client";
import { orderTotal } from "../src/services/orders";
import { formatAddress } from "../src/services/delivery";
import { houseNumberSchema } from "../src/schemas/order";

const d = (value: number) => new Prisma.Decimal(value);

describe("orderTotal", () => {
  const items = [
    { unitPrice: d(27.5), quantity: 2 },
    { unitPrice: d(6), quantity: 1 },
  ];

  it("soma os itens sem taxa", () => {
    expect(orderTotal(items).toFixed(2)).toBe("61.00");
  });

  it("soma a taxa de entrega", () => {
    expect(orderTotal(items, d(8)).toFixed(2)).toBe("69.00");
  });

  it("sem itens, o total é só a taxa", () => {
    expect(orderTotal([], d(5)).toFixed(2)).toBe("5.00");
  });
});

describe("formatAddress", () => {
  const base = { street: "Rua Elza Morbini", number: "506", neighborhood: "Villa Nova 2", city: "Bento Gonçalves", state: "RS" };

  it("monta o endereço completo", () => {
    expect(formatAddress(base)).toBe("Rua Elza Morbini, 506 - Villa Nova 2, Bento Gonçalves/RS");
  });

  it("inclui complemento e referência", () => {
    expect(formatAddress({ ...base, complement: "casa dos fundos", reference: "portão azul" })).toBe(
      "Rua Elza Morbini, 506 - Villa Nova 2, Bento Gonçalves/RS (casa dos fundos) · Ref.: portão azul",
    );
  });
});

describe("houseNumberSchema", () => {
  it.each(["506", "506A", "s/n", "sem número", 506])("aceita %s", (value) => {
    expect(houseNumberSchema.safeParse(value).success).toBe(true);
  });

  it.each(["", "blablabla", "Villa Nova 2"])("recusa %s", (value) => {
    expect(houseNumberSchema.safeParse(value).success).toBe(false);
  });
});
