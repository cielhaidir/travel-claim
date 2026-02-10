export const ROLES = {
  EMPLOYEE: "EMPLOYEE",
  SUPERVISOR: "SUPERVISOR",
  MANAGER: "MANAGER",
  DIRECTOR: "DIRECTOR",
  FINANCE_MANAGER: "FINANCE_MANAGER",
  ADMIN: "ADMIN",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_LABELS: Record<Role, string> = {
  EMPLOYEE: "Employee",
  SUPERVISOR: "Supervisor",
  MANAGER: "Manager",
  DIRECTOR: "Director",
  FINANCE_MANAGER: "Finance Manager",
  ADMIN: "Administrator",
};

export const APPROVER_ROLES: Role[] = [
  ROLES.SUPERVISOR,
  ROLES.MANAGER,
  ROLES.DIRECTOR,
  ROLES.FINANCE_MANAGER,
  ROLES.ADMIN,
];

export const FINANCE_ROLES: Role[] = [
  ROLES.FINANCE_MANAGER,
  ROLES.ADMIN,
];

export function isApprover(role: Role): boolean {
  return APPROVER_ROLES.includes(role);
}

export function hasFinanceAccess(role: Role): boolean {
  return FINANCE_ROLES.includes(role);
}

export function isAdmin(role: Role): boolean {
  return role === ROLES.ADMIN;
}