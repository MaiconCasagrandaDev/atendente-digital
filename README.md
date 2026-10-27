# Atendente Digital

API de pedidos para um atendente virtual com IA no WhatsApp. O cliente conversa com o bot, a IA monta o pedido usando o cardápio real do banco, e o dono do negócio acompanha tudo pela API (e, em breve, por um painel).

A demonstração usa uma lanchonete fictícia, mas o modelo serve para outros negócios que vendem por WhatsApp.

> **Status:** em desenvolvimento. A API de cardápio e pedidos está pronta; a integração com o WhatsApp e a IA estão em andamento.

## Funcionalidades

- **Cardápio:** criar, listar, buscar, editar e desativar produtos (desativar em vez de apagar preserva o histórico dos pedidos)
- **Carrinho:** cada cliente, identificado pelo telefone do WhatsApp, tem um carrinho em aberto; itens iguais com a mesma observação são somados
- **Preço congelado:** cada item guarda o preço da hora da compra, então mudanças no cardápio não alteram pedidos antigos
- **Total calculado com `Decimal`:** sem erros de arredondamento de ponto flutuante
- **Confirmação do pedido:** entrega ou retirada, endereço, forma de pagamento (Pix, cartão ou dinheiro) e troco, com validação das regras de negócio
- **Fluxo de status:** `DRAFT → CONFIRMED → PREPARING → OUT_FOR_DELIVERY → DELIVERED`, com cancelamento; transições inválidas são bloqueadas
- **Erros padronizados:** validação com Zod e tratamento central de erros com status HTTP corretos (400, 404, 409)

## Stack

- **Node.js + TypeScript**
- **Express 5**
- **PostgreSQL + Prisma 7** (com `@prisma/adapter-pg`)
- **Zod** para validação
- **tsx** para rodar TypeScript em desenvolvimento

Próximas etapas: WhatsApp Cloud API, IA com function calling e painel em React + Vite.

## Estrutura

```
prisma/
  schema.prisma        # modelos do banco
  migrations/          # histórico das migrations
src/
  server.ts            # inicialização e tratamento de erros
  seed.ts              # cardápio de exemplo
  routes/              # rotas HTTP (finas: validam e chamam os services)
  services/            # regras de negócio dos pedidos
  schemas/             # schemas Zod de validação
  lib/                 # conexão com o Prisma, erros e helpers
```

A lógica fica nos **services**, separada das rotas. Assim, a IA poderá chamar as mesmas funções (adicionar item, confirmar pedido) diretamente, sem passar por HTTP.

## Como rodar

**Pré-requisitos:** Node.js 20.6+ e PostgreSQL.

1. Clone e instale as dependências:

   ```bash
   git clone https://github.com/MaiconCasagrandaDev/atendente-digital.git
   cd atendente-digital
   npm install
   ```

2. Crie o `.env` a partir do exemplo e ajuste a URL do banco:

   ```bash
   cp .env.example .env
   ```

3. Crie as tabelas e gere o client do Prisma:

   ```bash
   npx prisma migrate dev
   npx prisma generate
   ```

4. Popule o cardápio de exemplo:

   ```bash
   npm run seed
   ```

5. Suba a API:

   ```bash
   npm run dev
   ```

   A API fica em