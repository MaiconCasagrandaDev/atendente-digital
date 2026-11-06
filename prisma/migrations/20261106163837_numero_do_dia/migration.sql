-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "businessDate" TEXT,
ADD COLUMN     "dailyNumber" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "orders_businessDate_dailyNumber_key" ON "orders"("businessDate", "dailyNumber");

