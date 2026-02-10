import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard - Travel & Claim System",
  description: "Your personalized dashboard for business trip requests and claims",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  // Role-based dashboard content will be rendered here
  const role = session.user.role ?? "EMPLOYEE";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-gray-600">
          Welcome back, {session.user.name}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Pending Approvals"
          value="3"
          trend="+2"
          variant="info"
        />
        <StatCard
          label="Open Claims"
          value="5"
          trend="-1"
          variant="warning"
        />
        <StatCard
          label="Upcoming Travel"
          value="2"
          trend="0"
          variant="success"
        />
        <StatCard
          label="Total Spent"
          value="$12,450"
          trend="+15%"
          variant="default"
        />
      </div>

      {/* Role-specific content */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="rounded-lg border bg-white p-6">
            <h2 className="mb-4 text-xl font-semibold text-gray-900">
              Recent Activity
            </h2>
            <div className="space-y-4">
              <ActivityItem
                title="Business Trip Request #TR-2024-001 approved"
                description="Your business trip request to Singapore has been approved by your manager"
                timestamp="2 hours ago"
                type="success"
              />
              <ActivityItem
                title="Claim #CL-2024-015 pending review"
                description="Entertainment claim for client dinner awaiting approval"
                timestamp="5 hours ago"
                type="warning"
              />
              <ActivityItem
                title="Business Trip Request #TR-2024-002 submitted"
                description="Conference travel to Jakarta submitted for approval"
                timestamp="1 day ago"
                type="info"
              />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border bg-white p-6">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">
              Quick Actions
            </h3>
            <div className="space-y-2">
              <QuickActionButton href="/travel/new" label="New Business Trip Request" />
              <QuickActionButton href="/claims/new" label="Submit Claim" />
              <QuickActionButton href="/approvals" label="View Approvals" />
            </div>
          </div>

          {role !== "EMPLOYEE" && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-6">
              <h3 className="mb-2 text-lg font-semibold text-orange-900">
                Action Required
              </h3>
              <p className="mb-4 text-sm text-orange-800">
                You have 3 pending approvals requiring your attention
              </p>
              <a
                href="/approvals"
                className="inline-flex w-full items-center justify-center rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
              >
                Review Now
              </a>
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
  trend,
  variant = "default",
}: {
  label: string;
  value: string;
  trend: string;
  variant?: "default" | "success" | "warning" | "info";
}) {
  const variantStyles = {
    default: "border-gray-200 bg-white",
    success: "border-green-200 bg-green-50",
    warning: "border-orange-200 bg-orange-50",
    info: "border-blue-200 bg-blue-50",
  };

  return (
    <div className={`rounded-lg border p-6 ${variantStyles[variant]}`}>
      <p className="text-sm text-gray-600">{label}</p>
      <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
      <p className="mt-2 text-sm text-gray-600">{trend} from last month</p>
    </div>
  );
}

function ActivityItem({
  title,
  description,
  timestamp,
  type,
}: {
  title: string;
  description: string;
  timestamp: string;
  type: "success" | "warning" | "info";
}) {
  const typeStyles = {
    success: "bg-green-100 text-green-800",
    warning: "bg-orange-100 text-orange-800",
    info: "bg-blue-100 text-blue-800",
  };

  return (
    <div className="flex gap-4 border-b pb-4 last:border-0">
      <div className={`mt-1 h-2 w-2 rounded-full ${typeStyles[type]}`} />
      <div className="flex-1">
        <h4 className="font-semibold text-gray-900">{title}</h4>
        <p className="mt-1 text-sm text-gray-600">{description}</p>
        <p className="mt-1 text-xs text-gray-500">{timestamp}</p>
      </div>
    </div>
  );
}

function QuickActionButton({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <a
      href={href}
      className="flex w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
    >
      {label}
      <svg
        className="h-5 w-5 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 5l7 7-7 7"
        />
      </svg>
    </a>
  );
}