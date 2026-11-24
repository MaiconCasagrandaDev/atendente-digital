import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeText } from "./text";

// Listas em data/bairros/<uf>-<cidade>.json, com a grafia dos Correios (ViaCEP).
// rs-bento-goncalves.json: 46 bairros da "Lista de distritos e bairros de Bento Gonçalves" (Wikipédia),
// cada um conferido por um CEP de rua no ViaCEP em 23/11/2026. Fonte legal: Lei Municipal nº 5.212/2011.
//
// Cada arquivo é lido uma vez e fica guardado aqui.
// ATENÇÃO: depois de editar data/bairros/*.json, reinicie o servidor (no Render, faça um novo deploy).
// A lista só muda quando entra um cliente novo, então não vale a pena recarregar sozinho.
const cache = new Map<string, string[] | null>();

// "Bento Gonçalves" / "RS" -> "rs-bento-goncalves.json"
function fileName(city: string, state: string) {
  const slug = normalizeText(city).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${state.toLowerCase()}-${slug}.json`;
}

// Lista de bairros da cidade (data/bairros); null = cidade sem lista (aceita qualquer nome)
export function cityNeighborhoods(city: string, state: string): string[] | null {
  if (!city.trim() || !state.trim()) return null;

  const name = fileName(city, state);
  if (cache.has(name)) return cache.get(name)!;

  let list: string[] | null = null;
  try {
    const data: unknown = JSON.parse(readFileSync(join(process.cwd(), "data", "bairros", name), "utf8"));
    if (Array.isArray(data)) list = data.map(String);
  } catch {
    list = null;
  }
  cache.set(name, list);
  return list;
}

// Devolve o nome como está na lista ("sao bento" -> "São Bento"), ou null se não estiver
export function findNeighborhood(list: string[], typed: string) {
  const key = normalizeText(typed); // já tira acento, maiúsculas e espaços extras
  return list.find((n) => normalizeText(n) === key) ?? null;
}
