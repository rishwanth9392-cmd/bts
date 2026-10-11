/*
  Warnings:

  - A unique constraint covering the columns `[studentId]` on the table `PickupAssignment` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "PickupAssignment_studentId_key" ON "PickupAssignment"("studentId");
