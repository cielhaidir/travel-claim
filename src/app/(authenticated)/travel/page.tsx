import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Business Trip Requests - Travel & Claim System",
  robots: { index: false, follow: false },
};

export default function TravelRequestsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Business Trip Requests</h1>
          <p className="mt-2 text-gray-600">
            Manage and track your business trip requests
          </p>
        </div>
        <a
          href="/travel/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          New Request
        </a>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <select className="rounded-lg border border-gray-300 px-4 py-2 text-sm">
          <option>All Status</option>
          <option>Draft</option>
          <option>Submitted</option>
          <option>Approved</option>
          <option>Locked</option>
        </select>
        <select className="rounded-lg border border-gray-300 px-4 py-2 text-sm">
          <option>All Types</option>
          <option>Business</option>
          <option>Training</option>
          <option>Conference</option>
        </select>
        <input
          type="date"
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm"
          placeholder="Start date"
        />
      </div>

      {/* List placeholder */}
      <div className="rounded-lg border bg-white">
        <div className="p-6">
          <div className="text-center py-12">
            <div className="text-6xl mb-4">✈️</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No business trip requests yet
            </h3>
            <p className="text-gray-600 mb-4">
              Get started by creating your first business trip request
            </p>
            <a
              href="/travel/new"
              className="inline-block rounded-lg bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Create Business Trip Request
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}