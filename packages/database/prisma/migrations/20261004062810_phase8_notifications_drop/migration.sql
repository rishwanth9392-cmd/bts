/*
  Warnings:

  - You are about to drop the column `read` on the `Notification` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Notification` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "BoardingEvent" ALTER COLUMN "stopId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Notification" DROP COLUMN "read",
DROP COLUMN "updatedAt",
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "readAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "BoardingEvent_studentId_tripId_type_idx" ON "BoardingEvent"("studentId", "tripId", "type");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");
