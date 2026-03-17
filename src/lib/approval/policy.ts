import type { TravelType } from "../../../generated/prisma";
import { derivePrimaryRole, normalizeRoles, ROLES, type Role } from "@/lib/constants/roles";

export const ADMIN_FAST_TRACK_CLAIM_THRESHOLD = 1_000_000;

export type ApprovalEntityType = "CLAIM" | "TRAVEL_REQUEST";

export type ApprovalPolicyScenario =
  | "ENGINEER_SALES_TO_SALES_THEN_DIRECTOR"
  | "SALES_EMPLOYEE_TO_SALES_CHIEF_THEN_DIRECTOR"
  | "ADMIN_TO_DIRECTOR_THEN_FINANCE"
  | "ADMIN_TO_FINANCE_ONLY"
  | "GENERAL_TO_CHIEF_THEN_DIRECTOR"
  | "GENERAL_TO_DIRECTOR";

export type ApprovalPolicyContext = {
  entityType: ApprovalEntityType;
  role?: string | null;
  roles?: string[] | null;
  travelType?: TravelType | null;
  amount?: number | null;
  hasChief: boolean;
};

export type ApprovalPolicyDecision = {
  scenario: ApprovalPolicyScenario;
  primaryRole: Role;
  requiresSalesLead: boolean;
  requiresChief: boolean;
  requiresDirector: boolean;
  requiresFinance: boolean;
  skipChief: boolean;
  skipDirector: boolean;
};

export type HierarchyApproverNode = {
  id: string;
  role: string;
  userRoles?: Array<{ role: string }> | null;
  supervisorId: string | null;
  supervisor?: HierarchyApproverNode | null;
};

export type HierarchyApprovers = {
  chief: HierarchyApproverNode | null;
  director: HierarchyApproverNode | null;
};

function isSalesTravel(travelType?: TravelType | null): boolean {
  return travelType === "SALES";
}

function isAdminBelowFastTrackThreshold(amount?: number | null): boolean {
  return typeof amount === "number" && amount > 0 && amount < ADMIN_FAST_TRACK_CLAIM_THRESHOLD;
}

export function resolveApprovalPrimaryRole(input: {
  role?: string | null;
  roles?: string[] | null;
}): Role {
  return derivePrimaryRole(
    normalizeRoles({
      role: input.role,
      roles: input.roles,
    }),
  );
}

export function resolveHierarchyApprovers(params: {
  supervisor?: HierarchyApproverNode | null;
  departmentChief?: HierarchyApproverNode | null;
}): HierarchyApprovers {
  const firstApprover = params.supervisor ?? params.departmentChief ?? null;

  if (!firstApprover) {
    return {
      chief: null,
      director: null,
    };
  }

  const firstApproverRole = resolveApprovalPrimaryRole({
    role: firstApprover.role,
    roles: firstApprover.userRoles?.map((userRole) => userRole.role) ?? null,
  });

  if (firstApproverRole === ROLES.DIRECTOR) {
    return {
      chief: null,
      director: firstApprover,
    };
  }

  return {
    chief: firstApprover,
    director: firstApprover.supervisor ?? null,
  };
}

export function resolveApprovalPolicy(
  context: ApprovalPolicyContext,
): ApprovalPolicyDecision {
  const primaryRole = resolveApprovalPrimaryRole(context);

  if (context.entityType === "CLAIM" && primaryRole === ROLES.ADMIN) {
    if (isAdminBelowFastTrackThreshold(context.amount)) {
      return {
        scenario: "ADMIN_TO_FINANCE_ONLY",
        primaryRole,
        requiresSalesLead: false,
        requiresChief: false,
        requiresDirector: false,
        requiresFinance: true,
        skipChief: true,
        skipDirector: true,
      };
    }

    return {
      scenario: "ADMIN_TO_DIRECTOR_THEN_FINANCE",
      primaryRole,
      requiresSalesLead: false,
      requiresChief: false,
      requiresDirector: true,
      requiresFinance: true,
      skipChief: true,
      skipDirector: false,
    };
  }

  if (context.entityType === "CLAIM" && primaryRole === ROLES.SALES_EMPLOYEE) {
    return {
      scenario: "SALES_EMPLOYEE_TO_SALES_CHIEF_THEN_DIRECTOR",
      primaryRole,
      requiresSalesLead: false,
      requiresChief: true,
      requiresDirector: true,
      requiresFinance: true,
      skipChief: !context.hasChief,
      skipDirector: false,
    };
  }

  if (
    context.entityType === "CLAIM" &&
    primaryRole !== ROLES.SALES_EMPLOYEE &&
    primaryRole !== ROLES.SALES_CHIEF &&
    isSalesTravel(context.travelType)
  ) {
    return {
      scenario: "ENGINEER_SALES_TO_SALES_THEN_DIRECTOR",
      primaryRole,
      requiresSalesLead: true,
      requiresChief: false,
      requiresDirector: true,
      requiresFinance: true,
      skipChief: true,
      skipDirector: false,
    };
  }

  if (!context.hasChief) {
    return {
      scenario: "GENERAL_TO_DIRECTOR",
      primaryRole,
      requiresSalesLead: false,
      requiresChief: false,
      requiresDirector: true,
      requiresFinance: context.entityType === "CLAIM",
      skipChief: true,
      skipDirector: false,
    };
  }

  return {
    scenario: "GENERAL_TO_CHIEF_THEN_DIRECTOR",
    primaryRole,
    requiresSalesLead: false,
    requiresChief: true,
    requiresDirector: true,
    requiresFinance: context.entityType === "CLAIM",
    skipChief: false,
    skipDirector: false,
  };
}

