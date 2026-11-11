import { prisma } from "./lib/prisma";
import { normalizeText } from "./lib/text";

// Opções que se repetem entre os produtos
const retirarIngrediente = [
  {
    name: "Retirar algum ingrediente?",
    type: "multiple",
    required: false,
    prefix: "sem ",
    choices: ["cebola", "tomate", "alface", "maionese"],
  },
];

const saborSuco = [
  { name: "Sabor", type: "single", required: true, choices: ["laranja", "limão", "maracujá"] },
];

const tipoAgua = [
  { name: "Tipo", type: "single", required: true, choices: ["sem gás", "com gás"] },
];

const products = [
  { name: "X-Burguer", description: "Pão, hambúrguer, queijo e salada", price: 27.5, category: "Lanches", imageUrl: "/imagens/x-burguer.jpg", options: retirarIngrediente },
  { name: "X-Salada", description: "Pão, hambúrguer, queijo, alface, tomate e maionese", price: 25, category: "Lanches", imageUrl: "/imagens/x-salada.jpg", options: retirarIngrediente },
  { name: "X-Bacon", description: "Pão, hambúrguer, queijo, bacon e salada", price: 32, category: "Lanches", imageUrl: "/imagens/x-bacon.jpg", options: retirarIngrediente },
  { name: "X-Tudo", description: "Pão, dois hambúrgueres, queijo, bacon, ovo, presunto e salada", price: 39.9, category: "Lanches", imageUrl: "/imagens/x-tudo.jpg", options: retirarIngrediente },
  { name: "Batata frita", description: "Porção de 500 g, serve 2 pessoas", price: 28, category: "Porções", imageUrl: "/imagens/batata-frita.jpg" },
  { name: "Batata com cheddar e bacon", description: "Porção de 500 g", price: 36, category: "Porções", imageUrl: "/imagens/batata-cheddar-bacon.jpg" },
  { name: "Anéis de cebola", description: "Porção com 15 unidades", price: 24, category: "Porções", imageUrl: "/imagens/aneis-de-cebola.jpg" },
  { name: "Coca-Cola lata", description: "350 ml", price: 6, category: "Bebidas", imageUrl: "/imagens/refrigerante-cola.jpg" },
  { name: "Guaraná lata", description: "350 ml", price: 5.5, category: "Bebidas", imageUrl: "/imagens/refrigerante-guarana.jpg" },
  { name: "Suco natural", description: "Laranja, limão ou maracujá, 500 ml", price: 9, category: "Bebidas", imageUrl: "/imagens/suco-natural.jpg", options: saborSuco },
  { name: "Água mineral", description: "500 ml, com ou sem gás", price: 4, category: "Bebidas", imageUrl: "/imagens/agua-mineral.jpg", options: tipoAgua },
  { name: "Pudim", description: "Fatia de pudim de leite", price: 10, category: "Sobremesas", imageUrl: "/imagens/pudim.jpg" },
  { name: "Brownie com sorvete", description: "Brownie quente com bola de sorvete de creme", price: 18, category: "Sobremesas", imageUrl: "/imagens/brownie.jpg" },
];

async function main() {
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  const { count } = await prisma.product.createMany({ data: products });

  const zones = [
    { name: "Centro", fee: 5 },
    { name: "São Bento", fee: 6 },
    { name: "Cidade Alta", fee: 7 },
    { name: "Vila Nova", fee: 8 },
  ];
  await prisma.deliveryZone.deleteMany();
  await prisma.deliveryZone.createMany({
    data: zones.map((z) => ({ ...z, key: normalizeText(z.name) })),
  });

  console.log(`${count} produtos criados`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
