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

// O último modelo que respondeu: as próximas mensagens começam por ele
let preferredModel: string | undefined;

type GenerateParams = Omit<Parameters<typeof ai.models.generateContent>[0], "model">;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Erros passageiros: sobrecarga (503), limite (429), erro interno (500) ou sem resposta
function isTemporaryError(error: unknown) {
  const status = (error as { status?: number }).status;
  return status === undefined || status === 429 || status === 500 || status === 503;
}

// Chama um modelo específico, com uma nova tentativa se o erro for passageiro
async function callModel(model: string, params: GenerateParams) {
  try {
    return await ai.models.generateContent({ ...params, model });
  } catch (error) {
    if (!isTemporaryError(error)) throw error;
    console.warn(`Gemini ${model} indisponível, tentando de novo...`);
    await sleep(1500);
    return ai.models.generateContent({ ...params, model });
  }
}

// Primeira chamada da resposta: procura um modelo que esteja respondendo
async function pickModelAndGenerate(params: GenerateParams) {
  const order = preferredModel
    ? [preferredModel, ...MODELS.filter((model) => model !== preferredModel)]
    : MODELS;

  let lastError: unknown;
  for (const model of order) {
    try {
      const response = await callModel(model, params);
      if (model !== preferredModel) console.log(`[IA] usando o modelo ${model}`);
      preferredModel = model;
      return { model, response };
    } catch (error) {
      if (!isTemporaryError(error)) throw error;
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
- Use apenas os produtos e preços que vierem da ferramenta ver_cardapio. Nunca invente produto, preço, prazo ou promoção.
- Para montar o pedido, use as ferramentas. Se o cliente não deixar claro qual produto quer, pergunte antes de adicionar.
- O carrinho atual do cliente aparece no fim destas instruções. Os itens que estão nele já foram adicionados: não adicione de novo.
- Para adicionar um produto, use o id que veio de ver_cardapio. Se não tiver o id nesta resposta, chame ver_cardapio antes. Nunca invente ids.
- Para fechar o pedido, pergunte se é entrega ou retirada, o endereço (se for entrega) e a forma de pagamento: Pix, cartão ou dinheiro. Se for dinheiro, pergunte se precisa de troco e para quanto.
- Antes de confirmar, mostre o resumo com os itens e o total e pergunte se está tudo certo. Só chame confirmar_pedido depois que o cliente concordar.
- Mesmo que o cliente já tenha passado todos os dados, sempre mostre o resumo e espere ele responder antes de chamar confirmar_pedido.
- Depois de confirmar, informe o número do pedido.
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

// Executa a ferramenta que a IA pediu, usando os services que já existem
async function runTool(name: string, args: Record<string, unknown>, phone: string) {
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
  // Histórico da conversa: cliente = "user", bot = "model"
  const history = await getRecentMessages(customerId);
  const contents: Content[] = history.map((message) => ({
    role: message.direction === "INBOUND" ? "user" : "model",
    parts: [{ text: message.text }],
  }));

  // A conversa enviada para a IA precisa começar por uma mensagem do cliente
  while (contents[0]?.role === "model") contents.shift();

  // Mostra à IA o carrinho como está agora no banco
  const cart = await getOrCreateCart(phone);
  const replyConfig: GenerateContentConfig = {
    ...config,
    systemInstruction: `${SYSTEM_PROMPT}\n\nCarrinho atual do cliente (já salvo no sistema): ${JSON.stringify(summarizeCart(cart))}`,
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
      return response.text?.trim() || "Desculpe, não entendi. Pode repetir?";
    }

    // Devolve a resposta da IA inteira ao histórico (ela carrega dados internos do modelo)
    const modelContent = response.candidates?.[0]?.content;
    if (modelContent) contents.push(modelContent);

    const parts: Part[] = [];
    for (const call of calls) {
      const toolResult = await runTool(call.name ?? "", call.args ?? {}, phone);
      console.log(`[IA] ${call.name}`, call.args ?? {}, "->", JSON.stringify(toolResult));
      parts.push({ functionResponse: { id: call.id, name: call.name, response: toolResult } });
    }
    contents.push({ role: "user", parts });
  }

  return "Desculpe, me enrolei aqui. Pode repetir o seu pedido?";
}
