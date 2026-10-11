/*
  Warnings:

  - You are about to drop the column `lat` on the `LocationHistory` table. All the data in the column will be lost.
  - You are about to drop the column `lng` on the `LocationHistory` table. All the data in the column will be lost.
  - You are about to drop the column `timestamp` on the `LocationHistory` table. All the data in the column will be lost.
  - Added the required column `busId` to the `LocationHistory` table without a default value. This is not possible if the table is not empty.
  - Added the required column `latitude` to the `LocationHistory` table without a default value. This is not possible if the table is not empty.
  - Added the required column `longitude` to the `LocationHistory` table without a default value. This is not possible if the table is not empty.
  - Added the required column `recordedAt` to the `LocationHistory` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "LocationHistory_tripId_timestamp_idx";

-- AlterTable
ALTER TABLE "LocationHistory" DROP COLUMN "lat",
DROP COLUMN "lng",
DROP COLUMN "timestamp",
ADD COLUMN     "accuracy" DOUBLE PRECISION,
ADD COLUMN     "busId" TEXT NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "heading" DOUBLE PRECISION,
ADD COLUMN     "latitude" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "longitude" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "recordedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "LocationHistory_tripId_recordedAt_idx" ON "LocationHistory"("tripId", "recordedAt" DESC);

-- AddForeignKey
ALTER TABLE "LocationHistory" ADD CONSTRAINT "LocationHistory_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
