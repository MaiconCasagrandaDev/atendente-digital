export type CepAddress = {
  cep: string;
  street: string;       // pode vir vazio em cidades com CEP único
  neighborhood: string; // pode vir vazio em cidades com CEP único
  city: string;
  state: string;
};

// "95700-000" -> "95700000"; qualquer coisa que não tenha 8 dígitos -> null
export function normalizeCep(input: string) {
  const digits = input.replace(/\D/g, "");
  return digits.length === 8 ? digits : null;
}

// null = CEP inválido ou inexistente; erro = ViaCEP fora do ar ou lento
export async function lookupCep(input: string, fetchImpl: typeof fetch = fetch): Promise<CepAddress | null> {
  const cep = normalizeCep(input);
  if (!cep) return null;

  const response = await fetchImpl(`https://viacep.com.br/ws/${cep}/json/`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`ViaCEP respondeu ${response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  if (data.erro) return null;

  return {
    cep,
    street: String(data.logradouro ?? ""),
    neighborhood: String(data.bairro ?? ""),
    city: String(data.localidade ?? ""),
    state: String(data.uf ?? ""),
  };
}

export type StreetResult = {
  cep: string;
  street: string;
  complement: string; // ex.: "de 1001/1002 a 2000/2001" em ruas longas
  neighborhood: string;
  city: string;
  state: string;
};

// Tira "Rua", "Av." etc. do começo: o ViaCEP busca pelo nome
function cleanStreetQuery(text: string) {
  return text
    .replace(/[\/\\?#%]/g, " ")
    .replace(/^\s*(rua|r\.|avenida|av\.?|travessa|tv\.?|estrada|rodovia|alameda)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

// [] = nenhuma rua encontrada; null = ViaCEP fora do ar ou lento
export async function lookupStreet(
  street: string,
  city: string,
  state: string,
  fetchImpl: typeof fetch = fetch,
): Promise<StreetResult[] | null> {
  const query = cleanStreetQuery(street);
  if (query.length < 3) return [];

  const url = `https://viacep.com.br/ws/${encodeURIComponent(state)}/${encodeURIComponent(city)}/${encodeURIComponent(query)}/json/`;
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;

    const data: unknown = await response.json();
    if (!Array.isArray(data)) return null;

    return (data as Record<string, unknown>[]).map((d) => ({
      cep: normalizeCep(String(d.cep ?? "")) ?? "",
      street: String(d.logradouro ?? ""),
      complement: String(d.complemento ?? ""),
      neighborhood: String(d.bairro ?? ""),
      city: String(d.localidade ?? ""),
      state: String(d.uf ?? ""),
    }));
  } catch {
    return null;
  }
}
