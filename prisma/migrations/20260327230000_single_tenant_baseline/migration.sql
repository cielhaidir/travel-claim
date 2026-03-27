-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ROOT', 'EMPLOYEE', 'SUPERVISOR', 'MANAGER', 'DIRECTOR', 'FINANCE', 'ADMIN', 'SALES_EMPLOYEE', 'SALES_CHIEF');

-- CreateEnum
CREATE TYPE "TravelType" AS ENUM ('SALES', 'OPERATIONAL', 'MEETING', 'TRAINING');

-- CreateEnum
CREATE TYPE "TravelStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED_L1', 'APPROVED_L2', 'APPROVED_L3', 'APPROVED_L4', 'APPROVED_L5', 'APPROVED', 'REJECTED', 'REVISION', 'LOCKED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ApprovalLevel" AS ENUM ('SALES_LEAD', 'DEPT_CHIEF', 'DIRECTOR', 'SENIOR_DIRECTOR', 'EXECUTIVE');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED');

-- CreateEnum
CREATE TYPE "ClaimType" AS ENUM ('ENTERTAINMENT', 'NON_ENTERTAINMENT');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'REVISION', 'PAID');

-- CreateEnum
CREATE TYPE "EntertainmentType" AS ENUM ('MEAL', 'GIFT', 'EVENT', 'HOSPITALITY', 'OTHER');

-- CreateEnum
CREATE TYPE "NonEntertainmentCategory" AS ENUM ('TRANSPORT', 'PHONE_BILLING', 'TRAVEL_EXPENSES', 'OVERTIME_MEALS', 'BPJS_HEALTH', 'EQUIPMENT_STATIONERY', 'MOTORCYCLE_SERVICE', 'ACCOMMODATION', 'OTHER');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'IN_APP', 'PUSH');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'READ');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'SUBMIT', 'LOCK', 'CLOSE', 'REOPEN');

-- CreateEnum
CREATE TYPE "COAType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "BailoutStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED_CHIEF', 'APPROVED_DIRECTOR', 'REJECTED', 'DISBURSED');

-- CreateEnum
CREATE TYPE "BailoutCategory" AS ENUM ('TRANSPORT', 'HOTEL', 'MEAL', 'OTHER');

-- CreateEnum
CREATE TYPE "TransportMode" AS ENUM ('FLIGHT', 'TRAIN', 'BUS', 'FERRY', 'CAR_RENTAL', 'OTHER');

-- CreateEnum
CREATE TYPE "JournalEntryType" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "JournalSourceType" AS ENUM ('CLAIM', 'BAILOUT', 'ADJUSTMENT', 'FUNDING', 'MANUAL', 'SETTLEMENT');

-- CreateEnum
CREATE TYPE "JournalStatus" AS ENUM ('DRAFT', 'POSTED', 'VOID');

-- CreateEnum
CREATE TYPE "CrmLeadStage" AS ENUM ('NEW', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "CrmLeadPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "CrmGender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "CrmIndustry" AS ENUM ('TECHNOLOGY', 'FINANCE', 'HEALTHCARE', 'EDUCATION', 'MANUFACTURING', 'RETAIL', 'LOGISTICS', 'HOSPITALITY', 'GOVERNMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "CrmEmployeeRange" AS ENUM ('ONE_TO_TEN', 'ELEVEN_TO_FIFTY', 'FIFTY_ONE_TO_TWO_HUNDRED', 'TWO_HUNDRED_ONE_TO_FIVE_HUNDRED', 'FIVE_HUNDRED_ONE_TO_ONE_THOUSAND', 'OVER_ONE_THOUSAND');

-- CreateEnum
CREATE TYPE "CrmLeadStatus" AS ENUM ('NEW', 'CONTACTED', 'NURTURE', 'QUALIFIED', 'CONVERTED', 'UNQUALIFIED', 'JUNK');

-- CreateEnum
CREATE TYPE "CrmDealStage" AS ENUM ('DISCOVERY', 'PROPOSAL', 'NEGOTIATION', 'VERBAL_WON', 'WON', 'LOST', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "CrmDealStatus" AS ENUM ('QUALIFICATION', 'DEMO_MAKING', 'PROPOSAL_QUOTATION', 'NEGOTIATION', 'READY_TO_CLOSE', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "CrmLeadSource" AS ENUM ('REFERRAL', 'WEBSITE', 'EVENT', 'OUTBOUND', 'PARTNER');

-- CreateEnum
CREATE TYPE "CrmCustomerSegment" AS ENUM ('ENTERPRISE', 'SMB', 'GOVERNMENT', 'EDUCATION');

-- CreateEnum
CREATE TYPE "CrmCustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'VIP');

-- CreateEnum
CREATE TYPE "CrmActivityType" AS ENUM ('CALL', 'MEETING', 'EMAIL', 'FOLLOW_UP', 'CHAT', 'STAGE_CHANGE', 'NOTE', 'TASK', 'ATTACHMENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "CrmConversationStatus" AS ENUM ('OPEN', 'WAITING_REPLY', 'CLOSED');

-- CreateEnum
CREATE TYPE "CrmMessageStatus" AS ENUM ('DRAFT', 'SENT', 'RECEIVED', 'NOTE');

-- CreateEnum
CREATE TYPE "CrmTaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CrmTaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "CrmProductType" AS ENUM ('PRODUCT', 'SERVICE');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('RECEIPT', 'ISSUE', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'RESERVATION', 'RELEASE');

-- CreateEnum
CREATE TYPE "InventoryBucketType" AS ENUM ('SALE_STOCK', 'TEMP_ASSET');

-- CreateEnum
CREATE TYPE "InventoryReservationStatus" AS ENUM ('ACTIVE', 'PARTIAL', 'FULFILLED', 'RELEASED', 'CANCELED');

-- CreateEnum
CREATE TYPE "InventoryTrackingMode" AS ENUM ('QUANTITY', 'SERIAL', 'BOTH');

-- CreateEnum
CREATE TYPE "InventoryUsageType" AS ENUM ('SALE', 'OPERATIONAL', 'BOTH');

-- CreateEnum
CREATE TYPE "InventoryUnitStatus" AS ENUM ('IN_STOCK', 'RESERVED', 'ISSUED', 'ASSIGNED', 'IN_TRANSIT', 'DAMAGED', 'LOST', 'RETIRED');

-- CreateEnum
CREATE TYPE "InventoryUnitCondition" AS ENUM ('NEW', 'GOOD', 'FAIR', 'DAMAGED', 'REPAIR', 'SCRAP');

-- CreateEnum
CREATE TYPE "CrmFulfillmentStatus" AS ENUM ('DRAFT', 'RESERVED', 'PARTIAL', 'READY', 'DELIVERED', 'CANCELED');

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "refresh_token_expires_in" INTEGER,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "employeeId" VARCHAR(50),
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "departmentId" TEXT,
    "supervisorId" TEXT,
    "phoneNumber" VARCHAR(20),
    "password" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "displayName" VARCHAR(100),
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "permissions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "chiefId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChartOfAccount" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "accountType" "COAType" NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "subcategory" VARCHAR(50),
    "parentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChartOfAccount_pkey" PRIMARY KEY ("id")
);

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
    "salesId" VARCHAR(50),

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmCustomer" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(150),
    "company" VARCHAR(200) NOT NULL,
    "email" VARCHAR(200),
    "phone" VARCHAR(30),
    "segment" "CrmCustomerSegment" NOT NULL DEFAULT 'SMB',
    "city" VARCHAR(100),
    "ownerName" VARCHAR(150),
    "status" "CrmCustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "isVendor" BOOLEAN NOT NULL DEFAULT false,
    "isCustomer" BOOLEAN NOT NULL DEFAULT true,
    "totalValue" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "website" VARCHAR(255),
    "annualRevenue" DECIMAL(15,2),
    "employeeCount" "CrmEmployeeRange",
    "industry" "CrmIndustry",
    "notes" TEXT,
    "lastContactAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmContact" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "title" VARCHAR(150),
    "email" VARCHAR(200),
    "phone" VARCHAR(30),
    "department" VARCHAR(100),
    "firstName" VARCHAR(100),
    "lastName" VARCHAR(100),
    "gender" "CrmGender",
    "designation" VARCHAR(150),
    "address" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmLead" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "name" VARCHAR(150) NOT NULL,
    "company" VARCHAR(200) NOT NULL,
    "email" VARCHAR(200) NOT NULL,
    "phone" VARCHAR(30),
    "firstName" VARCHAR(100),
    "lastName" VARCHAR(100),
    "mobileNo" VARCHAR(30),
    "gender" "CrmGender",
    "status" "CrmLeadStatus" NOT NULL DEFAULT 'NEW',
    "website" VARCHAR(255),
    "employeeCount" "CrmEmployeeRange",
    "annualRevenue" DECIMAL(15,2),
    "industry" "CrmIndustry",
    "ownerId" TEXT,
    "stage" "CrmLeadStage" NOT NULL DEFAULT 'NEW',
    "value" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "probability" INTEGER NOT NULL DEFAULT 0,
    "source" "CrmLeadSource" NOT NULL DEFAULT 'REFERRAL',
    "priority" "CrmLeadPriority" NOT NULL DEFAULT 'MEDIUM',
    "ownerName" VARCHAR(150) NOT NULL,
    "expectedCloseDate" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "convertedToDealAt" TIMESTAMP(3),
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmDeal" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "contactId" TEXT,
    "leadId" TEXT,
    "title" VARCHAR(200) NOT NULL,
    "company" VARCHAR(200) NOT NULL,
    "ownerName" VARCHAR(150) NOT NULL,
    "ownerId" TEXT,
    "status" "CrmDealStatus" NOT NULL DEFAULT 'QUALIFICATION',
    "website" VARCHAR(255),
    "employeeCount" "CrmEmployeeRange",
    "annualRevenue" DECIMAL(15,2),
    "industry" "CrmIndustry",
    "firstName" VARCHAR(100),
    "lastName" VARCHAR(100),
    "primaryEmail" VARCHAR(200),
    "primaryMobileNo" VARCHAR(30),
    "gender" "CrmGender",
    "stage" "CrmDealStage" NOT NULL DEFAULT 'DISCOVERY',
    "value" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "probability" INTEGER NOT NULL DEFAULT 0,
    "source" "CrmLeadSource" NOT NULL DEFAULT 'REFERRAL',
    "expectedCloseDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "lostReason" TEXT,
    "notes" TEXT,
    "lastActivityAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmDeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmTask" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "dealId" TEXT,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "status" "CrmTaskStatus" NOT NULL DEFAULT 'OPEN',
    "assigneeId" TEXT,
    "assigneeName" VARCHAR(150),
    "dueDate" TIMESTAMP(3),
    "priority" "CrmTaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmNote" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "dealId" TEXT,
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL,
    "writerId" TEXT,
    "writerName" VARCHAR(150),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmRecordAttachment" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "dealId" TEXT,
    "filename" VARCHAR(255) NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "storageUrl" TEXT NOT NULL,
    "storageProvider" VARCHAR(50) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmRecordAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmActivity" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "leadId" TEXT,
    "dealId" TEXT,
    "conversationId" TEXT,
    "messageId" TEXT,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "type" "CrmActivityType" NOT NULL DEFAULT 'FOLLOW_UP',
    "ownerName" VARCHAR(150) NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmConversation" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "leadId" TEXT,
    "dealId" TEXT,
    "subject" VARCHAR(200),
    "ownerName" VARCHAR(150) NOT NULL,
    "status" "CrmConversationStatus" NOT NULL DEFAULT 'OPEN',
    "lastMessageAt" TIMESTAMP(3),
    "lastMessagePreview" VARCHAR(255),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "status" "CrmMessageStatus" NOT NULL DEFAULT 'SENT',
    "senderName" VARCHAR(150) NOT NULL,
    "body" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmProduct" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "type" "CrmProductType" NOT NULL DEFAULT 'PRODUCT',
    "inventoryItemId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmLeadLine" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "crmProductId" TEXT,
    "inventoryItemId" TEXT,
    "warehousePreferenceId" TEXT,
    "description" TEXT,
    "qty" DECIMAL(15,2) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalPrice" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "requiresInventory" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmLeadLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmFulfillmentRequest" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "customerId" TEXT,
    "requestNumber" VARCHAR(50) NOT NULL,
    "status" "CrmFulfillmentStatus" NOT NULL DEFAULT 'DRAFT',
    "requestedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmFulfillmentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmFulfillmentRequestLine" (
    "id" TEXT NOT NULL,
    "fulfillmentRequestId" TEXT NOT NULL,
    "leadLineId" TEXT,
    "inventoryItemId" TEXT NOT NULL,
    "warehouseId" TEXT,
    "qtyRequested" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "qtyReserved" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "qtyDelivered" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmFulfillmentRequestLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "sku" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "unitOfMeasure" VARCHAR(30) NOT NULL,
    "category" VARCHAR(100),
    "brand" VARCHAR(100),
    "model" VARCHAR(150),
    "manufacturerPartNumber" VARCHAR(100),
    "barcode" VARCHAR(100),
    "technicalSpecs" TEXT,
    "trackingMode" "InventoryTrackingMode" NOT NULL DEFAULT 'QUANTITY',
    "usageType" "InventoryUsageType" NOT NULL DEFAULT 'BOTH',
    "isStockTracked" BOOLEAN NOT NULL DEFAULT true,
    "minStock" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "reorderPoint" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "standardCost" DECIMAL(15,2),
    "inventoryCoaId" TEXT,
    "temporaryAssetCoaId" TEXT,
    "cogsCoaId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItemUnit" (
    "id" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "warehouseId" TEXT,
    "receiptBatchId" TEXT,
    "bucketType" "InventoryBucketType" NOT NULL DEFAULT 'SALE_STOCK',
    "serialNumber" VARCHAR(150),
    "assetTag" VARCHAR(150),
    "batchNumber" VARCHAR(100),
    "status" "InventoryUnitStatus" NOT NULL DEFAULT 'IN_STOCK',
    "condition" "InventoryUnitCondition" NOT NULL DEFAULT 'NEW',
    "receivedDate" TIMESTAMP(3),
    "purchaseDate" TIMESTAMP(3),
    "warrantyExpiry" TIMESTAMP(3),
    "assignedToUserId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItemUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryReceiptBatch" (
    "id" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "bucketType" "InventoryBucketType" NOT NULL DEFAULT 'SALE_STOCK',
    "vendorName" VARCHAR(150),
    "vendorReference" VARCHAR(100),
    "batchNumber" VARCHAR(100),
    "unitCost" DECIMAL(15,2),
    "receivedQty" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "remainingQty" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "receivedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referenceType" VARCHAR(50),
    "referenceId" VARCHAR(100),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryReceiptBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryReservationUnit" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "inventoryItemUnitId" TEXT NOT NULL,
    "fulfillmentRequestLineId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryReservationUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBalance" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "bucketType" "InventoryBucketType" NOT NULL DEFAULT 'SALE_STOCK',
    "qtyOnHand" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "qtyReserved" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryLedgerEntry" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "bucketType" "InventoryBucketType" NOT NULL DEFAULT 'SALE_STOCK',
    "movementType" "InventoryMovementType" NOT NULL,
    "referenceType" VARCHAR(50),
    "referenceId" VARCHAR(100),
    "chartOfAccountId" TEXT,
    "quantityBefore" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "quantityChange" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "quantityAfter" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(15,2),
    "totalCost" DECIMAL(15,2),
    "notes" TEXT,
    "movementDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryReservation" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "warehouseId" TEXT,
    "leadLineId" TEXT,
    "sourceType" VARCHAR(50) NOT NULL,
    "sourceId" VARCHAR(100) NOT NULL,
    "qtyReserved" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "qtyFulfilled" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "qtyReleased" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "status" "InventoryReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelRequest" (
    "id" TEXT NOT NULL,
    "requestNumber" VARCHAR(50) NOT NULL,
    "requesterId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "destination" VARCHAR(255) NOT NULL,
    "travelType" "TravelType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT,
    "status" "TravelStatus" NOT NULL DEFAULT 'DRAFT',
    "totalReimbursed" DECIMAL(15,2),
    "submittedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelParticipant" (
    "id" TEXT NOT NULL,
    "travelRequestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" VARCHAR(100),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TravelParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bailout" (
    "id" TEXT NOT NULL,
    "bailoutNumber" VARCHAR(50) NOT NULL,
    "travelRequestId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "category" "BailoutCategory" NOT NULL DEFAULT 'OTHER',
    "description" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "transportMode" "TransportMode",
    "carrier" VARCHAR(100),
    "departureFrom" VARCHAR(100),
    "arrivalTo" VARCHAR(100),
    "departureAt" TIMESTAMP(3),
    "arrivalAt" TIMESTAMP(3),
    "flightNumber" VARCHAR(20),
    "seatClass" VARCHAR(50),
    "bookingRef" VARCHAR(100),
    "hotelName" VARCHAR(255),
    "hotelAddress" TEXT,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "roomType" VARCHAR(100),
    "mealDate" TIMESTAMP(3),
    "mealLocation" VARCHAR(255),
    "status" "BailoutStatus" NOT NULL DEFAULT 'DRAFT',
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "disbursedAt" TIMESTAMP(3),
    "disbursementRef" VARCHAR(100),
    "submittedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "storageUrl" TEXT,
    "financeId" TEXT,

    CONSTRAINT "Bailout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "approvalNumber" VARCHAR(50) NOT NULL,
    "travelRequestId" TEXT,
    "bailoutId" TEXT,
    "claimId" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "level" "ApprovalLevel" NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approverId" TEXT NOT NULL,
    "comments" TEXT,
    "rejectionReason" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "claimNumber" VARCHAR(50) NOT NULL,
    "travelRequestId" TEXT NOT NULL,
    "submitterId" TEXT NOT NULL,
    "claimType" "ClaimType" NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'DRAFT',
    "entertainmentType" "EntertainmentType",
    "entertainmentDate" TIMESTAMP(3),
    "entertainmentLocation" VARCHAR(255),
    "entertainmentAddress" TEXT,
    "guestName" VARCHAR(255),
    "guestCompany" VARCHAR(255),
    "guestPosition" VARCHAR(100),
    "isGovernmentOfficial" BOOLEAN DEFAULT false,
    "expenseCategory" "NonEntertainmentCategory",
    "expenseDate" TIMESTAMP(3),
    "expenseDestination" VARCHAR(255),
    "customerName" VARCHAR(255),
    "amount" DECIMAL(15,2) NOT NULL,
    "description" TEXT NOT NULL,
    "notes" TEXT,
    "coaId" TEXT,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "paidBy" VARCHAR(100),
    "paymentReference" VARCHAR(100),
    "submittedVia" VARCHAR(50),
    "financeId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "storageUrl" TEXT NOT NULL,
    "storageProvider" VARCHAR(50) NOT NULL,
    "ocrExtractedData" JSONB,
    "ocrConfidence" DECIMAL(5,2),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "message" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "entityType" VARCHAR(50),
    "entityId" TEXT,
    "actionUrl" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "priority" VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
    "templateId" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entityType" VARCHAR(50) NOT NULL,
    "entityId" TEXT NOT NULL,
    "chartOfAccountId" TEXT,
    "changes" JSONB,
    "metadata" JSONB,
    "ipAddress" VARCHAR(45),
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BalanceAccount" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "balance" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "defaultChartOfAccountId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BalanceAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalTransaction" (
    "id" TEXT NOT NULL,
    "transactionNumber" VARCHAR(50) NOT NULL,
    "transactionDate" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "entryType" "JournalEntryType" NOT NULL,
    "bailoutId" TEXT,
    "claimId" TEXT,
    "chartOfAccountId" TEXT NOT NULL,
    "balanceAccountId" TEXT NOT NULL,
    "referenceNumber" VARCHAR(100),
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "journalNumber" VARCHAR(50) NOT NULL,
    "transactionDate" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "sourceType" "JournalSourceType",
    "sourceId" TEXT,
    "status" "JournalStatus" NOT NULL DEFAULT 'DRAFT',
    "bailoutId" TEXT,
    "claimId" TEXT,
    "referenceNumber" VARCHAR(100),
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "postedById" TEXT,
    "postedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntryLine" (
    "id" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "chartOfAccountId" TEXT NOT NULL,
    "balanceAccountId" TEXT,
    "description" TEXT,
    "debitAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "creditAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "lineNumber" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalEntryLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");

-- CreateIndex
CREATE INDEX "User_employeeId_idx" ON "User"("employeeId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_departmentId_idx" ON "User"("departmentId");

-- CreateIndex
CREATE INDEX "User_supervisorId_idx" ON "User"("supervisorId");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "RolePermission_role_idx" ON "RolePermission"("role");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_role_key" ON "RolePermission"("role");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "Department_code_idx" ON "Department"("code");

-- CreateIndex
CREATE INDEX "Department_parentId_idx" ON "Department"("parentId");

-- CreateIndex
CREATE INDEX "Department_chiefId_idx" ON "Department"("chiefId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");

-- CreateIndex
CREATE INDEX "ChartOfAccount_code_idx" ON "ChartOfAccount"("code");

-- CreateIndex
CREATE INDEX "ChartOfAccount_accountType_idx" ON "ChartOfAccount"("accountType");

-- CreateIndex
CREATE INDEX "ChartOfAccount_parentId_idx" ON "ChartOfAccount"("parentId");

-- CreateIndex
CREATE INDEX "ChartOfAccount_isActive_idx" ON "ChartOfAccount"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ChartOfAccount_code_key" ON "ChartOfAccount"("code");

-- CreateIndex
CREATE INDEX "Project_code_idx" ON "Project"("code");

-- CreateIndex
CREATE INDEX "Project_isActive_idx" ON "Project"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- CreateIndex
CREATE INDEX "CrmCustomer_deletedAt_idx" ON "CrmCustomer"("deletedAt");

-- CreateIndex
CREATE INDEX "CrmContact_customerId_idx" ON "CrmContact"("customerId");

-- CreateIndex
CREATE INDEX "CrmContact_deletedAt_idx" ON "CrmContact"("deletedAt");

-- CreateIndex
CREATE INDEX "CrmLead_customerId_idx" ON "CrmLead"("customerId");

-- CreateIndex
CREATE INDEX "CrmLead_deletedAt_idx" ON "CrmLead"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CrmDeal_leadId_key" ON "CrmDeal"("leadId");

-- CreateIndex
CREATE INDEX "CrmDeal_customerId_idx" ON "CrmDeal"("customerId");

-- CreateIndex
CREATE INDEX "CrmDeal_contactId_idx" ON "CrmDeal"("contactId");

-- CreateIndex
CREATE INDEX "CrmDeal_deletedAt_idx" ON "CrmDeal"("deletedAt");

-- CreateIndex
CREATE INDEX "CrmTask_leadId_idx" ON "CrmTask"("leadId");

-- CreateIndex
CREATE INDEX "CrmTask_dealId_idx" ON "CrmTask"("dealId");

-- CreateIndex
CREATE INDEX "CrmTask_status_idx" ON "CrmTask"("status");

-- CreateIndex
CREATE INDEX "CrmTask_dueDate_idx" ON "CrmTask"("dueDate");

-- CreateIndex
CREATE INDEX "CrmTask_deletedAt_idx" ON "CrmTask"("deletedAt");

-- CreateIndex
CREATE INDEX "CrmNote_leadId_idx" ON "CrmNote"("leadId");

-- CreateIndex
CREATE INDEX "CrmNote_dealId_idx" ON "CrmNote"("dealId");

-- CreateIndex
CREATE INDEX "CrmNote_deletedAt_idx" ON "CrmNote"("deletedAt");

-- CreateIndex
CREATE INDEX "CrmRecordAttachment_leadId_idx" ON "CrmRecordAttachment"("leadId");

-- CreateIndex
CREATE INDEX "CrmRecordAttachment_dealId_idx" ON "CrmRecordAttachment"("dealId");

-- CreateIndex
CREATE INDEX "CrmRecordAttachment_deletedAt_idx" ON "CrmRecordAttachment"("deletedAt");

-- CreateIndex
CREATE INDEX "CrmActivity_customerId_idx" ON "CrmActivity"("customerId");

-- CreateIndex
CREATE INDEX "CrmActivity_leadId_idx" ON "CrmActivity"("leadId");

-- CreateIndex
CREATE INDEX "CrmActivity_dealId_idx" ON "CrmActivity"("dealId");

-- CreateIndex
CREATE INDEX "CrmActivity_conversationId_idx" ON "CrmActivity"("conversationId");

-- CreateIndex
CREATE INDEX "CrmActivity_messageId_idx" ON "CrmActivity"("messageId");

-- CreateIndex
CREATE INDEX "CrmActivity_deletedAt_idx" ON "CrmActivity"("deletedAt");

-- CreateIndex
CREATE INDEX "CrmConversation_customerId_idx" ON "CrmConversation"("customerId");

-- CreateIndex
CREATE INDEX "CrmConversation_leadId_idx" ON "CrmConversation"("leadId");

-- CreateIndex
CREATE INDEX "CrmConversation_dealId_idx" ON "CrmConversation"("dealId");

-- CreateIndex
CREATE INDEX "CrmConversation_deletedAt_idx" ON "CrmConversation"("deletedAt");

-- CreateIndex
CREATE INDEX "CrmMessage_conversationId_idx" ON "CrmMessage"("conversationId");

-- CreateIndex
CREATE INDEX "CrmMessage_deletedAt_idx" ON "CrmMessage"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CrmProduct_code_key" ON "CrmProduct"("code");

-- CreateIndex
CREATE INDEX "CrmProduct_inventoryItemId_idx" ON "CrmProduct"("inventoryItemId");

-- CreateIndex
CREATE INDEX "CrmProduct_isActive_idx" ON "CrmProduct"("isActive");

-- CreateIndex
CREATE INDEX "CrmProduct_deletedAt_idx" ON "CrmProduct"("deletedAt");

-- CreateIndex
CREATE INDEX "CrmLeadLine_leadId_idx" ON "CrmLeadLine"("leadId");

-- CreateIndex
CREATE INDEX "CrmLeadLine_crmProductId_idx" ON "CrmLeadLine"("crmProductId");

-- CreateIndex
CREATE INDEX "CrmLeadLine_inventoryItemId_idx" ON "CrmLeadLine"("inventoryItemId");

-- CreateIndex
CREATE INDEX "CrmLeadLine_warehousePreferenceId_idx" ON "CrmLeadLine"("warehousePreferenceId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmFulfillmentRequest_requestNumber_key" ON "CrmFulfillmentRequest"("requestNumber");

-- CreateIndex
CREATE INDEX "CrmFulfillmentRequest_leadId_idx" ON "CrmFulfillmentRequest"("leadId");

-- CreateIndex
CREATE INDEX "CrmFulfillmentRequest_customerId_idx" ON "CrmFulfillmentRequest"("customerId");

-- CreateIndex
CREATE INDEX "CrmFulfillmentRequest_status_idx" ON "CrmFulfillmentRequest"("status");

-- CreateIndex
CREATE INDEX "CrmFulfillmentRequestLine_fulfillmentRequestId_idx" ON "CrmFulfillmentRequestLine"("fulfillmentRequestId");

-- CreateIndex
CREATE INDEX "CrmFulfillmentRequestLine_leadLineId_idx" ON "CrmFulfillmentRequestLine"("leadLineId");

-- CreateIndex
CREATE INDEX "CrmFulfillmentRequestLine_inventoryItemId_idx" ON "CrmFulfillmentRequestLine"("inventoryItemId");

-- CreateIndex
CREATE INDEX "CrmFulfillmentRequestLine_warehouseId_idx" ON "CrmFulfillmentRequestLine"("warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_sku_key" ON "InventoryItem"("sku");

-- CreateIndex
CREATE INDEX "InventoryItem_isActive_idx" ON "InventoryItem"("isActive");

-- CreateIndex
CREATE INDEX "InventoryItem_inventoryCoaId_idx" ON "InventoryItem"("inventoryCoaId");

-- CreateIndex
CREATE INDEX "InventoryItem_temporaryAssetCoaId_idx" ON "InventoryItem"("temporaryAssetCoaId");

-- CreateIndex
CREATE INDEX "InventoryItem_cogsCoaId_idx" ON "InventoryItem"("cogsCoaId");

-- CreateIndex
CREATE INDEX "InventoryItem_deletedAt_idx" ON "InventoryItem"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_code_key" ON "Warehouse"("code");

-- CreateIndex
CREATE INDEX "Warehouse_isActive_idx" ON "Warehouse"("isActive");

-- CreateIndex
CREATE INDEX "Warehouse_deletedAt_idx" ON "Warehouse"("deletedAt");

-- CreateIndex
CREATE INDEX "InventoryItemUnit_inventoryItemId_idx" ON "InventoryItemUnit"("inventoryItemId");

-- CreateIndex
CREATE INDEX "InventoryItemUnit_warehouseId_idx" ON "InventoryItemUnit"("warehouseId");

-- CreateIndex
CREATE INDEX "InventoryItemUnit_receiptBatchId_idx" ON "InventoryItemUnit"("receiptBatchId");

-- CreateIndex
CREATE INDEX "InventoryItemUnit_status_idx" ON "InventoryItemUnit"("status");

-- CreateIndex
CREATE INDEX "InventoryItemUnit_condition_idx" ON "InventoryItemUnit"("condition");

-- CreateIndex
CREATE INDEX "InventoryItemUnit_bucketType_idx" ON "InventoryItemUnit"("bucketType");

-- CreateIndex
CREATE INDEX "InventoryItemUnit_assignedToUserId_idx" ON "InventoryItemUnit"("assignedToUserId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItemUnit_serialNumber_key" ON "InventoryItemUnit"("serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItemUnit_assetTag_key" ON "InventoryItemUnit"("assetTag");

-- CreateIndex
CREATE INDEX "InventoryReceiptBatch_inventoryItemId_idx" ON "InventoryReceiptBatch"("inventoryItemId");

-- CreateIndex
CREATE INDEX "InventoryReceiptBatch_warehouseId_idx" ON "InventoryReceiptBatch"("warehouseId");

-- CreateIndex
CREATE INDEX "InventoryReceiptBatch_bucketType_idx" ON "InventoryReceiptBatch"("bucketType");

-- CreateIndex
CREATE INDEX "InventoryReceiptBatch_batchNumber_idx" ON "InventoryReceiptBatch"("batchNumber");

-- CreateIndex
CREATE INDEX "InventoryReceiptBatch_vendorName_idx" ON "InventoryReceiptBatch"("vendorName");

-- CreateIndex
CREATE INDEX "InventoryReceiptBatch_receivedDate_idx" ON "InventoryReceiptBatch"("receivedDate");

-- CreateIndex
CREATE INDEX "InventoryReservationUnit_inventoryItemUnitId_idx" ON "InventoryReservationUnit"("inventoryItemUnitId");

-- CreateIndex
CREATE INDEX "InventoryReservationUnit_fulfillmentRequestLineId_idx" ON "InventoryReservationUnit"("fulfillmentRequestLineId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryReservationUnit_reservationId_inventoryItemUnitId_key" ON "InventoryReservationUnit"("reservationId", "inventoryItemUnitId");

-- CreateIndex
CREATE INDEX "InventoryBalance_warehouseId_idx" ON "InventoryBalance"("warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBalance_itemId_warehouseId_bucketType_key" ON "InventoryBalance"("itemId", "warehouseId", "bucketType");

-- CreateIndex
CREATE INDEX "InventoryLedgerEntry_itemId_warehouseId_movementDate_idx" ON "InventoryLedgerEntry"("itemId", "warehouseId", "movementDate");

-- CreateIndex
CREATE INDEX "InventoryLedgerEntry_bucketType_idx" ON "InventoryLedgerEntry"("bucketType");

-- CreateIndex
CREATE INDEX "InventoryLedgerEntry_referenceType_referenceId_idx" ON "InventoryLedgerEntry"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "InventoryLedgerEntry_chartOfAccountId_idx" ON "InventoryLedgerEntry"("chartOfAccountId");

-- CreateIndex
CREATE INDEX "InventoryLedgerEntry_createdById_idx" ON "InventoryLedgerEntry"("createdById");

-- CreateIndex
CREATE INDEX "InventoryReservation_itemId_idx" ON "InventoryReservation"("itemId");

-- CreateIndex
CREATE INDEX "InventoryReservation_warehouseId_idx" ON "InventoryReservation"("warehouseId");

-- CreateIndex
CREATE INDEX "InventoryReservation_leadLineId_idx" ON "InventoryReservation"("leadLineId");

-- CreateIndex
CREATE INDEX "InventoryReservation_sourceType_sourceId_idx" ON "InventoryReservation"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "InventoryReservation_status_idx" ON "InventoryReservation"("status");

-- CreateIndex
CREATE INDEX "TravelRequest_requesterId_status_idx" ON "TravelRequest"("requesterId", "status");

-- CreateIndex
CREATE INDEX "TravelRequest_status_createdAt_idx" ON "TravelRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TravelRequest_requestNumber_idx" ON "TravelRequest"("requestNumber");

-- CreateIndex
CREATE INDEX "TravelRequest_travelType_idx" ON "TravelRequest"("travelType");

-- CreateIndex
CREATE INDEX "TravelRequest_startDate_endDate_idx" ON "TravelRequest"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "TravelRequest_projectId_idx" ON "TravelRequest"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "TravelRequest_requestNumber_key" ON "TravelRequest"("requestNumber");

-- CreateIndex
CREATE INDEX "TravelParticipant_userId_idx" ON "TravelParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TravelParticipant_travelRequestId_userId_key" ON "TravelParticipant"("travelRequestId", "userId");

-- CreateIndex
CREATE INDEX "Bailout_travelRequestId_idx" ON "Bailout"("travelRequestId");

-- CreateIndex
CREATE INDEX "Bailout_requesterId_status_idx" ON "Bailout"("requesterId", "status");

-- CreateIndex
CREATE INDEX "Bailout_status_createdAt_idx" ON "Bailout"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Bailout_bailoutNumber_idx" ON "Bailout"("bailoutNumber");

-- CreateIndex
CREATE INDEX "Bailout_financeId_idx" ON "Bailout"("financeId");

-- CreateIndex
CREATE UNIQUE INDEX "Bailout_bailoutNumber_key" ON "Bailout"("bailoutNumber");

-- CreateIndex
CREATE INDEX "Approval_approvalNumber_idx" ON "Approval"("approvalNumber");

-- CreateIndex
CREATE INDEX "Approval_travelRequestId_sequence_idx" ON "Approval"("travelRequestId", "sequence");

-- CreateIndex
CREATE INDEX "Approval_bailoutId_sequence_idx" ON "Approval"("bailoutId", "sequence");

-- CreateIndex
CREATE INDEX "Approval_claimId_sequence_idx" ON "Approval"("claimId", "sequence");

-- CreateIndex
CREATE INDEX "Approval_approverId_status_idx" ON "Approval"("approverId", "status");

-- CreateIndex
CREATE INDEX "Approval_status_createdAt_idx" ON "Approval"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Approval_approvalNumber_key" ON "Approval"("approvalNumber");

-- CreateIndex
CREATE INDEX "Claim_travelRequestId_idx" ON "Claim"("travelRequestId");

-- CreateIndex
CREATE INDEX "Claim_submitterId_status_idx" ON "Claim"("submitterId", "status");

-- CreateIndex
CREATE INDEX "Claim_status_createdAt_idx" ON "Claim"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Claim_claimNumber_idx" ON "Claim"("claimNumber");

-- CreateIndex
CREATE INDEX "Claim_claimType_idx" ON "Claim"("claimType");

-- CreateIndex
CREATE INDEX "Claim_coaId_idx" ON "Claim"("coaId");

-- CreateIndex
CREATE INDEX "Claim_financeId_idx" ON "Claim"("financeId");

-- CreateIndex
CREATE UNIQUE INDEX "Claim_claimNumber_key" ON "Claim"("claimNumber");

-- CreateIndex
CREATE INDEX "Attachment_claimId_idx" ON "Attachment"("claimId");

-- CreateIndex
CREATE INDEX "Notification_userId_status_idx" ON "Notification"("userId", "status");

-- CreateIndex
CREATE INDEX "Notification_status_createdAt_idx" ON "Notification"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_channel_idx" ON "Notification"("channel");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_chartOfAccountId_idx" ON "AuditLog"("chartOfAccountId");

-- CreateIndex
CREATE INDEX "BalanceAccount_code_idx" ON "BalanceAccount"("code");

-- CreateIndex
CREATE INDEX "BalanceAccount_isActive_idx" ON "BalanceAccount"("isActive");

-- CreateIndex
CREATE INDEX "BalanceAccount_defaultChartOfAccountId_idx" ON "BalanceAccount"("defaultChartOfAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "BalanceAccount_code_key" ON "BalanceAccount"("code");

-- CreateIndex
CREATE INDEX "JournalTransaction_transactionNumber_idx" ON "JournalTransaction"("transactionNumber");

-- CreateIndex
CREATE INDEX "JournalTransaction_transactionDate_idx" ON "JournalTransaction"("transactionDate");

-- CreateIndex
CREATE INDEX "JournalTransaction_chartOfAccountId_idx" ON "JournalTransaction"("chartOfAccountId");

-- CreateIndex
CREATE INDEX "JournalTransaction_balanceAccountId_idx" ON "JournalTransaction"("balanceAccountId");

-- CreateIndex
CREATE INDEX "JournalTransaction_bailoutId_idx" ON "JournalTransaction"("bailoutId");

-- CreateIndex
CREATE INDEX "JournalTransaction_claimId_idx" ON "JournalTransaction"("claimId");

-- CreateIndex
CREATE INDEX "JournalTransaction_entryType_transactionDate_idx" ON "JournalTransaction"("entryType", "transactionDate");

-- CreateIndex
CREATE UNIQUE INDEX "JournalTransaction_transactionNumber_key" ON "JournalTransaction"("transactionNumber");

-- CreateIndex
CREATE INDEX "JournalEntry_journalNumber_idx" ON "JournalEntry"("journalNumber");

-- CreateIndex
CREATE INDEX "JournalEntry_transactionDate_idx" ON "JournalEntry"("transactionDate");

-- CreateIndex
CREATE INDEX "JournalEntry_sourceType_sourceId_idx" ON "JournalEntry"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "JournalEntry_status_transactionDate_idx" ON "JournalEntry"("status", "transactionDate");

-- CreateIndex
CREATE INDEX "JournalEntry_bailoutId_idx" ON "JournalEntry"("bailoutId");

-- CreateIndex
CREATE INDEX "JournalEntry_claimId_idx" ON "JournalEntry"("claimId");

-- CreateIndex
CREATE INDEX "JournalEntry_createdById_idx" ON "JournalEntry"("createdById");

-- CreateIndex
CREATE INDEX "JournalEntry_postedById_idx" ON "JournalEntry"("postedById");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_journalNumber_key" ON "JournalEntry"("journalNumber");

-- CreateIndex
CREATE INDEX "JournalEntryLine_journalEntryId_idx" ON "JournalEntryLine"("journalEntryId");

-- CreateIndex
CREATE INDEX "JournalEntryLine_chartOfAccountId_idx" ON "JournalEntryLine"("chartOfAccountId");

-- CreateIndex
CREATE INDEX "JournalEntryLine_balanceAccountId_idx" ON "JournalEntryLine"("balanceAccountId");

-- CreateIndex
CREATE INDEX "JournalEntryLine_lineNumber_idx" ON "JournalEntryLine"("lineNumber");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_chiefId_fkey" FOREIGN KEY ("chiefId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartOfAccount" ADD CONSTRAINT "ChartOfAccount_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ChartOfAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartOfAccount" ADD CONSTRAINT "ChartOfAccount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartOfAccount" ADD CONSTRAINT "ChartOfAccount_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_salesId_fkey" FOREIGN KEY ("salesId") REFERENCES "User"("employeeId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmContact" ADD CONSTRAINT "CrmContact_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CrmCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CrmCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmDeal" ADD CONSTRAINT "CrmDeal_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CrmCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmDeal" ADD CONSTRAINT "CrmDeal_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CrmContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmDeal" ADD CONSTRAINT "CrmDeal_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "CrmDeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmNote" ADD CONSTRAINT "CrmNote_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmNote" ADD CONSTRAINT "CrmNote_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "CrmDeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmRecordAttachment" ADD CONSTRAINT "CrmRecordAttachment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmRecordAttachment" ADD CONSTRAINT "CrmRecordAttachment_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "CrmDeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CrmCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "CrmDeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "CrmConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "CrmMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmConversation" ADD CONSTRAINT "CrmConversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CrmCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmConversation" ADD CONSTRAINT "CrmConversation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmConversation" ADD CONSTRAINT "CrmConversation_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "CrmDeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmMessage" ADD CONSTRAINT "CrmMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "CrmConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmProduct" ADD CONSTRAINT "CrmProduct_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLeadLine" ADD CONSTRAINT "CrmLeadLine_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLeadLine" ADD CONSTRAINT "CrmLeadLine_crmProductId_fkey" FOREIGN KEY ("crmProductId") REFERENCES "CrmProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLeadLine" ADD CONSTRAINT "CrmLeadLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLeadLine" ADD CONSTRAINT "CrmLeadLine_warehousePreferenceId_fkey" FOREIGN KEY ("warehousePreferenceId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmFulfillmentRequest" ADD CONSTRAINT "CrmFulfillmentRequest_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmFulfillmentRequest" ADD CONSTRAINT "CrmFulfillmentRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CrmCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmFulfillmentRequestLine" ADD CONSTRAINT "CrmFulfillmentRequestLine_fulfillmentRequestId_fkey" FOREIGN KEY ("fulfillmentRequestId") REFERENCES "CrmFulfillmentRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmFulfillmentRequestLine" ADD CONSTRAINT "CrmFulfillmentRequestLine_leadLineId_fkey" FOREIGN KEY ("leadLineId") REFERENCES "CrmLeadLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmFulfillmentRequestLine" ADD CONSTRAINT "CrmFulfillmentRequestLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmFulfillmentRequestLine" ADD CONSTRAINT "CrmFulfillmentRequestLine_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_inventoryCoaId_fkey" FOREIGN KEY ("inventoryCoaId") REFERENCES "ChartOfAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_temporaryAssetCoaId_fkey" FOREIGN KEY ("temporaryAssetCoaId") REFERENCES "ChartOfAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_cogsCoaId_fkey" FOREIGN KEY ("cogsCoaId") REFERENCES "ChartOfAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItemUnit" ADD CONSTRAINT "InventoryItemUnit_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItemUnit" ADD CONSTRAINT "InventoryItemUnit_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItemUnit" ADD CONSTRAINT "InventoryItemUnit_receiptBatchId_fkey" FOREIGN KEY ("receiptBatchId") REFERENCES "InventoryReceiptBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItemUnit" ADD CONSTRAINT "InventoryItemUnit_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReceiptBatch" ADD CONSTRAINT "InventoryReceiptBatch_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReceiptBatch" ADD CONSTRAINT "InventoryReceiptBatch_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservationUnit" ADD CONSTRAINT "InventoryReservationUnit_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "InventoryReservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservationUnit" ADD CONSTRAINT "InventoryReservationUnit_inventoryItemUnitId_fkey" FOREIGN KEY ("inventoryItemUnitId") REFERENCES "InventoryItemUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservationUnit" ADD CONSTRAINT "InventoryReservationUnit_fulfillmentRequestLineId_fkey" FOREIGN KEY ("fulfillmentRequestLineId") REFERENCES "CrmFulfillmentRequestLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLedgerEntry" ADD CONSTRAINT "InventoryLedgerEntry_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLedgerEntry" ADD CONSTRAINT "InventoryLedgerEntry_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLedgerEntry" ADD CONSTRAINT "InventoryLedgerEntry_chartOfAccountId_fkey" FOREIGN KEY ("chartOfAccountId") REFERENCES "ChartOfAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLedgerEntry" ADD CONSTRAINT "InventoryLedgerEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_leadLineId_fkey" FOREIGN KEY ("leadLineId") REFERENCES "CrmLeadLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelRequest" ADD CONSTRAINT "TravelRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelRequest" ADD CONSTRAINT "TravelRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelParticipant" ADD CONSTRAINT "TravelParticipant_travelRequestId_fkey" FOREIGN KEY ("travelRequestId") REFERENCES "TravelRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelParticipant" ADD CONSTRAINT "TravelParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bailout" ADD CONSTRAINT "Bailout_travelRequestId_fkey" FOREIGN KEY ("travelRequestId") REFERENCES "TravelRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bailout" ADD CONSTRAINT "Bailout_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bailout" ADD CONSTRAINT "Bailout_financeId_fkey" FOREIGN KEY ("financeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_travelRequestId_fkey" FOREIGN KEY ("travelRequestId") REFERENCES "TravelRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_bailoutId_fkey" FOREIGN KEY ("bailoutId") REFERENCES "Bailout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_travelRequestId_fkey" FOREIGN KEY ("travelRequestId") REFERENCES "TravelRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_coaId_fkey" FOREIGN KEY ("coaId") REFERENCES "ChartOfAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_financeId_fkey" FOREIGN KEY ("financeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_chartOfAccountId_fkey" FOREIGN KEY ("chartOfAccountId") REFERENCES "ChartOfAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceAccount" ADD CONSTRAINT "BalanceAccount_defaultChartOfAccountId_fkey" FOREIGN KEY ("defaultChartOfAccountId") REFERENCES "ChartOfAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalTransaction" ADD CONSTRAINT "JournalTransaction_bailoutId_fkey" FOREIGN KEY ("bailoutId") REFERENCES "Bailout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalTransaction" ADD CONSTRAINT "JournalTransaction_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalTransaction" ADD CONSTRAINT "JournalTransaction_chartOfAccountId_fkey" FOREIGN KEY ("chartOfAccountId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalTransaction" ADD CONSTRAINT "JournalTransaction_balanceAccountId_fkey" FOREIGN KEY ("balanceAccountId") REFERENCES "BalanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_bailoutId_fkey" FOREIGN KEY ("bailoutId") REFERENCES "Bailout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntryLine" ADD CONSTRAINT "JournalEntryLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntryLine" ADD CONSTRAINT "JournalEntryLine_chartOfAccountId_fkey" FOREIGN KEY ("chartOfAccountId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntryLine" ADD CONSTRAINT "JournalEntryLine_balanceAccountId_fkey" FOREIGN KEY ("balanceAccountId") REFERENCES "BalanceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

