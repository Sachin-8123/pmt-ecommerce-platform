-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DeliveryStatus" ADD VALUE 'PENDING';
ALTER TYPE "DeliveryStatus" ADD VALUE 'FAILED';

-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN     "failureReason" TEXT;

-- AlterTable
ALTER TABLE "DeliveryPartner" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'AVAILABLE';
