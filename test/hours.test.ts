import { describe, expect, it } from "vitest";
import { businessDate, describeHours, isStoreOpen, parseStoreConfig, StoreConfigError } from "../src/lib/hours";

// Horário de Brasília (UTC-3, sem horário de verão). 06/11/2026 é uma sexta-feira.
const sp = (dateTime: string) => new Date(`${dateTime}:00-03:00`);

const config = (hours: string, closedDays = "", timeZone = "America/Sao_Paulo") =>
  parseStoreConfig({ STORE_HOURS: hours, STORE_CLOSED_DAYS: closedDays, STORE_TIMEZONE: timeZone });

const expectInvalid = (env: Parameters<typeof parseStoreConfig>[0], message: RegExp) => {
  expect(() => parseStoreConfig(env)).toThrow(StoreConfigError);
  expect(() => parseStoreConfig(env)).toThrow(message);
};

describe("parseStoreConfig", () => {
  it("sem horário configurado, a loja fica sempre aberta", () => {
    expect(parseStoreConfig({})).toEqual({ timeZone: "America/Sao_Paulo", hours: null, deliveryDefaultFee: null });
    expect(parseStoreConfig({ STORE_HOURS: "  ", STORE_TIMEZONE: "" }).hours).toBeNull();
  });

  it("lê o horário em minutos desde a meia-noite", () => {
    expect(config("18:00-23:00").hours).toEqual({ start: 1080, end: 1380, closedDays: [] });
    expect(config("8:30-12:00").hours).toMatchObject({ start: 510, end: 720 });
  });

  it("aceita traços longos (– e —) e espaços, como ao copiar do WhatsApp", () => {
    for (const hours of ["18:00–23:00", "18:00 — 23:00", " 18:00 - 23:00 "]) {
      expect(config(hours).hours).toMatchObject({ start: 1080, end: 1380 });
    }
  });

  it("aceita 24:00 só como fechamento", () => {
    expect(config("00:00-24:00").hours).toMatchObject({ start: 0, end: 1440 });
    expectInvalid({ STORE_HOURS: "24:00-02:00" }, /STORE_HOURS/);
  });

  it.each(["18h-23h", "18:00", "18:00-23:00-01:00", "25:00-23:00", "18:60-23:00", "18:00-24:30", "abc"])(
    "recusa o horário %j, mostrando o formato certo",
    (hours) => {
      expectInvalid({ STORE_HOURS: hours }, /STORE_HOURS=.*18:00-23:00/);
    },
  );

  it("recusa abrir e fechar no mesmo horário, sugerindo 00:00-24:00", () => {
    expectInvalid({ STORE_HOURS: "18:00-18:00" }, /00:00-24:00/);
  });

  it("recusa fuso inexistente", () => {
    expectInvalid({ STORE_TIMEZONE: "America/SaoPaulo" }, /STORE_TIMEZONE="America\/SaoPaulo"/);
  });

  it("ordena as folgas e remove as repetidas", () => {
    expect(config("18:00-23:00", "6, 0,1,1").hours?.closedDays).toEqual([0, 1, 6]);
  });

  it.each(["seg", "7", "-1", "1.5", "1;2"])("recusa a folga %j", (closedDays) => {
    expectInvalid({ STORE_HOURS: "18:00-23:00", STORE_CLOSED_DAYS: closedDays }, /STORE_CLOSED_DAYS/);
  });

  it("lê a taxa padrão de entrega com vírgula ou ponto", () => {
    expect(parseStoreConfig({ DELIVERY_DEFAULT_FEE: "8.00" }).deliveryDefaultFee).toBe(8);
    expect(parseStoreConfig({ DELIVERY_DEFAULT_FEE: " 7,50 " }).deliveryDefaultFee).toBe(7.5);
    expect(parseStoreConfig({ DELIVERY_DEFAULT_FEE: "0" }).deliveryDefaultFee).toBe(0);
    expect(parseStoreConfig({ DELIVERY_DEFAULT_FEE: "" }).deliveryDefaultFee).toBeNull();
  });

  it.each(["-1", "abc", "R$ 8", "8,00,00", "8.", "1.000,00"])("recusa a taxa padrão %j", (fee) => {
    expectInvalid({ DELIVERY_DEFAULT_FEE: fee }, /DELIVERY_DEFAULT_FEE/);
  });

  it("junta todos os problemas numa mensagem só", () => {
    try {
      parseStoreConfig({ STORE_TIMEZONE: "Lua/Base", STORE_HOURS: "18h-23h", STORE_CLOSED_DAYS: "seg" });
      expect.unreachable();
    } catch (error) {
      expect((error as StoreConfigError).problems).toHaveLength(3);
    }
  });
});

describe("isStoreOpen", () => {
  it("sem horário, está sempre aberta", () => {
    expect(isStoreOpen(sp("2026-11-06T04:00"), parseStoreConfig({}))).toBe(true);
  });

  it("turno no mesmo dia: abre no horário e fecha no horário de fechamento", () => {
    const c = config("18:00-23:00");
    expect(isStoreOpen(sp("2026-11-06T17:59"), c)).toBe(false);
    expect(isStoreOpen(sp("2026-11-06T18:00"), c)).toBe(true);
    expect(isStoreOpen(sp("2026-11-06T22:59"), c)).toBe(true);
    expect(isStoreOpen(sp("2026-11-06T23:00"), c)).toBe(false);
  });

  it("fica fechada nos dias de folga", () => {
    const c = config("18:00-23:00", "1"); // folga na segunda
    expect(isStoreOpen(sp("2026-11-09T19:00"), c)).toBe(false); // segunda
    expect(isStoreOpen(sp("2026-11-10T19:00"), c)).toBe(true); // terça
  });

  it("turno que passa da meia-noite: a madrugada conta como o dia anterior", () => {
    const c = config("18:00-01:00", "1"); // folga na segunda
    expect(isStoreOpen(sp("2026-11-07T00:00"), c)).toBe(true); // sábado 00:00, turno de sexta
    expect(isStoreOpen(sp("2026-11-07T00:59"), c)).toBe(true);
    expect(isStoreOpen(sp("2026-11-07T01:00"), c)).toBe(false);
    expect(isStoreOpen(sp("2026-11-09T00:30"), c)).toBe(true); // segunda 00:30, turno de domingo
    expect(isStoreOpen(sp("2026-11-09T19:00"), c)).toBe(false); // segunda à noite: folga
    expect(isStoreOpen(sp("2026-11-10T00:30"), c)).toBe(false); // terça 00:30, turno de segunda (folga)
  });

  it("00:00-24:00 fica aberta o dia inteiro", () => {
    const c = config("00:00-24:00");
    expect(isStoreOpen(sp("2026-11-06T00:00"), c)).toBe(true);
    expect(isStoreOpen(sp("2026-11-06T23:59"), c)).toBe(true);
  });

  it("usa o fuso da loja, não o do servidor", () => {
    const instante = sp("2026-11-06T19:00"); // 19:00 em Brasília = 07:00 do dia seguinte em Tóquio
    expect(isStoreOpen(instante, config("18:00-23:00"))).toBe(true);
    expect(isStoreOpen(instante, config("18:00-23:00", "", "Asia/Tokyo"))).toBe(false);
  });
});

describe("businessDate", () => {
  it("num dia normal, é a data de hoje em Brasília", () => {
    expect(businessDate(sp("2026-11-06T19:00"), config("18:00-23:00"))).toBe("2026-11-06");
  });

  it("turno que passa da meia-noite: a madrugada conta como o dia anterior", () => {
    const c = config("18:00-01:00");
    expect(businessDate(sp("2026-11-07T00:30"), c)).toBe("2026-11-06");
    expect(businessDate(sp("2026-11-07T01:00"), c)).toBe("2026-11-07"); // já passou do fechamento
    expect(businessDate(sp("2026-12-01T00:30"), c)).toBe("2026-11-30"); // volta o mês também
  });

  it("turno no mesmo dia: depois da meia-noite já é o dia seguinte", () => {
    expect(businessDate(sp("2026-11-07T00:30"), config("00:00-24:00"))).toBe("2026-11-07");
  });

  it("usa o fuso da loja, não o do servidor", () => {
    // 02:00 UTC do dia 7 ainda são 23:00 do dia 6 em São Paulo
    expect(businessDate(new Date("2026-11-07T02:00:00Z"), config("18:00-23:30"))).toBe("2026-11-06");
  });
});

describe("describeHours", () => {
  it("descreve o horário", () => {
    expect(describeHours(parseStoreConfig({}))).toBe("todos os dias, a qualquer hora");
    expect(describeHours(config("18:00-23:00"))).toBe("todos os dias, das 18:00 às 23:00");
    expect(describeHours(config("00:00-24:00"))).toBe("todos os dias, 24 horas");
  });

  it("lista as folgas em ordem, com vírgula e “e”", () => {
    expect(describeHours(config("18:00-23:00", "1"))).toBe("todos os dias, exceto segunda, das 18:00 às 23:00");
    expect(describeHours(config("18:00-23:00", "1,0"))).toBe("todos os dias, exceto domingo e segunda, das 18:00 às 23:00");
    expect(describeHours(config("18:00-23:00", "6,0,1,1"))).toBe(
      "todos os dias, exceto domingo, segunda e sábado, das 18:00 às 23:00",
    );
  });
});
