import { describe, expect, it, vi } from "vitest";
import { fallbackTerms, searchStreet, streetScore } from "../src/lib/street-search";

const CITY = "Bento Gonçalves";
const STATE = "RS";

function viaCep(logradouro: string, cep: string) {
  return { cep, logradouro, complemento: "", bairro: "Centro", localidade: CITY, uf: STATE };
}

// Responde conforme o termo buscado (último pedaço da URL antes de /json/)
function fakeFetchByTerm(byTerm: Record<string, unknown[]>, status = 200) {
  return vi.fn(async (url: string) => {
    const term = decodeURIComponent(url.split("/").at(-3) ?? "");
    return new Response(JSON.stringify(byTerm[term] ?? []), { status });
  }) as unknown as typeof fetch;
}

describe("streetScore", () => {
  it("dá nota alta para o nome com uma letra trocada", () => {
    expect(streetScore("elza morbini", "Rua Elza Norbini")).toBeGreaterThanOrEqual(0.9);
  });

  it("dá nota boa para só o sobrenome parecido", () => {
    expect(streetScore("morbini", "Rua Elza Norbini")).toBeGreaterThanOrEqual(0.75);
  });

  it("dá nota baixa para uma rua diferente", () => {
    expect(streetScore("marechal deodoro", "Rua Elza Norbini")).toBeLessThan(0.5);
  });
});

describe("fallbackTerms", () => {
  it('tira o "Rua", mantém palavras curtas e divide as longas ao meio', () => {
    expect(fallbackTerms("Rua Elza Morbini")).toEqual(["elza", "morb", "ini"]);
  });
});

describe("searchStreet", () => {
  it("sem resultado exato, busca por pedaços e fica só com as ruas parecidas", async () => {
    const fetchImpl = fakeFetchByTerm({
      "Elza Morbini": [],
      ini: [
        viaCep("Rua Marini", "95700001"),
        viaCep("Rua Elza Norbini", "95700002"),
        viaCep("Rua Bellini", "95700003"),
        viaCep("Avenida Planalto Inicial", "95700004"),
      ],
    });

    const busca = await searchStreet("Rua Elza Morbini", CITY, STATE, fetchImpl);

    expect(busca?.approximate).toBe(true);
    expect(busca?.results.map((r) => r.street)).toEqual(["Rua Elza Norbini"]);
  });

  it("com resultado exato, não faz buscas extras", async () => {
    const fetchImpl = fakeFetchByTerm({ "Marechal Deodoro": [viaCep("Rua Marechal Deodoro", "95700010")] });

    const busca = await searchStreet("Rua Marechal Deodoro", CITY, STATE, fetchImpl);

    expect(busca).toEqual({
      results: [expect.objectContaining({ street: "Rua Marechal Deodoro", cep: "95700010" })],
      approximate: false,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("corta em 20 resultados", async () => {
    const many = Array.from({ length: 30 }, (_, i) => viaCep("Rua Marechal Deodoro", String(95700100 + i)));
    const busca = await searchStreet("Marechal Deodoro", CITY, STATE, fakeFetchByTerm({ "Marechal Deodoro": many }));
    expect(busca?.results).toHaveLength(20);
  });

  it("devolve null quando o ViaCEP está fora do ar", async () => {
    expect(await searchStreet("Elza Morbini", CITY, STATE, fakeFetchByTerm({}, 500))).toBeNull();
  });
});
