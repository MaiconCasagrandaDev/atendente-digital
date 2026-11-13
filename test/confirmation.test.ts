import { describe, expect, it } from "vitest";
import { isPlainConfirmation } from "../src/lib/confirmation";

describe("isPlainConfirmation", () => {
  it.each(["sim", "Sim!", "pode mandar", "tá certo", "👍", "  SIM  ", "Isso mesmo.", "✅✅"])("aceita %j", (text) => {
    expect(isPlainConfirmation(text)).toBe(true);
  });

  it.each(["sim, mas sem cebola", "sim, tira a coca", "não", "simples", "", "sim 👍 mas troca a coca"])(
    "recusa %j",
    (text) => {
      expect(isPlainConfirmation(text)).toBe(false);
    },
  );
});
