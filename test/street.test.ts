import { describe, expect, it, vi } from "vitest";
import { lookupStreet } from "../src/lib/cep";

// Simula a resposta do ViaCEP, sem acessar a internet
function fakeFetch(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

const viaCepStreet = {
  cep: "95700-000",
  logradouro: "Rua Marechal Deodoro",
  complemento: "de 1001/1002 a 2000/2001",
  bairro: "Centro",
  localidade: "Bento Gonçalves",
  uf: "RS",
};

describe("lookupStreet", () => {
  it("devolve as ruas encontradas com os campos mapeados", async () => {
    const results = await lookupStreet("Marechal Deodoro", "Bento Gonçalves", "RS", fakeFetch([viaCepStreet]));

    expect(results).toEqual([
      {
        cep: "95700000",
        street: "Rua Marechal Deodoro",
        complement: "de 1001/1002 a 2000/2001",
        neighborhood: "Centro",
        city: "Bento Gonçalves",
        state: "RS",
      },
    ]);
  });

  it('tira o "Rua" do começo antes de buscar', async () => {
    const fetchImpl = fakeFetch([]);
    await lookupStreet("Rua Marechal Deodoro", "Bento Gonçalves", "RS", fetchImpl);

    const url = String(vi.mocked(fetchImpl).mock.calls[0][0]);
    expect(url).toBe("https://viacep.com.br/ws/RS/Bento%20Gon%C3%A7alves/Marechal%20Deodoro/json/");
  });

  it("devolve [] sem chamar o ViaCEP quando tem menos de 3 letras", async () => {
    const fetchImpl = fakeFetch([]);
    expect(await lookupStreet("ab", "Bento Gonçalves", "RS", fetchImpl)).toEqual([]);
    expect(await lookupStreet("Rua x", "Bento Gonçalves", "RS", fetchImpl)).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("devolve null quando a resposta não é uma lista", async () => {
    expect(await lookupStreet("Marechal", "Bento Gonçalves", "RS", fakeFetch({ erro: true }))).toBeNull();
  });

  it("devolve null quando o ViaCEP responde com erro", async () => {
    expect(await lookupStreet("Marechal", "Bento Gonçalves", "RS", fakeFetch([], 400))).toBeNull();
  });

  it("devolve null quando o fetch falha", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("sem internet");
    }) as unknown as typeof fetch;
    expect(await lookupStreet("Marechal", "Bento Gonçalves", "RS", fetchImpl)).toBeNull();
  });

  it("devolve todos os resultados, sem cortar", async () => {
    const many = Array.from({ length: 30 }, () => viaCepStreet);
    const results = await lookupStreet("Marechal", "Bento Gonçalves", "RS", fakeFetch(many));
    expect(results).toHaveLength(30);
  });
});
