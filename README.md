# Atendente Digital

API para gestão de pedidos e catálogo de produtos de um atendimento digital, com foco em WhatsApp/atendimento por conversa.

## Visão geral

Este projeto é uma aplicação backend em Node.js com Express e Prisma para:

- gerenciar produtos
- registrar clientes
- criar e acompanhar pedidos
- controlar status de pedido, entrega e pagamento
- expor endpoints REST para integração com frontend ou WhatsApp

## Stack

- Node.js
- TypeScript
- Express
- Prisma ORM
- PostgreSQL
- Zod para validação

## Estrutura principal

- `src/server.ts` — bootstrap da aplicação
- `src/routes/` — rotas da API
- `src/lib/` — utilitários e regras de negócio
- `prisma/schema.prisma` — schema do banco de dados

## Pré-requisitos

- Node.js 20+
- PostgreSQL
- npm ou pnpm

## Configuração

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Crie um arquivo `.env` na raiz com a URL do banco:

   ```env
   DATABASE_URL="postgresql://usuario:senha@localhost:5432/atendente_digital?schema=public"
   PORT=3000
   ```

3. Gere o client do Prisma:

   ```bash
   npx prisma generate
   ```

4. Execute as migrações:

   ```bash
   npx prisma migrate dev
   ```

## Scripts

```bash
npm run dev
```

Inicia a API em modo desenvolvimento com hot reload.

## Endpoints principais

### Health check

```http
GET /health
```

### Produtos

```http
GET /products
POST /products
GET /products/:id
PUT /products/:id
DELETE /products/:id
```

### Pedidos

```http
GET /orders
POST /orders
GET /orders/:id
PUT /orders/:id
DELETE /orders/:id
```

## Observações

O projeto já está estruturado para uso com Prisma e Express, e o banco principal é PostgreSQL. O README inicial era apenas um placeholder e não descrevia o projeto de forma útil para desenvolvimento ou onboarding.

