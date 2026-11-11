import { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { lookupCep, type CepAddress } from "../lib/cep";
import { normalizeText } from "../lib/text";

type Zone = { name: string; key: string; fee: Prisma.Decimal; active: boolean };

export type DeliveryQuote =
  | { ok: true; address: CepAddress; neighborhood: string; fee: Prisma.Decimal }
  | {
      ok: false;
      reason: "invalid_cep" | "service_unavailable" | "outside_city" | "needs_neighborhood" | "not_served";
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
