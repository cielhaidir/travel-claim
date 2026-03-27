-- Create InventoryReservationUnit bridge for serialized reservation / fulfillment tracking
CREATE TABLE "InventoryReservationUnit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "reservationId" TEXT NOT NULL,
    "inventoryItemUnitId" TEXT NOT NULL,
    "fulfillmentRequestLineId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryReservationUnit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InventoryReservationUnit_tenantId_idx" ON "InventoryReservationUnit"("tenantId");
CREATE INDEX "InventoryReservationUnit_inventoryItemUnitId_idx" ON "InventoryReservationUnit"("inventoryItemUnitId");
CREATE INDEX "InventoryReservationUnit_fulfillmentRequestLineId_idx" ON "InventoryReservationUnit"("fulfillmentRequestLineId");
CREATE UNIQUE INDEX "InventoryReservationUnit_reservationId_inventoryItemUnitId_key" ON "InventoryReservationUnit"("reservationId", "inventoryItemUnitId");

ALTER TABLE "InventoryReservationUnit"
  ADD CONSTRAINT "InventoryReservationUnit_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InventoryReservationUnit"
  ADD CONSTRAINT "InventoryReservationUnit_reservationId_fkey"
  FOREIGN KEY ("reservationId") REFERENCES "InventoryReservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InventoryReservationUnit"
  ADD CONSTRAINT "InventoryReservationUnit_inventoryItemUnitId_fkey"
  FOREIGN KEY ("inventoryItemUnitId") REFERENCES "InventoryItemUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InventoryReservationUnit"
  ADD CONSTRAINT "InventoryReservationUnit_fulfillmentRequestLineId_fkey"
  FOREIGN KEY ("fulfillmentRequestLineId") REFERENCES "CrmFulfillmentRequestLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
