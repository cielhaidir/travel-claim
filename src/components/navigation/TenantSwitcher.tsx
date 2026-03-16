"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { startTransition, useState } from "react";
import type { Session } from "next-auth";

interface TenantSwitcherProps {
  session: Session;
}

export function TenantSwitcher({ session }: TenantSwitcherProps) {
  const router = useRouter();
  const { data, update } = useSession();
  const [isPending, setIsPending] = useState(false);

  const currentSession = data ?? session;
  const memberships =
    currentSession.user.memberships?.filter(
      (membership) => membership.status === "ACTIVE",
    ) ?? [];

  if (memberships.length === 0) {
    return (
      <div className="hidden rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 lg:inline-flex">
        <span className="truncate">No active tenant</span>
      </div>
    );
  }

  if (memberships.length === 1) {
    return (
      <div className="hidden max-w-72 items-center rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 lg:inline-flex">
        <p className="truncate text-sm font-medium text-gray-900">
          {memberships[0]?.tenantName}
        </p>
      </div>
    );
  }

  return (
    <label className="hidden max-w-72 items-center rounded-lg border border-gray-200 bg-white px-3 py-2 lg:inline-flex">
      <select
        value={currentSession.user.activeTenantId ?? ""}
        disabled={isPending}
        onChange={(event) => {
          const nextTenantId = event.target.value || null;
          setIsPending(true);
          void update({ activeTenantId: nextTenantId }).finally(() => {
            startTransition(() => {
              router.refresh();
              setIsPending(false);
            });
          });
        }}
        className="min-w-0 flex-1 bg-transparent text-sm font-medium text-gray-900 outline-none"
      >
        {memberships.map((membership) => (
          <option key={membership.tenantId} value={membership.tenantId}>
            {membership.tenantName}
            {membership.isRootTenant ? " (Root)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
