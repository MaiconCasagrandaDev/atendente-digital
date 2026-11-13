import { describe, expect, it } from "vitest";
import { customerMentionedNumber } from "../src/lib/address";

describe("customerMentionedNumber", () => {
  it("aceita o número que o cliente escreveu", () => {
    expect(customerMentionedNumber("meu cep é 01310-100, número 1000", "1000")).toBe(true);
    expect(customerMentionedNumber("casa 506A", "506A")).toBe(true);
  });

  it("bloqueia número que o cliente não escreveu", () => {
    expect(customerMentionedNumber("meu cep é 01310-100", "1000")).toBe(false);
  });

  it("não confunde parte do CEP com o número da casa", () => {
    expect(customerMentionedNumber("95706-114", "114")).toBe(false);
    expect(customerMentionedNumber("95706114", "114")).toBe(false);
  });

  it("aceita 'sem número' só quando o cliente disse", () => {
    expect(customerMentionedNumber("95706-114, sem número", "s/n")).toBe(true);
    expect(customerMentionedNumber("é s/n", "s/n")).toBe(true);
    expect(customerMentionedNumber("95706-114", "s/n")).toBe(false);
  });

  it("não aceita número que só aparece dentro de outro", () => {
    expect(customerMentionedNumber("número 1500", "500")).toBe(false);
  });
});
