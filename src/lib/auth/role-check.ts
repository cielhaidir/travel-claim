import { normalizeRoles } from "@/lib/constants/roles";

type SessionUserLike = {
  roles?: string[] | null;
  role?: string | null;
};

export function getSessionUserRoles(user: SessionUserLike): string[] {
  return normalizeRoles({
    roles: user.roles,
    role: user.role,
  });
}

export function userHasAnyRole(
  user: SessionUserLike,
  allowedRoles: readonly string[],
): boolean {
  const roles = getSessionUserRoles(user);
  return allowedRoles.some((role) => roles.includes(role));
}

export function userHasRole(user: SessionUserLike, role: string): boolean {
  return getSessionUserRoles(user).includes(role);
}
