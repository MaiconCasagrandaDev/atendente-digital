// O cliente escreveu esse número da casa (ou "sem número") nas mensagens dele?
// Os CEPs são tirados do texto antes, para "95706-114" não contar como o número 114.
export function customerMentionedNumber(customerText: string, houseNumber: string) {
  const text = customerText.replace(/\b\d{5}-?\d{3}\b/g, " ");
  const isNoNumber = /^(s\/?n|sem n[uú]mero)$/i.test(houseNumber.trim());

  if (isNoNumber) return /\bs\/?n\b|sem n[uú]mero/i.test(text);

  const escaped = houseNumber.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}
