// A Meta envia celulares brasileiros sem o 9 depois do DDD
// (ex.: 555499999999). Para responder, precisamos do formato com o 9.
export function normalizeBrazilianPhone(waId: string) {
  const isBrazilWithout9 = waId.startsWith("55") && waId.length === 12;
  if (!isBrazilWithout9) return waId;

  const ddd = waId.slice(2, 4);
  const number = waId.slice(4);

  // Celulares começam com 6 a 9; fixos (2 a 5) não ganham o 9
  if (!/^[6-9]/.test(number)) return waId;

  return `55${ddd}9${number}`;
}