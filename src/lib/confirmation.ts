import { normalizeText } from "./text";

const CONFIRMACOES = new Set([
  "sim", "s", "ss", "sim sim", "isso", "isso mesmo", "certo", "ta certo", "esta certo",
  "tudo certo", "ok", "okay", "pode", "pode mandar", "pode fechar", "pode confirmar",
  "confirmo", "confirma", "confirmado", "fechado", "manda", "sim pode mandar",
  "sim por favor", "sim pode", "pode sim", "correto", "perfeito",
]);

// Só a mensagem inteira conta: "sim, mas sem cebola" vai para a IA
export function isPlainConfirmation(text: string) {
  if (/^\s*(👍|✅)+\s*$/u.test(text)) return true;
  const limpo = normalizeText(text)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return CONFIRMACOES.has(limpo);
}
