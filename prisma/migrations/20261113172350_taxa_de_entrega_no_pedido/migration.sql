-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "cep" TEXT,
ADD COLUMN     "deliveryFee" DECIMAL(10,2) NOT NULL DEFAULT 0;
