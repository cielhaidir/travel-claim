"use client";

import Link from "next/link";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { PageHeader } from "@/components/features/PageHeader";
import { CrmEmptyHint, CrmMetricCard, crmInputClassName } from "@/components/features/crm/shared";
import { userHasPermission } from "@/lib/auth/role-check";
import { formatDate } from "@/lib/utils/format";
import { api } from "@/trpc/react";

export default function CrmNotesPage() {
  const { data: session } = useSession();
  const isAllowed = session?.user ? userHasPermission(session.user, "crm", "read") : false;
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch } = api.crm.listNotes.useQuery(
    { search: search || undefined },
    { enabled: isAllowed, refetchOnWindowFocus: false },
  );

  const notes = data ?? [];

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM Notes"
        description="Aggregate notes across all leads and deals."
        primaryAction={{ label: "Refresh", onClick: () => void refetch() }}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <CrmMetricCard label="Notes" value={String(notes.length)} />
        <CrmMetricCard label="Lead Notes" value={String(notes.filter((note) => !!note.lead).length)} />
        <CrmMetricCard label="Deal Notes" value={String(notes.filter((note) => !!note.deal).length)} />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search note title, content, writer, lead, or deal"
          className={crmInputClassName}
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">All Notes</h2>
        </div>

        {isLoading ? (
          <div className="p-5 text-sm text-gray-500">Loading notes...</div>
        ) : notes.length === 0 ? (
          <div className="p-5">
            <CrmEmptyHint text="No CRM notes available." />
          </div>
        ) : (
          <div className="grid gap-3 p-5 xl:grid-cols-2">
            {notes.map((note) => (
              <div key={note.id} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">{note.title}</p>
                    <p className="mt-1 text-xs uppercase tracking-wide text-gray-400">{note.writerName ?? "Unknown writer"}</p>
                  </div>
                  <span className="text-xs text-gray-500">{formatDate(note.updatedAt)}</span>
                </div>
                <p className="mt-3 text-sm text-gray-600 whitespace-pre-wrap">{note.content}</p>
                <p className="mt-4 text-sm">
                  {note.lead ? (
                    <Link href={`/crm/leads/${note.lead.id}`} className="font-medium text-blue-600 hover:text-blue-700">
                      {note.lead.company}
                    </Link>
                  ) : note.deal ? (
                    <Link href={`/crm/deals/${note.deal.id}`} className="font-medium text-blue-600 hover:text-blue-700">
                      {note.deal.title}
                    </Link>
                  ) : (
                    "-"
                  )}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
