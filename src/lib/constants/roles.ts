export const ROLES = {
  ROOT: "ROOT",
  EMPLOYEE: "EMPLOYEE",
  SUPERVISOR: "SUPERVISOR",
  MANAGER: "MANAGER",
  DIRECTOR: "DIRECTOR",
  FINANCE: "FINANCE",
  ADMIN: "ADMIN",
  SALES_EMPLOYEE: "SALES_EMPLOYEE",
  SALES_CHIEF: "SALES_CHIEF",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_LABELS: Record<Role, string> = {
  ROOT: "Root",
  EMPLOYEE: "Employee",
  SUPERVISOR: "Supervisor",
  MANAGER: "Manager",
  DIRECTOR: "Director",
  FINANCE: "Finance",
  ADMIN: "Administrator",
  SALES_EMPLOYEE: "Sales Employee",
  SALES_CHIEF: "Sales Chief",
};

export const DEFAULT_USER_ROLES: Role[] = [ROLES.EMPLOYEE];

export const APPROVER_ROLES: Role[] = [
  ROLES.ROOT,
  ROLES.SUPERVISOR,
  ROLES.SALES_CHIEF,
  ROLES.MANAGER,
  ROLES.DIRECTOR,
  ROLES.FINANCE,
  ROLES.ADMIN,
];

export const FINANCE_ROLES: Role[] = [ROLES.FINANCE, ROLES.ADMIN];

export const MANAGEMENT_ROLES: Role[] = [
  ROLES.ROOT,
  ROLES.SUPERVISOR,
  ROLES.MANAGER,
  ROLES.DIRECTOR,
  ROLES.ADMIN,
];

export const CRM_ROLES: Role[] = [
  ROLES.ROOT,
  ROLES.ADMIN,
  ROLES.DIRECTOR,
  ROLES.MANAGER,
  ROLES.SALES_CHIEF,
  ROLES.SALES_EMPLOYEE,
];

export const ROLE_PRECEDENCE: Role[] = [
  ROLES.ROOT,
  ROLES.ADMIN,
  ROLES.FINANCE,
  ROLES.DIRECTOR,
  ROLES.MANAGER,
  ROLES.SALES_CHIEF,
  ROLES.SUPERVISOR,
  ROLES.SALES_EMPLOYEE,
  ROLES.EMPLOYEE,
];

export function normalizeRoles(input: {
  roles?: string[] | null;
  role?: string | null;
  includeDefault?: boolean;
}): Role[] {
  const result = new Set<Role>();
  const includeDefault = input.includeDefault ?? true;

  for (const rawRole of input.roles ?? []) {
    if (isRole(rawRole)) {
      result.add(rawRole);
    }
  }

  if (result.size === 0 && isRole(input.role)) {
    result.add(input.role);
  }

  if (includeDefault && result.size === 0) {
    for (const defaultRole of DEFAULT_USER_ROLES) {
      result.add(defaultRole);
    }
  }

  return [...result];
}

export function derivePrimaryRole(roles: readonly Role[]): Role {
  for (const role of ROLE_PRECEDENCE) {
    if (roles.includes(role)) {
      return role;
    }
  }
  return ROLES.EMPLOYEE;
}

export function hasRole(
  roles: readonly string[] | undefined,
  role: Role,
): boolean {
  return roles?.includes(role) ?? false;
}

export function hasAnyRole(
  roles: readonly string[] | undefined,
  allowed: readonly Role[],
): boolean {
  if (!roles?.length) {
    return false;
  }
  return allowed.some((role) => roles.includes(role));
}

export function isRole(value: string | null | undefined): value is Role {
  return !!value && value in ROLES;
}

export function isApprover(role: Role): boolean {
  return APPROVER_ROLES.includes(role);
}

export function hasFinanceAccess(role: Role): boolean {
  return FINANCE_ROLES.includes(role);
}

export function isAdmin(role: Role): boolean {
  return role === ROLES.ADMIN || role === ROLES.ROOT;
}
