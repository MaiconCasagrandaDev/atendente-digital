import {
  GoogleGenAI,
  Type,
  type Content,
  type FunctionDeclaration,
  type GenerateContentConfig,
  type Part,
} from "@google/genai";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { parseId, validate } from "../lib/validate";
import { addItemSchema, confirmOrderSchema } from "../schemas/order";
import { addItem, confirmOrder, getOrCreateCart, removeItem } from "./orders";
import { getRecentMessages } from "./messages";

// Desiste de uma chamada que passar de 30 segundos
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: { timeout: 30_000 },
});

// Um ou mais modelos, separados por vírgula, em ordem de preferência
const MODELS = (process.env.GEMINI_MODEL ?? "gemini-3.8-flash")
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);

// Endereço público sem barra no fim, para o link não sair com "//cardapio"
const PUBLIC_URL = process.env.PUBLIC_URL?.replace(/\/+$/, "");

// Modelo reserva que respondeu por último, lembrado por alguns minutos
let preferredModel: string | undefined;
let preferredUntil = 0;
const PREFERRED_TTL_MS = 5 * 60_000; // 5 minutos

// Modelos sem cota diária, e até quando
const exhaustedUntil = new Map<string, number>();

// Se o erro for de cota diária, devolve quanto tempo esperar (em ms)
function dailyQuotaWaitMs(error: unknown): number | null {
  const message = String((error as { message?: unknown }).message ?? "");
  if (!message.includes("PerDay")) return null;
  const match = message.match(/"retryDelay":"(\d+)s"/);
  return match ? Number(match[1]) * 1000 : 60 * 60_000;
}

type GenerateParams = Omit<Parameters<typeof ai.models.generateContent>[0], "model">;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Erros passageiros: limite (429), qualquer erro do servidor do Google (5xx) ou sem resposta
function isTemporaryError(error: unknown) {
  const status = (error as { status?: number }).status;
  return status === undefined || status === 429 || status >= 500;
}

// Chama um modelo específico, com uma nova tentativa se o erro for passageiro
async function callModel(model: string, params: GenerateParams) {
  try {
    return await ai.models.generateContent({ ...params, model });
  } catch (error) {
    if (!isTemporaryError(error) || dailyQuotaWaitMs(error)) throw error;
    console.warn(`Gemini ${model} indisponível, tentando de novo...`);
    await sleep(1500);
    return ai.models.generateContent({ ...params, model });
  }
}

// Primeira chamada da resposta: procura um modelo que esteja respondendo
async function pickModelAndGenerate(params: GenerateParams) {
  const usePreferred = preferredModel !== undefined && Date.now() < preferredUntil;
  const order = usePreferred
    ? [preferredModel!, ...MODELS.filter((model) => model !== preferredModel)]
    : MODELS;
  const available = order.filter((model) => (exhaustedUntil.get(model) ?? 0) < Date.now());
  if (available.length === 0) throw new Error("Todos os modelos estão sem cota hoje");

  let lastError: unknown;
  for (const model of available) {
    try {
      const response = await callModel(model, params);
      console.log(`[IA] usando o modelo ${model}`);

      if (model === MODELS[0]) {
        // O principal respondeu: não precisa lembrar de reserva
        preferredModel = undefined;
      } else {
        preferredModel = model;
        preferredUntil = Date.now() + PREFERRED_TTL_MS;
      }

      return { model, response };
    } catch (error) {
      // Modelo indisponível para a conta (403) ou inexistente (404): pula por 24 horas
      const status = (error as { status?: number }).status;
      if (status === 403 || status === 404) {
        exhaustedUntil.set(model, Date.now() + 24 * 60 * 60_000);
        console.warn(`Gemini ${model} indisponível para esta conta (${status}), pulando por 24 horas`);
        lastError = error;
        continue;
      }

      if (!isTemporaryError(error)) throw error;
      const wait = dailyQuotaWaitMs(error);
      if (wait) {
        exhaustedUntil.set(model, Date.now() + wait);
        console.warn(`Gemini ${model} sem cota hoje, pulando até ela voltar`);
        lastError = error;
        continue;
      }
      console.warn(`Gemini ${model} fora do ar, passando para o próximo modelo`);
      lastError = error;
    }
  }
  throw lastError;
}

const SYSTEM_PROMPT = `
Você é o atendente virtual da Lanchonete do Bairro, conversando pelo WhatsApp.

Regras:
- Responda em português do Brasil, com mensagens curtas e simpáticas, como numa conversa de WhatsApp.
- Formate para WhatsApp: negrito com um asterisco (*assim*), sem títulos com #, sem tabelas e sem dois asteriscos.
- Escreva sempre os valores com duas casas decimais, como R$ 61,00.
- Use apenas os produtos e preços do cardápio que aparece no fim destas instruções. Nunca invente produto, preço, prazo ou promoção.
- Para montar o pedido, use as ferramentas. Se o cliente não deixar claro qual produto quer, pergunte antes de adicionar.
- O carrinho atual do cliente aparece no fim destas instruções. Os itens que estão nele já foram adicionados: não adicione de novo.
- Para adicionar um produto, use o id que aparece no cardápio. Nunca invente ids.
- Se a descrição do produto tiver opções (como os sabores do suco), pergunte qual o cliente quer antes de adicionar, e coloque a escolha na observação do item (ex.: "laranja").
- Faça no máximo uma ou duas perguntas por mensagem.
- Para fechar o pedido, pergunte se é entrega ou retirada, o endereço (se for entrega) e a forma de pagamento: Pix, cartão ou dinheiro. Se for dinheiro, pergunte se precisa de troco e para quanto.
- Antes de confirmar, mostre o resumo com os itens e o total e pergunte se está tudo certo. Só chame confirmar_pedido depois que o cliente concordar.
- Mesmo que o cliente já tenha passado todos os dados, sempre mostre o resumo e espere ele responder antes de chamar confirmar_pedido.
- Depois de confirmar, responda só com uma frase curta de agradecimento. O comprovante completo do pedido é enviado automaticamente pelo sistema, então não repita os itens nem o total.
- No resumo antes de confirmar, organize assim: 🛍️ *Seu pedido*, um item por linha (➤ 2x X-Burguer — R$ 55,00), depois a entrega, a forma de pagamento e o *Total* em negrito, e por fim a pergunta se está tudo certo.
- Se o cliente pedir para falar com uma pessoa, ou se você não souber responder, diga que vai chamar um atendente.
- Horário de funcionamento: todos os dias, das 18h às 23h.
`.trim();

const functionDeclarations: FunctionDeclaration[] = [
  {
    name: "ver_cardapio",
    description: "Lista os produtos disponíveis, com id, nome, descrição, preço e categoria.",
  },
  {
    name: "ver_carrinho",
    description: "Mostra o carrinho do cliente: itens (com o id de cada item), quantidades, observações e total.",
  },
  {
    name: "adicionar_item",
    description: "Adiciona um produto ao carrinho do cliente.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        productId: { type: Type.INTEGER, description: "id do produto, vindo de ver_cardapio" },
        quantity: { type: Type.INTEGER, description: "quantidade, de 1 a 50" },
        notes: { type: Type.STRING, description: "observação, como 'sem cebola'" },
      },
      required: ["productId", "quantity"],
    },
  },
  {
    name: "remover_item",
    description: "Remove um item do carrinho, pelo id do item (não do produto).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        itemId: { type: Type.INTEGER, description: "id do item, vindo de ver_carrinho" },
      },
      required: ["itemId"],
    },
  },
  {
    name: "confirmar_pedido",
    description: "Fecha o pedido. Só use depois que o cliente concordar com o resumo.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        deliveryType: { type: Type.STRING, enum: ["DELIVERY", "PICKUP"], description: "entrega ou retirada" },
        address: { type: Type.STRING, description: "endereço completo, obrigatório para entrega" },
        paymentMethod: { type: Type.STRING, enum: ["PIX", "CARD", "CASH"] },
        changeFor: { type: Type.NUMBER, description: "troco para quanto, só se for dinheiro" },
        notes: { type: Type.STRING, description: "observação geral do pedido" },
      },
      required: ["deliveryType", "paymentMethod"],
    },
  },
];

const config: GenerateContentConfig = {
  systemInstruction: SYSTEM_PROMPT,
  tools: [{ functionDeclarations }],
};

// Formato do carrinho que a IA recebe (texto simples, sem objetos do Prisma)
type CartLike = {
  id: number;
  status: string;
  total: { toFixed(digits: number): string };
  items: {
    id: number;
    quantity: number;
    notes: string | null;
    unitPrice: { toFixed(digits: number): string };
    product: { name: string };
  }[];
};

function summarizeCart(cart: CartLike) {
  return {
    pedido: cart.id,
    status: cart.status,
    itens: cart.items.map((item) => ({
      itemId: item.id,
      produto: item.product.name,
      quantidade: item.quantity,
      precoUnitario: item.unitPrice.toFixed(2),
      observacao: item.notes,
    })),
    total: cart.total.toFixed(2),
  };
}

// O que aconteceu durante a resposta (ex.: pedido confirmado)
type ReplyContext = { confirmedOrderId?: number };

// Executa a ferramenta que a IA pediu, usando os services que já existem
async function runTool(name: string, args: Record<string, unknown>, phone: string, context: ReplyContext) {
  try {
    switch (name) {
      case "ver_cardapio": {
        const products = await prisma.product.findMany({
          where: { available: true },
          orderBy: [{ category: "asc" }, { name: "asc" }],
        });
        return {
          produtos: products.map((p) => ({
            id: p.id,
            nome: p.name,
            descricao: p.description,
            preco: p.price.toFixed(2),
            categoria: p.category,
          })),
        };
      }

      case "ver_carrinho":
        return summarizeCart(await getOrCreateCart(phone));

      case "adicionar_item": {
        const { productId, quantity, notes } = validate(addItemSchema, args);
        const cart = await getOrCreateCart(phone);
        return summarizeCart(await addItem(cart.id, productId, quantity, notes));
      }

      case "remover_item": {
        const itemId = parseId(String(args.itemId));
        const cart = await getOrCreateCart(phone);
        return summarizeCart(await removeItem(cart.id, itemId));
      }

      case "confirmar_pedido": {
        const data = validate(confirmOrderSchema, args);
        const cart = await getOrCreateCart(phone);

        // Trava: a última mensagem do bot precisa ter mostrado o total atual do carrinho
        const lastBotMessage = await prisma.message.findFirst({
          where: { customer: { phone }, direction: "OUTBOUND" },
          orderBy: { createdAt: "desc" },
        });
        const totalText = cart.total.toFixed(2).replace(".", ",");
        const totalWithThousands = Number(cart.total).toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

        if (![totalText, totalWithThousands].some((t) => lastBotMessage?.text.includes(t))) {
          return {
            erro: `Ainda não confirme. Mostre ao cliente o resumo com os itens e o total (R$ ${totalText}) e espere ele concordar.`,
          };
        }

        const order = await confirmOrder(cart.id, data);
        context.confirmedOrderId = order.id;
        return { confirmado: true, ...summarizeCart(order) };
      }

      default:
        return { erro: `Ferramenta desconhecida: ${name}` };
    }
  } catch (error) {
    // Erros de regra de negócio voltam para a IA explicar ao cliente
    if (error instanceof AppError) {
      return { erro: error.message, detalhes: error.details ?? null };
    }
    throw error;
  }
}

export async function generateReply(customerId: number, phone: string) {
  const context: ReplyContext = {};

  // Histórico da conversa: cliente = "user", bot = "model"
  const history = await getRecentMessages(customerId);
  const contents: Content[] = history.map((message) => ({
    role: message.direction === "INBOUND" ? "user" : "model",
    parts: [{ text: message.text }],
  }));

  // A conversa enviada para a IA precisa começar por uma mensagem do cliente
  while (contents[0]?.role === "model") contents.shift();

  // Mostra à IA o cardápio e o carrinho como estão agora no banco
  const products = await prisma.product.findMany({
    where: { available: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  const menu = products
    .map((p) => {
      const price = p.price.toFixed(2).replace(".", ",");
      const description = p.description ? ` - ${p.description}` : "";
      return `- id ${p.id}: ${p.name} (${p.category}) - R$ ${price}${description}`;
    })
    .join("\n");

  const cart = await getOrCreateCart(phone);

  const replyConfig: GenerateContentConfig = {
    ...config,
    systemInstruction: [
      SYSTEM_PROMPT,
      PUBLIC_URL
        ? `Link do cardápio com fotos: ${PUBLIC_URL}/cardapio. Envie esse link quando o cliente quiser ver as opções ou estiver indeciso.`
        : "",
      `Cardápio atual:\n${menu}`,
      `Carrinho atual do cliente (já salvo no sistema): ${JSON.stringify(summarizeCart(cart))}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };

  // Escolhido na primeira chamada e mantido até o fim desta resposta
  let model: string | undefined;

  // A IA pode chamar várias ferramentas antes de responder; limitamos as voltas
  for (let step = 0; step < 6; step++) {
    const result = model
      ? { model, response: await callModel(model, { contents, config: replyConfig }) }
      : await pickModelAndGenerate({ contents, config: replyConfig });

    model = result.model;
    const response = result.response;
    const calls = response.functionCalls ?? [];

    if (calls.length === 0) {
      return {
        text: response.text?.trim() || "Desculpe, não entendi. Pode repetir?",
        confirmedOrderId: context.confirmedOrderId,
      };
    }

    // Devolve a resposta da IA inteira ao histórico (ela carrega dados internos do modelo)
    const modelContent = response.candidates?.[0]?.content;
    if (modelContent) contents.push(modelContent);

    const parts: Part[] = [];
    for (const call of calls) {
      const toolResult = await runTool(call.name ?? "", call.args ?? {}, phone, context);
      console.log(`[IA] ${call.name}`, call.args ?? {}, "->", JSON.stringify(toolResult));
      parts.push({ functionResponse: { id: call.id, name: call.name, response: toolResult } });
    }
    contents.push({ role: "user", parts });
  }

  return {
    text: "Desculpe, me enrolei aqui. Pode repetir o seu pedido?",
    confirmedOrderId: context.confirmedOrderId,
  };
}
