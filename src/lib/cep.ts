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
