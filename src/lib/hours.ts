const DAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DEFAULT_TIME_ZONE = "America/Sao_Paulo";
const END_OF_DAY = 24 * 60; // "24:00", só vale como horário de fechamento

export type StoreConfig = {
  timeZone: string;
  // null = sem horário configurado (sempre aberta)
  hours: { start: number; end: number; closedDays: number[] } | null;
};

type StoreEnv = {
  STORE_TIMEZONE?: string;
  STORE_HOURS?: string;
  STORE_CLOSED_DAYS?: string;
};

export class StoreConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Configuração da loja inválida:\n${problems.map((p) => `- ${p}`).join("\n")}`);
  }
}

// "18:30" -> minutos desde a meia-noite (ou null se o formato ou a hora forem inválidos)
function parseTime(text: string, allowEndOfDay: boolean) {
  const match = text.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (allowEndOfDay && hour === 24 && minute === 0) return END_OF_DAY;
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function formatTime(minutes: number) {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

// ["domingo", "segunda", "sábado"] -> "domingo, segunda e sábado"
function joinList(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} e ${items.at(-1)}`;
}

// Lê e confere as variáveis da loja. Função pura: recebe o env, não lê o process.env
export function parseStoreConfig(env: StoreEnv): StoreConfig {
  const problems: string[] = [];

  // Fuso: o próprio Intl diz se ele existe
  const timeZone = env.STORE_TIMEZONE?.trim() || DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    problems.push(
      `STORE_TIMEZONE="${env.STORE_TIMEZONE}" não é um fuso válido. Exemplo: STORE_TIMEZONE="America/Sao_Paulo"`,
    );
  }

  // Folgas: números de 0 (domingo) a 6 (sábado), sem repetir, em ordem
  const dayTexts = (env.STORE_CLOSED_DAYS ?? "")
    .split(",")
    .map((day) => day.trim())
    .filter(Boolean);
  const invalidDays = dayTexts.filter((day) => !/^[0-6]$/.test(day));
  if (invalidDays.length) {
    problems.push(
      `STORE_CLOSED_DAYS="${env.STORE_CLOSED_DAYS}" tem dias inválidos (${invalidDays.join(", ")}). ` +
        `Use números de 0 a 6 (0=domingo ... 6=sábado), separados por vírgula. Exemplo: STORE_CLOSED_DAYS="1" para fechar às segundas`,
    );
  }
  const closedDays = [...new Set(dayTexts.filter((day) => /^[0-6]$/.test(day)).map(Number))].sort((a, b) => a - b);

  // Horário: "abre-fecha"; aceita também os traços longos (– e —), comuns ao copiar do WhatsApp
  const hoursText = (env.STORE_HOURS ?? "").trim().replace(/[–—]/g, "-");
  let hours: StoreConfig["hours"] = null;

  if (hoursText) {
    const example = `Exemplo: STORE_HOURS="18:00-23:00" (ou "00:00-24:00" para 24 horas)`;
    const parts = hoursText.split("-");
    const start = parts.length === 2 ? parseTime(parts[0]!, false) : null;
    const end = parts.length === 2 ? parseTime(parts[1]!, true) : null;

    if (start === null || end === null) {
      problems.push(
        `STORE_HOURS="${env.STORE_HOURS}" não está no formato HH:MM-HH:MM, com horas de 00:00 a 23:59. ${example}`,
      );
    } else if (start === end) {
      problems.push(
        `STORE_HOURS="${env.STORE_HOURS}" abre e fecha no mesmo horário. Para ficar aberta 24 horas, use STORE_HOURS="00:00-24:00"`,
      );
    } else {
      hours = { start, end, closedDays };
    }
  }

  if (problems.length) throw new StoreConfigError(problems);
  return { timeZone, hours };
}

let cachedConfig: StoreConfig | null = null;

// Lê o .env na primeira vez e guarda o resultado
function getStoreConfig() {
  cachedConfig ??= parseStoreConfig(process.env);
  return cachedConfig;
}

// Chamada no server.ts antes do app.listen: com a configuração errada, o servidor nem sobe
export function validateStoreConfig() {
  try {
    getStoreConfig();
  } catch (error) {
    if (!(error instanceof StoreConfigError)) throw error;
    console.error(`\n❌ ${error.message}\n\nCorrija o .env (ou as variáveis do servidor) e inicie de novo.\n`);
    process.exit(1);
  }
}

// Dia da semana e hora no fuso da loja (o servidor pode estar em outro país)
function nowInStore(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    day: WEEKDAYS.indexOf(get("weekday")),
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

export function isStoreOpen(date = new Date(), config = getStoreConfig()) {
  const { hours } = config;
  if (!hours) return true;

  const { day, minutes } = nowInStore(date, config.timeZone);
  const worksOn = (d: number) => !hours.closedDays.includes(d);

  // Turno no mesmo dia (ex.: 18:00-23:00, ou 00:00-24:00 para 24 horas)
  if (hours.start < hours.end) {
    return worksOn(day) && minutes >= hours.start && minutes < hours.end;
  }

  // Turno que passa da meia-noite (ex.: 18:00-01:00): a madrugada conta como o dia anterior
  const yesterday = (day + 6) % 7;
  return (worksOn(day) && minutes >= hours.start) || (worksOn(yesterday) && minutes < hours.end);
}

// Texto do horário, para a IA e o cardápio
export function describeHours(config = getStoreConfig()) {
  const { hours } = config;
  if (!hours) return "todos os dias, a qualquer hora";

  const closed = hours.closedDays.map((d) => DAY_NAMES[d]!);
  const days = closed.length ? `todos os dias, exceto ${joinList(closed)}` : "todos os dias";
  if (hours.start === 0 && hours.end === END_OF_DAY) return `${days}, 24 horas`;
  return `${days}, das ${formatTime(hours.start)} às ${formatTime(hours.end)}`;
}
