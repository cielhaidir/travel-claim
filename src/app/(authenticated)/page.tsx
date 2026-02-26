"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/trpc/react";
import { StatusBadge } from "@/components/features/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import type { TravelStatus, ClaimStatus } from "../../../generated/prisma";

interface TravelRequestItem {
  id: string;
  requestNumber: string;
  destination: string;
  status: TravelStatus;
  startDate: string | Date;
  endDate: string | Date;
  estimatedBudget: number | null;
}

interface ClaimItem {
  id: string;
  claimNumber: string;
  claimType: string;
  status: ClaimStatus;
  amount: number;
  travelRequest: { requestNumber: string; destination: string };
}

interface DashboardData {
  travelRequests: {
    total: number;
    byStatus: { status: TravelStatus; count: number }[];
    recent: TravelRequestItem[];
  };
  claims: {
    total: number;
    byStatus: { status: ClaimStatus; count: number }[];
    recent: ClaimItem[];
  };
  approvals: { pending: number };
  notifications: { unread: number };
  team: { pendingRequests: number };
}

const APPROVER_ROLES = ["SUPERVISOR", "MANAGER", "DIRECTOR", "FINANCE_MANAGER", "ADMIN"];

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (!session?.user) return null;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { data: rawData, isLoading } = api.dashboard.getMyDashboard.useQuery(
    {},
    { refetchOnWindowFocus: false }
  );
  const data = rawData as DashboardData | undefined;

  const role = session.user.role ?? "EMPLOYEE";
  const isApprover = APPROVER_ROLES.includes(role);

  const totalTrips = data?.travelRequests.total ?? 0;
  const totalClaims = data?.claims.total ?? 0;
  const pendingApprovals = data?.approvals.pending ?? 0;
  const unreadNotifications = data?.notifications.unread ?? 0;

  // Count active trips (submitted/approved/locked)
  const activeTrips = data?.travelRequests.byStatus
    .filter((s) => ["SUBMITTED", "APPROVED", "APPROVED_L1", "APPROVED_L2", "LOCKED"].includes(s.status))
    .reduce((sum, s) => sum + s.count, 0) ?? 0;

  // Count pending claims (submitted)
  const pendingClaims = data?.claims.byStatus
    .filter((s) => ["SUBMITTED", "APPROVED"].includes(s.status))
    .reduce((sum, s) => sum + s.count, 0) ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-gray-600">Welcome back, {session.user.name}</p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Trips"
          value={isLoading ? "—" : String(totalTrips)}
          sub={`${activeTrips} active`}
          variant="info"
          href="/travel"
        />
        <StatCard
          label="Total Claims"
          value={isLoading ? "—" : String(totalClaims)}
          sub={`${pendingClaims} pending review`}
          variant="warning"
          href="/claims"
        />
        {isApprover && (
          <StatCard
            label="Pending Approvals"
            value={isLoading ? "—" : String(pendingApprovals)}
            sub="Requires your action"
            variant={pendingApprovals > 0 ? "danger" : "success"}
            href="/approvals"
          />
        )}
        <StatCard
          label="Notifications"
          value={isLoading ? "—" : String(unreadNotifications)}
          sub="Unread"
          variant="default"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Trip Requests */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-lg border bg-white">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Recent Trip Requests</h2>
              <a href="/travel" className="text-sm text-blue-600 hover:text-blue-800">View all →</a>
            </div>
            <div className="divide-y">
              {isLoading ? (
                <p className="px-6 py-8 text-center text-sm text-gray-500">Loading...</p>
              ) : !data?.travelRequests.recent.length ? (
                <p className="px-6 py-8 text-center text-sm text-gray-500">
                  No trip requests yet.{" "}
                  <a href="/travel" className="text-blue-600 hover:underline">Create one</a>
                </p>
              ) : (
                data.travelRequests.recent.map((tr) => (
                  <div key={tr.id} className="flex items-center justify-between px-6 py-3">
                    <div>
                      <span className="text-sm font-medium text-blue-600">{tr.requestNumber}</span>
                      <span className="ml-2 text-sm text-gray-700">{tr.destination}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">{formatDate(tr.startDate)}</span>
                      <StatusBadge status={tr.status} type="travel" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Claims */}
          <div className="rounded-lg border bg-white">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Recent Claims</h2>
              <a href="/claims" className="text-sm text-blue-600 hover:text-blue-800">View all →</a>
            </div>
            <div className="divide-y">
              {isLoading ? (
                <p className="px-6 py-8 text-center text-sm text-gray-500">Loading...</p>
              ) : !data?.claims.recent.length ? (
                <p className="px-6 py-8 text-center text-sm text-gray-500">
                  No claims yet.{" "}
                  <a href="/claims" className="text-blue-600 hover:underline">Submit one</a>
                </p>
              ) : (
                data.claims.recent.map((c) => (
                  <div key={c.id} className="flex items-center justify-between px-6 py-3">
                    <div>
                      <span className="text-sm font-medium text-blue-600">{c.claimNumber}</span>
                      <span className="ml-2 text-xs text-gray-500">
                        {c.claimType.replace("_", " ")} — {c.travelRequest.destination}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-900">
                        {formatCurrency(Number(c.amount), "IDR")}
                      </span>
                      <StatusBadge status={c.status} type="claim" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Quick Actions */}
          <div className="rounded-lg border bg-white p-6">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Quick Actions</h3>
            <div className="space-y-2">
              <QuickActionButton href="/travel" label="New Trip Request" />
              <QuickActionButton href="/claims" label="Submit Claim" />
              {isApprover && <QuickActionButton href="/approvals" label="View Approvals" />}
            </div>
          </div>

          {/* Pending Approvals banner for approvers */}
          {isApprover && pendingApprovals > 0 && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-6">
              <h3 className="mb-2 text-lg font-semibold text-orange-900">Action Required</h3>
              <p className="mb-4 text-sm text-orange-800">
                You have {pendingApprovals} pending approval{pendingApprovals !== 1 ? "s" : ""} requiring attention.
              </p>
              <a
                href="/approvals"
                className="inline-flex w-full items-center justify-center rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
              >
                Review Now
              </a>
            </div>
          )}

          {/* Status breakdown */}
          {data && data.travelRequests.byStatus.length > 0 && (
            <div className="rounded-lg border bg-white p-6">
              <h3 className="mb-4 text-base font-semibold text-gray-900">Trips by Status</h3>
              <div className="space-y-2">
                {data.travelRequests.byStatus.map((s) => (
                  <div key={s.status} className="flex items-center justify-between">
                    <StatusBadge status={s.status} type="travel" />
                    <span className="text-sm font-medium text-gray-700">{s.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  variant = "default",
  href,
}: {
  label: string;
  value: string;
  sub: string;
  variant?: "default" | "success" | "warning" | "info" | "danger";
  href?: string;
}) {
  const variantStyles: Record<string, string> = {
    default: "border-gray-200 bg-white",
    success: "border-green-200 bg-green-50",
    warning: "border-orange-200 bg-orange-50",
    info: "border-blue-200 bg-blue-50",
    danger: "border-red-200 bg-red-50",
  };

  const content = (
    <div className={`rounded-lg border p-6 ${variantStyles[variant]}`}>
      <p className="text-sm text-gray-600">{label}</p>
      <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
      <p className="mt-2 text-sm text-gray-500">{sub}</p>
    </div>
  );

  if (href) {
    return (
      <a href={href} className="block hover:opacity-90 transition-opacity">
        {content}
      </a>
    );
  }
  return content;
}

function QuickActionButton({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="flex w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
    >
      {label}
      <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </a>
  );
}

