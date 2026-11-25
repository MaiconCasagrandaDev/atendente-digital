import { describe, expect, it } from "vitest";
import { cashLine } from "../src/services/receipt";

// O money() usa o espaço especial do pt-BR depois do "R$"; aqui comparamos com espaço comum
const linha = (total: number, changeFor: number | null) => cashLine(total, changeFor).replace(/ /g, " ");

describe("cashLine", () => {
  it("com troco: mostra quanto o entregador precisa levar", () => {
    expect(linha(66.5, 100)).toBe("Dinheiro (troco para R$ 100,00 · levar R$ 33,50 de troco)");
  });

  it("sem troco informado: valor exato", () => {
    expect(linha(66.5, null)).toBe("Dinheiro (sem troco, valor exato)");
  });

  it("troco igual ao total: valor exato", () => {
    expect(linha(66.5, 66.5)).toBe("Dinheiro (sem troco, valor exato)");
  });
});
