import { normalizeRoles } from "@/lib/constants/roles";
import {
  hasPermissionMap,
  type PermissionAction,
  type PermissionMap,
} from "@/lib/auth/permissions";

type SessionUserLike = {
  roles?: string[] | null;
  role?: string | null;
  isRoot?: boolean | null;
  permissions?: PermissionMap | null;
};

export function getSessionUserRoles(user: SessionUserLike): string[] {
  return normalizeRoles({
    roles: user.roles,
    role: user.role,
  });
}

function hasRootSessionAccess(user: SessionUserLike): boolean {
  if (user.isRoot === true) {
    return true;
  }

  if (getSessionUserRoles(user).includes("ROOT")) {
    return true;
  }
  return false;
}

export function userHasAnyRole(
  user: SessionUserLike,
  allowedRoles: readonly string[],
): boolean {
  if (hasRootSessionAccess(user)) {
    return true;
  }

  const roles = getSessionUserRoles(user);
  return allowedRoles.some((role) => roles.includes(role));
}

export function userHasRole(user: SessionUserLike, role: string): boolean {
  if (hasRootSessionAccess(user)) {
    return true;
  }

  return getSessionUserRoles(user).includes(role);
}

export function userHasPermission(
  user: SessionUserLike,
  moduleKey: string,
  action: PermissionAction = "read",
): boolean {
  if (hasRootSessionAccess(user)) {
    return true;
  }

  return hasPermissionMap(user.permissions, moduleKey, action);
}
