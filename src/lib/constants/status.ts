// Business Trip Request Status
export const TRAVEL_STATUS = {
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
  APPROVED_L1: "APPROVED_L1",
  APPROVED_L2: "APPROVED_L2",
  APPROVED_L3: "APPROVED_L3",
  APPROVED_L4: "APPROVED_L4",
  APPROVED_L5: "APPROVED_L5",
  APPROVED: "APPROVED",
  LOCKED: "LOCKED",
  CLOSED: "CLOSED",
  REJECTED: "REJECTED",
  REVISION: "REVISION",
} as const;

export type TravelStatus = (typeof TRAVEL_STATUS)[keyof typeof TRAVEL_STATUS];

// Claim Status
export const CLAIM_STATUS = {
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
  APPROVED: "APPROVED",
  PAID: "PAID",
  REJECTED: "REJECTED",
  REVISION: "REVISION",
  REVISION_REQUESTED: "REVISION_REQUESTED",
} as const;

export type ClaimStatus = (typeof CLAIM_STATUS)[keyof typeof CLAIM_STATUS];

// Status labels and colors
export const TRAVEL_STATUS_CONFIG: Record<
  TravelStatus,
  { label: string; color: string; bgColor: string }
> = {
  DRAFT: {
    label: "Draft",
    color: "text-gray-700",
    bgColor: "bg-gray-100",
  },
  SUBMITTED: {
    label: "Submitted",
    color: "text-blue-700",
    bgColor: "bg-blue-100",
  },
  APPROVED_L1: {
    label: "L1 Approved",
    color: "text-blue-700",
    bgColor: "bg-blue-100",
  },
  APPROVED_L2: {
    label: "L2 Approved",
    color: "text-blue-700",
    bgColor: "bg-blue-100",
  },
  APPROVED_L3: {
    label: "L3 Approved",
    color: "text-green-700",
    bgColor: "bg-green-100",
  },
  APPROVED_L4: {
    label: "L4 Approved",
    color: "text-green-700",
    bgColor: "bg-green-100",
  },
  APPROVED_L5: {
    label: "L5 Approved",
    color: "text-green-700",
    bgColor: "bg-green-100",
  },
  APPROVED: {
    label: "Approved",
    color: "text-green-700",
    bgColor: "bg-green-100",
  },
  LOCKED: {
    label: "Locked",
    color: "text-purple-700",
    bgColor: "bg-purple-100",
  },
  CLOSED: {
    label: "Closed",
    color: "text-gray-700",
    bgColor: "bg-gray-100",
  },
  REJECTED: {
    label: "Rejected",
    color: "text-red-700",
    bgColor: "bg-red-100",
  },
  REVISION: {
    label: "Revision",
    color: "text-orange-700",
    bgColor: "bg-orange-100",
  },
};

export const CLAIM_STATUS_CONFIG: Record<
  ClaimStatus,
  { label: string; color: string; bgColor: string }
> = {
  DRAFT: {
    label: "Draft",
    color: "text-gray-700",
    bgColor: "bg-gray-100",
  },
  SUBMITTED: {
    label: "Submitted",
    color: "text-blue-700",
    bgColor: "bg-blue-100",
  },
  APPROVED: {
    label: "Approved",
    color: "text-green-700",
    bgColor: "bg-green-100",
  },
  PAID: {
    label: "Paid",
    color: "text-green-700",
    bgColor: "bg-green-100",
  },
  REJECTED: {
    label: "Rejected",
    color: "text-red-700",
    bgColor: "bg-red-100",
  },
  REVISION: {
    label: "Revision",
    color: "text-yellow-700",
    bgColor: "bg-yellow-100",
  },
  REVISION_REQUESTED: {
    label: "Revision Requested",
    color: "text-orange-700",
    bgColor: "bg-orange-100",
  },
};