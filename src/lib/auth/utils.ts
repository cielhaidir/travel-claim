import { auth } from "@/server/auth";
import type { Session } from "next-auth";

// Role type definition
export type Role = "EMPLOYEE" | "SUPERVISOR" | "MANAGER" | "DIRECTOR" | "FINANCE" | "ADMIN";

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
  return session?.user?.role === role;
}

/**
 * Check if the current user has any of the specified roles
 * @param roles - Array of roles to check
 * @returns True if user has any of the roles, false otherwise
 */
export async function hasAnyRole(roles: Role[]): Promise<boolean> {
  const session = await auth();
  return session?.user?.role ? roles.includes(session.user.role) : false;
}

/**
 * Require that the current user has a specific role
 * @param role - The required role
 * @throws Error if user doesn't have the role
 */
export async function requireRole(role: Role): Promise<Session> {
  const session = await requireAuth();
  
  if (session.user.role !== role) {
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
  
  if (!roles.includes(session.user.role)) {
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
  return await hasAnyRole(["MANAGER", "DIRECTOR", "ADMIN"]);
}

/**
 * Check if the current user is a supervisor or higher
 */
export async function isSupervisor(): Promise<boolean> {
  return await hasAnyRole(["SUPERVISOR", "MANAGER", "DIRECTOR", "ADMIN"]);
}

/**
 * Check if the current user has finance role
 */
export async function isFinance(): Promise<boolean> {
  return await hasAnyRole(["FINANCE", "ADMIN"]);
}

/**
 * Check if the current user can approve at a specific level
 * @param level - The approval level (L1, L2, L3, L4, L5)
 */
export async function canApproveLevel(level: "L1" | "L2" | "L3" | "L4" | "L5"): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.role) return false;

  const role = session.user.role;

  switch (level) {
    case "L1":
      // L1: Supervisor and above
      return ["SUPERVISOR", "MANAGER", "DIRECTOR", "FINANCE", "ADMIN"].includes(role);
    case "L2":
      // L2: Manager and above
      return ["MANAGER", "DIRECTOR", "FINANCE", "ADMIN"].includes(role);
    case "L3":
      // L3: Director and above
      return ["DIRECTOR", "FINANCE", "ADMIN"].includes(role);
    case "L4":
    case "L5":
      // L4/L5: Senior leadership (Finance and Admin)
      return ["FINANCE", "ADMIN"].includes(role);
    default:
      return false;
  }
}

/**
 * Check if the current user can approve a specific user's request
 * @param requesterId - The ID of the user who created the request
 * @param approverId - The ID of the approver (optional, defaults to current user)
 */
export async function canApproveForUser(requesterId: string, approverId?: string): Promise<boolean> {
  const session = await auth();
  if (!session?.user) return false;

  const currentUserId = approverId ?? session.user.id;

  // Admins can approve any request
  if (session.user.role === "ADMIN") return true;

  // Finance can approve any request
  if (session.user.role === "FINANCE") return true;

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
    MANAGER: 3,
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