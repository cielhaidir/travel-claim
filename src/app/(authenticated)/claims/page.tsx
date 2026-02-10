import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Claims - Travel & Claim System",
  robots: { index: false, follow: false },
};

export default function ClaimsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Claims</h1>
          <p className="mt-2 text-gray-600">
            Submit and track your expense claims
          </p>
        </div>
        <a
          href="/claims/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          New Claim
        </a>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <select className="rounded-lg border border-gray-300 px-4 py-2 text-sm">
          <option>All Status</option>
          <option>Draft</option>
          <option>Submitted</option>
          <option>Approved</option>
          <option>Paid</option>
        </select>
        <select className="rounded-lg border border-gray-300 px-4 py-2 text-sm">
          <option>All Types</option>
          <option>Entertainment</option>
          <option>Non-Entertainment</option>
        </select>
        <select className="rounded-lg border border-gray-300 px-4 py-2 text-sm">
          <option>All Business Trip Requests</option>
        </select>
      </div>

      {/* Stats cards */}
      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-lg border bg-white p-6">
          <p className="text-sm text-gray-600">Total Claimed</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">$0</p>
          <p className="mt-2 text-sm text-gray-600">0 claims</p>
        </div>
        <div className="rounded-lg border bg-orange-50 p-6">
          <p className="text-sm text-orange-900">Pending Approval</p>
          <p className="mt-2 text-3xl font-bold text-orange-900">$0</p>
          <p className="mt-2 text-sm text-orange-800">0 claims</p>
        </div>
        <div className="rounded-lg border bg-green-50 p-6">
          <p className="text-sm text-green-900">Paid</p>
          <p className="mt-2 text-3xl font-bold text-green-900">$0</p>
          <p className="mt-2 text-sm text-green-800">0 claims</p>
        </div>
      </div>

      {/* List placeholder */}
      <div className="rounded-lg border bg-white">
        <div className="p-6">
          <div className="text-center py-12">
            <div className="text-6xl mb-4">💰</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No claims yet
            </h3>
            <p className="text-gray-600 mb-4">
              Submit your first expense claim to get reimbursed
            </p>
            <a
              href="/claims/new"
              className="inline-block rounded-lg bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Create Claim
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}