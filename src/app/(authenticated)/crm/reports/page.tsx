"use client";

import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/features/PageHeader";
import { CRM_ROLES, hasAnyRole, normalizeRoles } from "@/lib/constants/roles";
import { formatCurrency } from "@/lib/utils/format";
import { api } from "@/trpc/react";

const STAGE_ORDER = ["NEW", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"] as const;

export default function CrmReportsPage() {
  const { data: session } = useSession();
  const userRoles = normalizeRoles({
    roles: session?.user?.roles,
    role: session?.user?.role,
  });
  const isAllowed = session?.user?.isRoot === true || hasAnyRole(userRoles, CRM_ROLES);

  const { data, isLoading, refetch } = api.crm.dashboard.useQuery(
    {},
    { enabled: isAllowed, refetchOnWindowFocus: false },
  );

  const report = useMemo(() => {
    const customers = data?.customers ?? [];
    const leads = data?.leads ?? [];
    const activities = data?.activities ?? [];

    const totalPipelineValue = leads.reduce(
      (sum, lead) => sum + Number(lead.value ?? 0),
      0,
    );
    const weightedForecast = leads.reduce(
      (sum, lead) => sum + (Number(lead.value ?? 0) * Number(lead.probability ?? 0)) / 100,
      0,
    );
    const wonCount = leads.filter((lead) => lead.stage === "WON").length;
    const activeDeals = leads.filter((lead) => !["WON", "LOST"].includes(lead.stage)).length;
    const conversionRate = leads.length > 0 ? Math.round((wonCount / leads.length) * 100) : 0;

    const stageBreakdown = STAGE_ORDER.map((stage) => {
      const stageLeads = leads.filter((lead) => lead.stage === stage);
      return {
        stage,
        count: stageLeads.length,
        value: stageLeads.reduce((sum, lead) => sum + Number(lead.value ?? 0), 0),
      };
    });

    const ownerPerformance = Array.from(
      new Map(
        leads.map((lead) => [lead.ownerName, lead.ownerName]),
      ).values(),
    )
      .map((owner) => {
        const ownerLeads = leads.filter((lead) => lead.ownerName === owner);
        const ownerValue = ownerLeads.reduce((sum, lead) => sum + Number(lead.value ?? 0), 0);
        const ownerWon = ownerLeads.filter((lead) => lead.stage === "WON").length;
        return {
          owner,
          totalLeads: ownerLeads.length,
          totalValue: ownerValue,
          wonDeals: ownerWon,
          conversionRate:
            ownerLeads.length > 0 ? Math.round((ownerWon / ownerLeads.length) * 100) : 0,
        };
      })
      .sort((a, b) => b.totalValue - a.totalValue);

    const sourceBreakdown = Array.from(
      new Map(
        leads.map((lead) => [lead.source, { source: lead.source, count: 0, value: 0 }]),
      ).values(),
    )
      .map((row) => {
        const sourceLeads = leads.filter((lead) => lead.source === row.source);
        return {
          source: row.source,
          count: sourceLeads.length,
          value: sourceLeads.reduce((sum, lead) => sum + Number(lead.value ?? 0), 0),
        };
      })
      .sort((a, b) => b.value - a.value);

    const completedActivities = activities.filter((activity) => activity.completedAt).length;

    return {
      customers,
      leads,
      totalPipelineValue,
      weightedForecast,
      wonCount,
      activeDeals,
      conversionRate,
      stageBreakdown,
      ownerPerformance,
      sourceBreakdown,
      completedActivities,
    };
  }, [data]);

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM Reports"
        description="Laporan ringkas CRM untuk pipeline, owner performance, source breakdown, dan forecasting."
        primaryAction={{ label: "CRM Dashboard", href: "/crm" }}
        secondaryAction={{ label: "Muat Ulang", onClick: () => void refetch() }}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Total Customers" value={String(report.customers.length)} helper="Customer aktif di CRM" />
        <SummaryCard label="Active Deals" value={String(report.activeDeals)} helper="Lead/deal yang masih berjalan" />
        <SummaryCard label="Conversion Rate" value={`${report.conversionRate}%`} helper="Won deals dari total leads" />
        <SummaryCard label="Weighted Forecast" value={formatCurrency(report.weightedForecast)} helper="Forecast berdasarkan probability" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Pipeline Summary</h2>
            <p className="text-sm text-gray-500">Distribusi stage dan nilai pipeline per tahapan</p>
          </div>
          {isLoading ? (
            <div className="p-5 text-sm text-gray-500">Memuat ringkasan pipeline...</div>
          ) : (
            <div className="space-y-3 p-5">
              {report.stageBreakdown.map((row) => (
                <div key={row.stage} className="rounded-lg border border-gray-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900">{row.stage}</p>
                      <p className="text-sm text-gray-500">{row.count} lead/deal</p>
                    </div>
                    <Badge variant="info">{formatCurrency(row.value)}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-gray-900">KPI Summary</h2>
            <p className="text-sm text-gray-500">Ringkasan performa utama CRM</p>
          </div>
          <div className="grid gap-4 p-5 md:grid-cols-2">
            <MiniMetric label="Total Pipeline Value" value={formatCurrency(report.totalPipelineValue)} />
            <MiniMetric label="Won Deals" value={String(report.wonCount)} tone="green" />
            <MiniMetric label="Completed Activities" value={String(report.completedActivities)} tone="green" />
            <MiniMetric label="Total Leads" value={String(report.leads.length)} />
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Owner Performance</h2>
            <p className="text-sm text-gray-500">Performa pipeline dan conversion per owner</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Owner</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Leads</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Won</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Conversion</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {report.ownerPerformance.map((row) => (
                  <tr key={row.owner}>
                    <td className="px-4 py-3 font-medium text-gray-900">{row.owner}</td>
                    <td className="px-4 py-3 text-gray-600">{row.totalLeads}</td>
                    <td className="px-4 py-3 text-gray-600">{row.wonDeals}</td>
                    <td className="px-4 py-3 text-gray-600">{row.conversionRate}%</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(row.totalValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Lead Source Breakdown</h2>
            <p className="text-sm text-gray-500">Sumber lead dan total opportunity value</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Jumlah</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Opportunity Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {report.sourceBreakdown.map((row) => (
                  <tr key={row.source}>
                    <td className="px-4 py-3 font-medium text-gray-900">{row.source}</td>
                    <td className="px-4 py-3 text-gray-600">{row.count}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(row.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
      <p className="mt-2 text-xs text-gray-500">{helper}</p>
    </div>
  );
}

function MiniMetric({ label, value, tone = "blue" }: { label: string; value: string; tone?: "blue" | "green" }) {
  return (
    <div className={`rounded-lg p-4 ${tone === "green" ? "bg-green-50" : "bg-blue-50"}`}>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}
