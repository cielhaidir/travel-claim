export function canApprove(roles: string[]): boolean {
  return roles.some((role) => ["SUPERVISOR", "MANAGER", "DIRECTOR", "ADMIN", "HR"].includes(role));
}
