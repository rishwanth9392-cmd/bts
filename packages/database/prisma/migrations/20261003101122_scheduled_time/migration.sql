/*
  Warnings:

  - You are about to drop the column `estimatedMinutes` on the `RouteStop` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "RouteStop" DROP COLUMN "estimatedMinutes",
ADD COLUMN     "scheduledTime" TEXT;

-- AlterTable
ALTER TABLE "Stop" ALTER COLUMN "lat" DROP NOT NULL,
ALTER COLUMN "lng" DROP NOT NULL;
