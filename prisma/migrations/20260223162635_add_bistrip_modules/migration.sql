/*
  Warnings:

  - You are about to drop the column `customerName` on the `TravelRequest` table. All the data in the column will be lost.
  - You are about to drop the column `estimatedBudget` on the `TravelRequest` table. All the data in the column will be lost.
  - You are about to drop the column `projectName` on the `TravelRequest` table. All the data in the column will be lost.
  - You are about to drop the column `salesPerson` on the `TravelRequest` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "BailoutStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED_CHIEF', 'APPROVED_DIRECTOR', 'REJECTED', 'DISBURSED');

-- CreateEnum
CREATE TYPE "TransportMode" AS ENUM ('FLIGHT', 'TRAIN', 'BUS', 'FERRY', 'CAR_RENTAL', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'SALES_EMPLOYEE';
ALTER TYPE "Role" ADD VALUE 'SALES_CHIEF';

-- AlterTable
ALTER TABLE "TravelRequest" DROP COLUMN "customerName",
DROP COLUMN "estimatedBudget",
DROP COLUMN "projectName",
DROP COLUMN "salesPerson",
ADD COLUMN     "projectId" TEXT;

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "clientName" VARCHAR(200),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelBooking" (
    "id" TEXT NOT NULL,
    "travelRequestId" TEXT NOT NULL,
    "hotelName" VARCHAR(255) NOT NULL,
    "hotelAddress" TEXT,
    "bookingSource" VARCHAR(100),
    "bookingRef" VARCHAR(100),
    "roomType" VARCHAR(100),
    "checkIn" TIMESTAMP(3) NOT NULL,
    "checkOut" TIMESTAMP(3) NOT NULL,
    "pricePerNight" DECIMAL(15,2),
    "totalPrice" DECIMAL(15,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportBooking" (
    "id" TEXT NOT NULL,
    "travelRequestId" TEXT NOT NULL,
    "mode" "TransportMode" NOT NULL,
    "provider" VARCHAR(100),
    "bookingSource" VARCHAR(100),
    "bookingRef" VARCHAR(100),
    "flightNumber" VARCHAR(20),
    "seatClass" VARCHAR(50),
    "departureFrom" VARCHAR(100),
    "arrivalTo" VARCHAR(100),
    "departureAt" TIMESTAMP(3),
    "arrivalAt" TIMESTAMP(3),
    "totalPrice" DECIMAL(15,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bailout" (
    "id" TEXT NOT NULL,
    "bailoutNumber" VARCHAR(50) NOT NULL,
    "travelRequestId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "status" "BailoutStatus" NOT NULL DEFAULT 'DRAFT',
    "chiefApproverId" TEXT,
    "chiefApprovedAt" TIMESTAMP(3),
    "chiefNotes" TEXT,
    "directorApproverId" TEXT,
    "directorApprovedAt" TIMESTAMP(3),
    "directorNotes" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "disbursedAt" TIMESTAMP(3),
    "disbursementRef" VARCHAR(100),
    "submittedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bailout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- CreateIndex
CREATE INDEX "Project_code_idx" ON "Project"("code");

-- CreateIndex
CREATE INDEX "Project_isActive_idx" ON "Project"("isActive");

-- CreateIndex
CREATE INDEX "HotelBooking_travelRequestId_idx" ON "HotelBooking"("travelRequestId");

-- CreateIndex
CREATE INDEX "TransportBooking_travelRequestId_idx" ON "TransportBooking"("travelRequestId");

-- CreateIndex
CREATE INDEX "TransportBooking_mode_idx" ON "TransportBooking"("mode");

-- CreateIndex
CREATE UNIQUE INDEX "Bailout_bailoutNumber_key" ON "Bailout"("bailoutNumber");

-- CreateIndex
CREATE INDEX "Bailout_travelRequestId_idx" ON "Bailout"("travelRequestId");

-- CreateIndex
CREATE INDEX "Bailout_requesterId_status_idx" ON "Bailout"("requesterId", "status");

-- CreateIndex
CREATE INDEX "Bailout_status_createdAt_idx" ON "Bailout"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Bailout_bailoutNumber_idx" ON "Bailout"("bailoutNumber");

-- CreateIndex
CREATE INDEX "TravelRequest_projectId_idx" ON "TravelRequest"("projectId");

-- AddForeignKey
ALTER TABLE "TravelRequest" ADD CONSTRAINT "TravelRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelBooking" ADD CONSTRAINT "HotelBooking_travelRequestId_fkey" FOREIGN KEY ("travelRequestId") REFERENCES "TravelRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportBooking" ADD CONSTRAINT "TransportBooking_travelRequestId_fkey" FOREIGN KEY ("travelRequestId") REFERENCES "TravelRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bailout" ADD CONSTRAINT "Bailout_travelRequestId_fkey" FOREIGN KEY ("travelRequestId") REFERENCES "TravelRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bailout" ADD CONSTRAINT "Bailout_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bailout" ADD CONSTRAINT "Bailout_chiefApproverId_fkey" FOREIGN KEY ("chiefApproverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bailout" ADD CONSTRAINT "Bailout_directorApproverId_fkey" FOREIGN KEY ("directorApproverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
