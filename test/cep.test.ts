import { describe, expect, it, vi } from "vitest";
import { lookupCep, normalizeCep } from "../src/lib/cep";
import { normalizeText } from "../src/lib/text";

// Simula a resposta do ViaCEP, sem acessar a internet
function fakeFetch(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

describe("normalizeCep", () => {
  it("aceita CEP com ou sem traço", () => {
    expect(normalizeCep("95700-000")).toBe("95700000");
    expect(normalizeCep("95700000")).toBe("95700000");
  });

  it("recusa o que não tem 8 dígitos", () => {
    expect(normalizeCep("123")).toBeNull();
    expect(normalizeCep("blablabla")).toBeNull();
  });
});

describe("lookupCep", () => {
  it("devolve o endereço quando o CEP existe", async () => {
    const fetchImpl = fakeFetch({
      cep: "95700-000",
      logradouro: "Rua Exemplo",
      bairro: "Centro",
      localidade: "Bento Gonçalves",
      uf: "RS",
    });

    expect(await lookupCep("95700-000", fetchImpl)).toEqual({
      cep: "95700000",
      street: "Rua Exemplo",
      neighborhood: "Centro",
      city: "Bento Gonçalves",
      state: "RS",
    });
  });

  it("devolve null quando o CEP não existe", async () => {
    expect(await lookupCep("99999999", fakeFetch({ erro: true }))).toBeNull();
  });

  it("não chama o ViaCEP quando o CEP é inválido", async () => {
    const fetchImpl = fakeFetch({});
    expect(await lookupCep("123", fetchImpl)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("lança erro quando o ViaCEP está fora do ar", async () => {
    await expect(lookupCep("95700000", fakeFetch({}, 500))).rejects.toThrow();
  });
});

describe("normalizeText", () => {
  it("ignora acentos, maiúsculas e espaços extras", () => {
    expect(normalizeText("  São   Bento ")).toBe("sao bento");
  });
});
