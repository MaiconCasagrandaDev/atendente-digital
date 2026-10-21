import { prisma } from "./lib/prisma";

const products = [
  {
    name: "X-Burguer",
    description: "Pão, hambúrguer, queijo e salada",
    price: 27.5,
    category: "Lanches",
  },
  {
    name: "X-Salada",
    description: "Pão, hambúrguer, queijo, alface, tomate e maionese",
    price: 25,
    category: "Lanches",
  },
  {
    name: "X-Bacon",
    description: "Pão, hambúrguer, queijo, bacon e salada",
    price: 32,
    category: "Lanches",
  },
  {
    name: "X-Tudo",
    description:
      "Pão, dois hambúrgueres, queijo, bacon, ovo, presunto e salada",
    price: 39.9,
    category: "Lanches",
  },
  {
    name: "Batata frita",
    description: "Porção de 500 g, serve 2 pessoas",
    price: 28,
    category: "Porções",
  },
  {
    name: "Batata com cheddar e bacon",
    description: "Porção de 500 g",
    price: 36,
    category: "Porções",
  },
  {
    name: "Anéis de cebola",
    description: "Porção com 15 unidades",
    price: 24,
    category: "Porções",
  },
  {
    name: "Coca-Cola lata",
    description: "350 ml",
    price: 6,
    category: "Bebidas",
  },
  {
    name: "Guaraná lata",
    description: "350 ml",
    price: 5.5,
    category: "Bebidas",
  },
  {
    name: "Suco natural",
    description: "Laranja, limão ou maracujá, 500 ml",
    price: 9,
    category: "Bebidas",
  },
  {
    name: "Água mineral",
    description: "500 ml, com ou sem gás",
    price: 4,
    category: "Bebidas",
  },
  {
    name: "Pudim",
    description: "Fatia de pudim de leite",
    price: 10,
    category: "Sobremesas",
  },
  {
    name: "Brownie com sorvete",
    description: "Brownie quente com bola de sorvete de creme",
    price: 18,
    category: "Sobremesas",
  },
];

async function main() {
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  const { count } = await prisma.product.createMany({ data: products });
  console.log(`${count} produtos criados`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
