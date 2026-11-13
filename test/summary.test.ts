import { describe, expect, it } from "vitest";
import { formatOrderSummary, type SummaryOrder } from "../src/services/summary";

// O money() usa o espaço especial do pt-BR depois do "R$"; aqui comparamos com espaço comum
const resumo = (order: SummaryOrder) => formatOrderSummary(order).replace(/ /g, " ");

const base: SummaryOrder = {
  items: [
    { quantity: 2, unitPrice: "27.50", notes: null, product: { name: "X-Burguer" } },
    { quantity: 1, unitPrice: "6.00", notes: null, product: { name: "Coca-Cola lata" } },
  ],
  deliveryType: "DELIVERY",
  address: "Rua Marechal Deodoro, 506 - Centro, Bento Gonçalves/RS (apto 3)",
  deliveryFee: "5.00",
  total: "66.00",
  paymentMethod: "PIX",
  changeFor: null,
  notes: null,
};

describe("formatOrderSummary", () => {
  it("entrega + Pix: mostra a taxa, o endereço e o subtotal sem a taxa", () => {
    expect(resumo(base)).toBe(
      [
        "🛍️ *Seu pedido*",
        "➤ 2x X-Burguer — R$ 55,00",
        "➤ 1x Coca-Cola lata — R$ 6,00",
        "",
        "Subtotal: R$ 61,00",
        "Taxa de entrega: R$ 5,00",
        "📍 Endereço: Rua Marechal Deodoro, 506 - Centro, Bento Gonçalves/RS (apto 3)",
        "💳 Pagamento: Pix",
        "*Total: R$ 66,00*",
        "",
        "Está tudo certo com o pedido?",
      ].join("\n"),
    );
  });

  it("retirada + dinheiro com troco: sem a linha da taxa", () => {
    const texto = resumo({
      ...base,
      deliveryType: "PICKUP",
      address: null,
      deliveryFee: 0,
      total: "61.00",
      paymentMethod: "CASH",
      changeFor: "100",
    });
    expect(texto).toContain("Subtotal: R$ 61,00");
    expect(texto).toContain("🏪 Retirada no balcão");
    expect(texto).toContain("💳 Pagamento: Dinheiro (troco para R$ 100,00)");
    expect(texto).toContain("*Total: R$ 61,00*");
    expect(texto).not.toContain("Taxa de entrega");
    expect(texto).not.toContain("Endereço");
  });

  it("mostra a observação do item e a do pedido", () => {
    const texto = resumo({
      ...base,
      items: [{ quantity: 1, unitPrice: "32.00", notes: "sem cebola", product: { name: "X-Bacon" } }],
      total: "37.00",
      notes: "tocar a campainha",
    });
    expect(texto).toContain("➤ 1x X-Bacon (sem cebola) — R$ 32,00");
    expect(texto).toContain("📝 Observação: tocar a campainha");
  });

  it("escreve o total com o ponto de milhar", () => {
    const texto = resumo({
      ...base,
      items: [{ quantity: 50, unitPrice: "24.59", notes: null, product: { name: "Anéis de cebola" } }],
      total: "1234.50",
    });
    expect(texto).toContain("➤ 50x Anéis de cebola — R$ 1.229,50");
    expect(texto).toContain("Subtotal: R$ 1.229,50");
    expect(texto).toContain("*Total: R$ 1.234,50*");
  });
});
