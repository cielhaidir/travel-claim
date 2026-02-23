import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";

export const metadata: Metadata = {
  title: "Approvals - Travel & Claim System",
  robots: { index: false, follow: false },
};

const APPROVER_ROLES = [
  "SUPERVISOR",
  "MANAGER",
  "DIRECTOR",
  "FINANCE_MANAGER",
  "ADMIN",
];

export default async function ApprovalsPage() {
  const session = await auth();
  const userRole = session?.user?.role ?? "EMPLOYEE";

  // Redirect employees to dashboard
  if (!APPROVER_ROLES.includes(userRole)) {
    redirect("/");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Approvals</h1>
          <p className="mt-2 text-gray-600">
            Review and approve pending requests and claims
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-6">
          <p className="text-sm text-orange-900">Pending Your Approval</p>
          <p className="mt-2 text-3xl font-bold text-orange-900">0</p>
          <p className="mt-2 text-sm text-orange-800">Requires action</p>
        </div>
        <div className="rounded-lg border bg-white p-6">
          <p className="text-sm text-gray-600">Approved Today</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">0</p>
          <p className="mt-2 text-sm text-gray-600">Items processed</p>
        </div>
        <div className="rounded-lg border bg-white p-6">
          <p className="text-sm text-gray-600">Average Time</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">-</p>
          <p className="mt-2 text-sm text-gray-600">To approve</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <select className="rounded-lg border border-gray-300 px-4 py-2 text-sm">
          <option>All Types</option>
          <option>Business Trip Requests</option>
          <option>Claims</option>
        </select>
        <select className="rounded-lg border border-gray-300 px-4 py-2 text-sm">
          <option>All Status</option>
          <option>Pending</option>
          <option>Approved</option>
          <option>Rejected</option>
        </select>
        <input
          type="text"
          placeholder="Search by requester..."
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm"
        />
      </div>

      {/* Pending approvals list */}
      <div className="rounded-lg border bg-white">
        <div className="border-b p-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Pending Approvals
          </h2>
        </div>
        <div className="p-6">
          <div className="text-center py-12">
            <div className="text-6xl mb-4">✅</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No pending approvals
            </h3>
            <p className="text-gray-600">
              You&apos;re all caught up! Check back later for new items.
            </p>
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div className="rounded-lg border bg-white">
        <div className="border-b p-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Recent Activity
          </h2>
        </div>
        <div className="p-6">
          <div className="text-center py-8 text-gray-500">
            No recent approval activity
          </div>
        </div>
      </div>
    </div>
  );
}