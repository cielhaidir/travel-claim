import { auth } from "@/server/auth";
import type { Session } from "next-auth";
import {
  APPROVER_ROLES,
  FINANCE_ROLES,
  MANAGEMENT_ROLES,
  normalizeRoles,
  type Role,
} from "@/lib/constants/roles";

function sessionRoles(session: Session | null): Role[] {
  return normalizeRoles({
    roles: session?.user?.roles,
    role: session?.user?.role,
  });
}

/**
 * Get the current session with type safety
 * @returns The current session or null if not authenticated
 */
export async function getSession(): Promise<Session | null> {
  return await auth();
}

/**
 * Get the current session or throw an error if not authenticated
 * @throws Error if user is not authenticated
 */
export async function requireAuth(): Promise<Session> {
  const session = await auth();

  if (!session?.user) {
    throw new Error("Unauthorized: Authentication required");
  }

  return session;
}

/**
 * Check if the current user has a specific role
 * @param role - The role to check
 * @returns True if user has the role, false otherwise
 */
export async function hasRole(role: Role): Promise<boolean> {
  const session = await auth();
  return sessionRoles(session).includes(role);
}

/**
 * Check if the current user has any of the specified roles
 * @param roles - Array of roles to check
 * @returns True if user has any of the roles, false otherwise
 */
export async function hasAnyRole(roles: Role[]): Promise<boolean> {
  const session = await auth();
  const userRoles = sessionRoles(session);
  return roles.some((role) => userRoles.includes(role));
}

/**
 * Require that the current user has a specific role
 * @param role - The required role
 * @throws Error if user doesn't have the role
 */
export async function requireRole(role: Role): Promise<Session> {
  const session = await requireAuth();

  if (!sessionRoles(session).includes(role)) {
    throw new Error(`Forbidden: ${role} role required`);
  }

  return session;
}

/**
 * Require that the current user has any of the specified roles
 * @param roles - Array of allowed roles
 * @throws Error if user doesn't have any of the roles
 */
export async function requireAnyRole(roles: Role[]): Promise<Session> {
  const session = await requireAuth();

  if (!roles.some((role) => sessionRoles(session).includes(role))) {
    throw new Error(`Forbidden: One of [${roles.join(", ")}] roles required`);
  }

  return session;
}

/**
 * Check if the current user is an admin
 */
export async function isAdmin(): Promise<boolean> {
  return await hasRole("ADMIN");
}

/**
 * Check if the current user is a manager or higher
 */
export async function isManager(): Promise<boolean> {
  return await hasAnyRole(MANAGEMENT_ROLES);
}

/**
 * Check if the current user is a supervisor or higher
 */
export async function isSupervisor(): Promise<boolean> {
  return await hasAnyRole(["SUPERVISOR", ...MANAGEMENT_ROLES]);
}

/**
 * Check if the current user has finance role
 */
export async function isFinance(): Promise<boolean> {
  return await hasAnyRole(FINANCE_ROLES);
}

/**
 * Check if the current user can approve at a specific level
 * @param level - The approval level (L1, L2, L3, L4, L5)
 */
export async function canApproveLevel(
  level: "L1" | "L2" | "L3" | "L4" | "L5",
): Promise<boolean> {
  const session = await auth();
  const userRoles = sessionRoles(session);
  if (userRoles.length === 0) return false;

  const hasAny = (roles: Role[]) =>
    roles.some((role) => userRoles.includes(role));

  switch (level) {
    case "L1":
      // L1: Supervisor and above
      return hasAny(["SUPERVISOR", ...APPROVER_ROLES]);
    case "L2":
      // L2: Manager and above
      return hasAny(["MANAGER", "DIRECTOR", "FINANCE", "ADMIN"]);
    case "L3":
      // L3: Director and above
      return hasAny(["DIRECTOR", "FINANCE", "ADMIN"]);
    case "L4":
    case "L5":
      // L4/L5: Senior leadership (Finance and Admin)
      return hasAny(FINANCE_ROLES);
    default:
      return false;
  }
}

/**
 * Check if the current user can approve a specific user's request
 * @param requesterId - The ID of the user who created the request
 * @param approverId - The ID of the approver (optional, defaults to current user)
 */
export async function canApproveForUser(
  requesterId: string,
  approverId?: string,
): Promise<boolean> {
  const session = await auth();
  if (!session?.user) return false;

  const currentUserId = approverId ?? session.user.id;
  const userRoles = sessionRoles(session);

  // Admins can approve any request
  if (userRoles.includes("ADMIN")) return true;

  // Finance can approve any request
  if (userRoles.includes("FINANCE")) return true;

  // Users cannot approve their own requests
  if (currentUserId === requesterId) return false;

  return true;
}

/**
 * Get role hierarchy level (higher number = more authority)
 */
export function getRoleLevel(role: Role): number {
  const levels: Record<Role, number> = {
    EMPLOYEE: 1,
    SUPERVISOR: 2,
    SALES_EMPLOYEE: 2,
    MANAGER: 3,
    SALES_CHIEF: 3,
    DIRECTOR: 4,
    FINANCE: 5,
    ADMIN: 6,
  };
  return levels[role] ?? 0;
}

/**
 * Check if role A is higher than role B
 */
export function isRoleHigherThan(roleA: Role, roleB: Role): boolean {
  return getRoleLevel(roleA) > getRoleLevel(roleB);
}

/**
 * Check if role A is at least as high as role B
 */
export function isRoleAtLeast(roleA: Role, roleB: Role): boolean {
  return getRoleLevel(roleA) >= getRoleLevel(roleB);
}
