-- Migration: Replace HotelBooking/TransportBooking with categorized Bailout fields

-- Step 1: Create BailoutCategory enum
CREATE TYPE "BailoutCategory" AS ENUM ('TRANSPORT', 'HOTEL', 'MEAL', 'OTHER');

-- Step 2: Add category and category-specific columns to Bailout
ALTER TABLE "Bailout"
  ADD COLUMN "category" "BailoutCategory" NOT NULL DEFAULT 'OTHER',

  -- Transport fields
  ADD COLUMN "transportMode" "TransportMode",
  ADD COLUMN "carrier"       VARCHAR(100),
  ADD COLUMN "departureFrom" VARCHAR(100),
  ADD COLUMN "arrivalTo"     VARCHAR(100),
  ADD COLUMN "departureAt"   TIMESTAMP(3),
  ADD COLUMN "arrivalAt"     TIMESTAMP(3),
  ADD COLUMN "flightNumber"  VARCHAR(20),
  ADD COLUMN "seatClass"     VARCHAR(50),
  ADD COLUMN "bookingRef"    VARCHAR(100),

  -- Hotel fields
  ADD COLUMN "hotelName"    VARCHAR(255),
  ADD COLUMN "hotelAddress" TEXT,
  ADD COLUMN "checkIn"      TIMESTAMP(3),
  ADD COLUMN "checkOut"     TIMESTAMP(3),
  ADD COLUMN "roomType"     VARCHAR(100),

  -- Meal fields
  ADD COLUMN "mealDate"     TIMESTAMP(3),
  ADD COLUMN "mealLocation" VARCHAR(255);

-- Step 3: Drop old HotelBooking and TransportBooking tables
DROP TABLE IF EXISTS "HotelBooking" CASCADE;
DROP TABLE IF EXISTS "TransportBooking" CASCADE;
