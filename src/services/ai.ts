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
import { customerMentionedNumber } from "../lib/address";
import { describeHours, isStoreOpen } from "../lib/hours";
import { parseId, validate } from "../lib/validate";
import { addItemSchema, confirmOrderSchema, deliverySchema } from "../schemas/order";
import { productOptionsSchema } from "../schemas/product";
import {
  addItem,
  getOrCreateCart,
  orderLabel,
  removeItem,
  setDelivery,
  setPayment,
  setPickup,
} from "./orders";
import { confirmFromSummary, formatOrderSummary, lastMessageIsSummary } from "./summary";
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
- Se o produto tiver opções obrigatórias no cardápio (como o sabor do suco) e o cliente não escolheu, pergunte antes de adicionar. Coloque as escolhas na observação do item (ex.: "laranja" ou "sem cebola").
- Só preencha a observação de um item quando o cliente pedir alguma mudança (ex.: "sem cebola"). Nunca use "sem alteração", "normal" ou parecidos.
- Faça no máximo uma ou duas perguntas por mensagem.
- Para fechar o pedido, pergunte se é entrega ou retirada.
- Para entrega, peça o CEP e o número da casa (e, se o cliente quiser, complemento e ponto de referência) e chame definir_entrega. O sistema busca a rua, o bairro e a cidade pelo CEP. Nunca invente nem complete um endereço por conta própria.
- Se definir_entrega pedir rua e bairro (CEP geral da cidade), pergunte ao cliente e chame de novo com a rua e o bairro, copiando como ele escreveu, inclusive números (ex.: "Villa Nova 2").
- Se o cliente não souber o CEP, explique que ele é necessário para calcular a entrega, ou ofereça a retirada.
- Se definir_entrega devolver erro (CEP inválido, fora da área, bairro não atendido), explique com as palavras do erro e ofereça a retirada.
- Para retirada, chame definir_retirada.
- Quando a mensagem vier do cardápio já com os dados de entrega (CEP, número, complemento) ou de retirada, e a forma de pagamento, use esses dados direto: chame definir_entrega (ou definir_retirada) e depois mostrar_resumo, sem perguntar de novo o que o cliente já informou.
- Depois, pergunte a forma de pagamento: Pix, cartão ou dinheiro. Se for dinheiro, pergunte se precisa de troco e para quanto (o troco precisa cobrir o total com a entrega).
- Sobre troco: ele precisa ser maior ou igual ao total. Nunca sugira valores de troco que o cliente não falou.
- Para mostrar o resumo, chame mostrar_resumo com a forma de pagamento (e o troco ou a observação, se houver). Nunca escreva o resumo você mesmo.
- Depois do resumo, se o cliente confirmar ("sim", "pode mandar", "tá certo"), chame confirmar_pedido.
- Se o cliente mudar alguma coisa depois do resumo (item, endereço, pagamento), faça a mudança e chame mostrar_resumo de novo.
- Depois de confirmar, responda só com uma frase curta de agradecimento. O comprovante completo do pedido é enviado automaticamente pelo sistema, então não repita os itens nem o total.
- Se o cliente pedir para falar com uma pessoa, ou se você não souber responder, diga que vai chamar um atendente.
- Se a loja estiver fechada, avise com simpatia e diga o horário de funcionamento. Pode mostrar o cardápio e tirar dúvidas, mas não confirme pedidos.
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
    description: "Remove um item do carrinho. Use o itemId do carrinho, não o id do produto.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        itemId: { type: Type.INTEGER, description: "id do item, vindo de ver_carrinho" },
      },
      required: ["itemId"],
    },
  },
  {
    name: "definir_entrega",
    description: "Define entrega pelo CEP. O sistema busca o endereço, calcula a taxa do bairro e soma no total.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        cep: { type: Type.STRING, description: "CEP com 8 números, com ou sem traço" },
        numero: { type: Type.STRING, description: "número da casa, ou 's/n' se não tiver" },
        complemento: { type: Type.STRING, description: "apartamento, bloco, casa dos fundos..." },
        referencia: { type: Type.STRING, description: "ponto de referência, se o cliente informar" },
        rua: { type: Type.STRING, description: "só quando o sistema pedir (CEP geral da cidade)" },
        bairro: { type: Type.STRING, description: "só quando o sistema pedir (CEP geral da cidade)" },
      },
      required: ["cep", "numero"],
    },
  },
  {
    name: "definir_retirada",
    description: "Define que o cliente vai retirar no balcão. Sem endereço e sem taxa de entrega.",
  },
  {
    name: "mostrar_resumo",
    description:
      "Salva a forma de pagamento e envia ao cliente o resumo oficial do pedido. Chame depois de definir a entrega ou a retirada e de saber a forma de pagamento. O resumo vai direto ao cliente, então não escreva o resumo você mesmo.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        paymentMethod: { type: Type.STRING, enum: ["PIX", "CARD", "CASH"] },
        changeFor: { type: Type.NUMBER, description: "troco para quanto, só se for dinheiro" },
        notes: { type: Type.STRING, description: "observação geral do pedido" },
      },
      required: ["paymentMethod"],
    },
  },
  {
    name: "confirmar_pedido",
    description: "Confirma o pedido. Chame só depois que o cliente disser que o resumo está certo.",
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
  deliveryType: string;
  address: string | null;
  deliveryFee: { toFixed(digits: number): string; toNumber(): number };
  items: {
    id: number;
    productId: number;
    quantity: number;
    notes: string | null;
    unitPrice: { toFixed(digits: number): string };
    product: { name: string };
  }[];
};

function summarizeCart(cart: CartLike) {
  return {
    status: cart.status,
    itens: cart.items.map((item) => ({
      itemId: item.id,
      produtoId: item.productId,
      produto: item.product.name,
      quantidade: item.quantity,
      precoUnitario: item.unitPrice.toFixed(2),
      observacao: item.notes,
    })),
    tipoEntrega: cart.deliveryType === "PICKUP" ? "retirada" : cart.address ? "entrega" : "não definido",
    endereco: cart.address,
    subtotal: (Number(cart.total.toFixed(2)) - cart.deliveryFee.toNumber()).toFixed(2),
    taxaEntrega: cart.deliveryFee.toFixed(2),
    total: cart.total.toFixed(2),
  };
}

// Carrinho em texto para o prompt, separando o itemId (remover) do id do produto (adicionar)
function describeCart(cart: CartLike) {
  const itens = cart.items.length
    ? cart.items
        .map((item) => {
          const obs = item.notes ? ` (obs.: ${item.notes})` : "";
          return `- itemId ${item.id}: ${item.quantity}x ${item.product.name}${obs} (produto ${item.productId})`;
        })
        .join("\n")
    : "- vazio";
  const { tipoEntrega, endereco, subtotal, taxaEntrega, total } = summarizeCart(cart);
  return [
    "Itens (para remover, use o itemId; para adicionar, use o id do produto no cardápio):",
    itens,
    `Entrega: ${tipoEntrega}${endereco ? ` (${endereco})` : ""}. Subtotal R$ ${subtotal}, taxa de entrega R$ ${taxaEntrega}, total R$ ${total}.`,
  ].join("\n");
}

// O que aconteceu durante a resposta (ex.: pedido confirmado, resumo para enviar)
type ReplyContext = { confirmedOrderId?: number; summaryText?: string };

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

      case "definir_entrega": {
        const data = validate(deliverySchema, {
          cep: args.cep,
          number: args.numero,
          complement: args.complemento,
          reference: args.referencia,
          street: args.rua,
          neighborhood: args.bairro,
        });

        // Trava: o número da casa precisa ter vindo do cliente, não da IA
        const recent = await prisma.message.findMany({
          where: { customer: { phone }, direction: "INBOUND" },
          orderBy: { createdAt: "desc" },
          take: 6,
        });
        if (!customerMentionedNumber(recent.map((m) => m.text).join(" "), data.number)) {
          return {
            erro: "O cliente ainda não informou o número da casa. Pergunte o número (ou se é sem número) antes de definir a entrega.",
          };
        }

        const cart = await getOrCreateCart(phone);
        return summarizeCart(await setDelivery(cart.id, data));
      }

      case "definir_retirada": {
        const cart = await getOrCreateCart(phone);
        return summarizeCart(await setPickup(cart.id));
      }

      case "confirmar_pedido": {
        const result = await confirmFromSummary(phone);
        if (!result.ok) return { erro: result.erro };
        context.confirmedOrderId = result.order.id;
        return { confirmado: true, numeroDoPedido: orderLabel(result.order), ...summarizeCart(result.order) };
      }

      case "mostrar_resumo": {
        const parsed = confirmOrderSchema.safeParse(args);
        if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Forma de pagamento inválida" };

        const cart = await getOrCreateCart(phone);
        const order = await setPayment(cart.id, parsed.data);
        context.summaryText = formatOrderSummary(order);
        return { ok: true };
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

      const parsed = productOptionsSchema.safeParse(p.options);
      const options = parsed.success
        ? parsed.data
            .map((group) => `${group.name}${group.required ? " (obrigatório)" : ""}: ${group.choices.join(", ")}`)
            .join("; ")
        : "";

      return `- id ${p.id}: ${p.name} (${p.category}) - R$ ${price}${description}${options ? ` | opções: ${options}` : ""}`;
    })
    .join("\n");

  const cart = await getOrCreateCart(phone);

  // O cliente está respondendo ao resumo oficial: avisa a IA para não refazer mudanças antigas
  const answeringSummary = await lastMessageIsSummary(phone, cart);

  const replyConfig: GenerateContentConfig = {
    ...config,
    systemInstruction: [
      SYSTEM_PROMPT,
      `Horário de funcionamento: ${describeHours()}. Agora a loja está ${isStoreOpen() ? "ABERTA" : "FECHADA"}.`,
      PUBLIC_URL
        ? `Link do cardápio com fotos: ${PUBLIC_URL}/cardapio. Envie esse link quando o cliente quiser ver as opções ou estiver indeciso.`
        : "",
      `Cardápio atual:\n${menu}`,
      `Carrinho atual do cliente (já salvo no sistema):\n${describeCart(cart)}`,
      answeringSummary
        ? "A última mensagem enviada ao cliente foi o resumo oficial, e ele já inclui todas as mudanças pedidas antes. Não repita mudanças anteriores. Se o cliente concordar, chame confirmar_pedido. Se ele pedir uma mudança nova, faça só essa mudança e chame mostrar_resumo."
        : "",
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

    // Resumo oficial: vai exatamente como o código montou, sem chamar o Gemini de novo
    if (context.summaryText) {
      return { text: context.summaryText, confirmedOrderId: context.confirmedOrderId };
    }

    contents.push({ role: "user", parts });
  }

  return {
    text: "Desculpe, me enrolei aqui. Pode repetir o seu pedido?",
    confirmedOrderId: context.confirmedOrderId,
  };
}
