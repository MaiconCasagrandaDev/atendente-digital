import { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { lookupCep, normalizeCep, type CepAddress } from "../lib/cep";
import { normalizeText } from "../lib/text";

type Zone = { name: string; key: string; fee: Prisma.Decimal; active: boolean };

export type DeliveryQuote =
  | { ok: true; address: CepAddress; neighborhood: string; fee: Prisma.Decimal }
  | {
      ok: false;
      reason: "malformed_cep" | "invalid_cep" | "service_unavailable" | "outside_city" | "needs_neighborhood" | "not_served";
      address?: CepAddress;
    };

// O CEP é da cidade (e do estado) da loja? Vazios = qualquer lugar
export function sameCity(address: CepAddress, city?: string, state?: string) {
  if (city?.trim() && normalizeText(address.city) !== normalizeText(city)) return false;
  if (state?.trim() && normalizeText(address.state) !== normalizeText(state)) return false;
  return true;
}

// Taxa do bairro; se não estiver na lista, usa a taxa padrão (ou null = não entrega)
export function feeFor(zones: Zone[], neighborhood: string, defaultFee: Prisma.Decimal | null) {
  const zone = zones.find((z) => z.active && z.key === normalizeText(neighborhood));
  if (zone) return { name: zone.name, fee: zone.fee };
  if (defaultFee) return { name: neighborhood.trim(), fee: defaultFee };
  return null;
}

function defaultFee() {
  const raw = process.env.DELIVERY_DEFAULT_FEE?.trim().replace(",", ".");
  return raw ? new Prisma.Decimal(raw) : null;
}

// Endereço + taxa a partir do CEP. O bairro digitado só é usado
// quando o CEP é geral da cidade e o ViaCEP não informa o bairro.
export async function quoteDelivery(cep: string, typedNeighborhood?: string): Promise<DeliveryQuote> {
  if (!normalizeCep(cep)) return { ok: false, reason: "malformed_cep" };

  let address: CepAddress | null;
  try {
    address = await lookupCep(cep);
  } catch {
    return { ok: false, reason: "service_unavailable" };
  }
  if (!address) return { ok: false, reason: "invalid_cep" };

  if (!sameCity(address, process.env.STORE_CITY, process.env.STORE_STATE)) {
    return { ok: false, reason: "outside_city", address };
  }

  const neighborhood = address.neighborhood || typedNeighborhood?.trim() || "";
  if (!neighborhood) return { ok: false, reason: "needs_neighborhood", address };

  const zones = await prisma.deliveryZone.findMany({ where: { active: true } });
  const match = feeFor(zones, neighborhood, defaultFee());
  if (!match) return { ok: false, reason: "not_served", address };

  return { ok: true, address, neighborhood: match.name, fee: match.fee };
}

// Endereço completo para o pedido, o comprovante e o painel
export function formatAddress(parts: {
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  complement?: string;
  reference?: string;
}) {
  let text = `${parts.street}, ${parts.number} - ${parts.neighborhood}, ${parts.city}/${parts.state}`;
  if (parts.complement) text += ` (${parts.complement})`;
  if (parts.reference) text += ` · Ref.: ${parts.reference}`;
  return text;
}

// Motivo de não entregar, em texto para o cliente
export function deliveryProblem(quote: Extract<DeliveryQuote, { ok: false }>) {
  switch (quote.reason) {
    case "malformed_cep":
      return { status: 400, message: "CEP inválido: ele precisa ter 8 números, como 95700-000." };
    case "invalid_cep":
      return { status: 400, message: "CEP não encontrado. Confira os números do CEP." };
    case "service_unavailable":
      return { status: 503, message: "Não foi possível consultar o CEP agora. Tente de novo em instantes." };
    case "outside_city":
      return {
        status: 422,
        message: `Não entregamos em ${quote.address?.city}/${quote.address?.state}. Que tal retirar no balcão?`,
      };
    case "needs_neighborhood":
      return { status: 400, message: "Este CEP é da cidade toda. Informe também o bairro e a rua." };
    case "not_served":
      return {
        status: 422,
        message: `Ainda não entregamos no bairro ${quote.address?.neighborhood}. Que tal retirar no balcão?`,
      };
  }
}
