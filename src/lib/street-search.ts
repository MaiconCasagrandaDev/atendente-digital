import { lookupStreet, type StreetResult } from "./cep";
import { normalizeText } from "./text";

const TIPOS = /^(rua|r|avenida|av|travessa|tv|estrada|rodovia|alameda)$/;
const LIGACOES = new Set(["da", "de", "do", "das", "dos", "e"]);

function palavras(texto: string) {
  return normalizeText(texto)
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter((p, i) => p && !LIGACOES.has(p) && !(i === 0 && TIPOS.test(p)));
}

function levenshtein(a: string, b: string) {
  // Os índices ficam sempre dentro do array (por isso os "!")
  const linha = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = linha[0]!;
    linha[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const acima = linha[j]!;
      linha[j] = Math.min(acima + 1, linha[j - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = acima;
    }
  }
  return linha[b.length]!;
}

function semelhancaPalavra(a: string, b: string) {
  const maior = Math.max(a.length, b.length);
  return maior === 0 ? 1 : 1 - levenshtein(a, b) / maior;
}

// 0 a 1: para cada palavra digitada, a mais parecida no nome da rua
export function streetScore(query: string, streetName: string) {
  const q = palavras(query);
  const rua = palavras(streetName);
  if (q.length === 0 || rua.length === 0) return 0;
  const soma = q.reduce((total, p) => total + Math.max(...rua.map((r) => semelhancaPalavra(p, r))), 0);
  return soma / q.length;
}

// Pedaços para a segunda busca: palavras curtas inteiras, longas divididas ao meio
export function fallbackTerms(query: string) {
  const termos = new Set<string>();
  for (const p of palavras(query)) {
    if (p.length >= 6) {
      const meio = Math.ceil(p.length / 2);
      termos.add(p.slice(0, meio));
      termos.add(p.slice(meio));
    } else if (p.length >= 3) {
      termos.add(p);
    }
  }
  return [...termos].filter((t) => t.length >= 3).slice(0, 4);
}

export type StreetSearch = { results: StreetResult[]; approximate: boolean };

// Busca exata primeiro; se não achar nada, busca por pedaços do nome e fica com as ruas parecidas
// null = ViaCEP fora do ar
export async function searchStreet(
  query: string,
  city: string,
  state: string,
  fetchImpl: typeof fetch = fetch,
): Promise<StreetSearch | null> {
  const exata = await lookupStreet(query, city, state, fetchImpl);
  if (exata === null) return null;
  if (exata.length > 0) return { results: exata.slice(0, 20), approximate: false };

  const listas = await Promise.all(fallbackTerms(query).map((t) => lookupStreet(t, city, state, fetchImpl)));
  if (listas.length > 0 && listas.every((l) => l === null)) return null;

  const porCep = new Map<string, StreetResult>();
  for (const lista of listas) for (const r of lista ?? []) porCep.set(r.cep, r);

  const results = [...porCep.values()]
    .map((r) => ({ r, nota: streetScore(query, r.street) }))
    .filter((x) => x.nota >= 0.75)
    .sort((a, b) => b.nota - a.nota)
    .slice(0, 8)
    .map((x) => x.r);

  return { results, approximate: true };
}
