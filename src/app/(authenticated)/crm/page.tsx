"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmModal, Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/features/PageHeader";
import { StatCard } from "@/components/features/StatCard";
import { userHasPermission } from "@/lib/auth/role-check";
import { cn, formatCurrency, formatDate, formatRelativeTime } from "@/lib/utils/format";
import { api, type RouterOutputs } from "@/trpc/react";

type PipelineStage = "NEW" | "QUALIFIED" | "PROPOSAL" | "NEGOTIATION" | "WON" | "LOST";
type LeadPriority = "LOW" | "MEDIUM" | "HIGH";
type LeadSource = "REFERRAL" | "WEBSITE" | "EVENT" | "OUTBOUND" | "PARTNER";
type CustomerSegment = "ENTERPRISE" | "SMB" | "GOVERNMENT" | "EDUCATION";
type CustomerStatus = "ACTIVE" | "INACTIVE" | "VIP";
type ActivityType = "CALL" | "MEETING" | "EMAIL" | "FOLLOW_UP";

type DashboardData = RouterOutputs["crm"]["dashboard"];
type CustomerItem = DashboardData["customers"][number];
type LeadItem = DashboardData["leads"][number];
type ActivityItem = DashboardData["activities"][number];

type CustomerFormState = {
  name: string;
  company: string;
  email: string;
  phone: string;
  segment: CustomerSegment;
  city: string;
  ownerName: string;
  status: CustomerStatus;
  totalValue: string;
  notes: string;
};

type LeadFormState = {
  customerId: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  stage: PipelineStage;
  value: string;
  probability: string;
  source: LeadSource;
  priority: LeadPriority;
  ownerName: string;
  expectedCloseDate: string;
  notes: string;
};

type ActivityFormState = {
  customerId: string;
  leadId: string;
  title: string;
  description: string;
  type: ActivityType;
  ownerName: string;
  scheduledAt: string;
};

type ConfirmState = {
  title: string;
  message: string;
  confirmLabel: string;
  variant: "danger" | "warning";
  isLoading?: boolean;
  onConfirm: () => void | Promise<void>;
};

type CustomerSortKey = "company" | "ownerName" | "totalValue";
type LeadSortKey = "company" | "ownerName" | "value" | "probability" | "stage";
type ActivitySortKey = "scheduledAt" | "ownerName" | "type" | "status";
type SortDirection = "asc" | "desc";
type CalendarDay = {
  date: Date;
  iso: string;
  inCurrentMonth: boolean;
  activities: ActivityItem[];
};

const PIPELINE_STAGES: PipelineStage[] = [
  "NEW",
  "QUALIFIED",
  "PROPOSAL",
  "NEGOTIATION",
  "WON",
  "LOST",
];

const STAGE_LABELS: Record<PipelineStage, string> = {
  NEW: "Lead Baru",
  QUALIFIED: "Qualified",
  PROPOSAL: "Proposal",
  NEGOTIATION: "Negotiation",
  WON: "Won",
  LOST: "Lost",
};

const SOURCE_LABELS: Record<LeadSource, string> = {
  REFERRAL: "Referral",
  WEBSITE: "Website",
  EVENT: "Event",
  OUTBOUND: "Outbound",
  PARTNER: "Partner",
};

const SEGMENT_LABELS: Record<CustomerSegment, string> = {
  ENTERPRISE: "Enterprise",
  SMB: "SMB",
  GOVERNMENT: "Government",
  EDUCATION: "Education",
};

const STAGE_BADGE_VARIANTS: Record<PipelineStage, "default" | "info" | "warning" | "success" | "danger"> = {
  NEW: "default",
  QUALIFIED: "info",
  PROPOSAL: "warning",
  NEGOTIATION: "warning",
  WON: "success",
  LOST: "danger",
};

const PRIORITY_BADGE_VARIANTS: Record<LeadPriority, "default" | "warning" | "danger"> = {
  LOW: "default",
  MEDIUM: "warning",
  HIGH: "danger",
};

const CUSTOMER_STATUS_BADGE: Record<CustomerStatus, "default" | "success" | "warning"> = {
  ACTIVE: "success",
  INACTIVE: "default",
  VIP: "warning",
};

const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  CALL: "Call",
  MEETING: "Meeting",
  EMAIL: "Email",
  FOLLOW_UP: "Follow Up",
};

const DEFAULT_CUSTOMER_FORM: CustomerFormState = {
  name: "",
  company: "",
  email: "",
  phone: "",
  segment: "SMB",
  city: "",
  ownerName: "",
  status: "ACTIVE",
  totalValue: "",
  notes: "",
};

const DEFAULT_LEAD_FORM: LeadFormState = {
  customerId: "",
  name: "",
  company: "",
  email: "",
  phone: "",
  stage: "NEW",
  value: "",
  probability: "25",
  source: "REFERRAL",
  priority: "MEDIUM",
  ownerName: "",
  expectedCloseDate: "",
  notes: "",
};

const DEFAULT_ACTIVITY_FORM: ActivityFormState = {
  customerId: "",
  leadId: "",
  title: "",
  description: "",
  type: "FOLLOW_UP",
  ownerName: "",
  scheduledAt: "",
};

function pct(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

function toInputDate(value: string | Date | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function toInputDateTime(value: string | Date | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function getActivityReminder(activity: ActivityItem) {
  if (activity.completedAt) {
    return { label: "Completed", variant: "success" as const };
  }

  const now = Date.now();
  const scheduled = new Date(activity.scheduledAt).getTime();
  if (scheduled < now) {
    return { label: "Overdue", variant: "danger" as const };
  }

  const within24Hours = scheduled - now <= 24 * 60 * 60 * 1000;
  if (within24Hours) {
    return { label: "Due Soon", variant: "warning" as const };
  }

  return { label: "Upcoming", variant: "info" as const };
}

function sortCustomers(items: CustomerItem[], key: CustomerSortKey, direction: SortDirection) {
  const sorted = [...items].sort((a, b) => {
    switch (key) {
      case "ownerName":
        return a.ownerName.localeCompare(b.ownerName);
      case "totalValue":
        return Number(a.totalValue ?? 0) - Number(b.totalValue ?? 0);
      case "company":
      default:
        return a.company.localeCompare(b.company);
    }
  });

  return direction === "asc" ? sorted : sorted.reverse();
}

function sortLeads(items: LeadItem[], key: LeadSortKey, direction: SortDirection) {
  const sorted = [...items].sort((a, b) => {
    switch (key) {
      case "ownerName":
        return a.ownerName.localeCompare(b.ownerName);
      case "value":
        return Number(a.value ?? 0) - Number(b.value ?? 0);
      case "probability":
        return a.probability - b.probability;
      case "stage":
        return a.stage.localeCompare(b.stage);
      case "company":
      default:
        return a.company.localeCompare(b.company);
    }
  });

  return direction === "asc" ? sorted : sorted.reverse();
}

function sortActivities(items: ActivityItem[], key: ActivitySortKey, direction: SortDirection) {
  const sorted = [...items].sort((a, b) => {
    switch (key) {
      case "ownerName":
        return a.ownerName.localeCompare(b.ownerName);
      case "type":
        return a.type.localeCompare(b.type);
      case "status":
        return getActivityReminder(a).label.localeCompare(getActivityReminder(b).label);
      case "scheduledAt":
      default:
        return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
    }
  });

  return direction === "asc" ? sorted : sorted.reverse();
}

function paginate<T>(items: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    totalPages,
    page: safePage,
    totalItems: items.length,
  };
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toIsoDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function sameDay(a: Date, b: Date) {
  return toIsoDay(a) === toIsoDay(b);
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
  }).format(date);
}

export default function CrmPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const trpc = api.useUtils();
  const { showToast } = useToast();

  const canReadCrm = session?.user ? userHasPermission(session.user, "crm", "read") : false;
  const canCreateCrm = session?.user ? userHasPermission(session.user, "crm", "create") : false;
  const canUpdateCrm = session?.user ? userHasPermission(session.user, "crm", "update") : false;
  const canDeleteCrm = session?.user ? userHasPermission(session.user, "crm", "delete") : false;
  const isAllowed = canReadCrm;

  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<PipelineStage | "ALL">("ALL");
  const [ownerFilter, setOwnerFilter] = useState("ALL");
  const [selectedStage, setSelectedStage] = useState<PipelineStage | "ALL">("ALL");
  const [draggingLeadId, setDraggingLeadId] = useState<string | null>(null);
  const [customerSortKey, setCustomerSortKey] = useState<CustomerSortKey>("company");
  const [customerSortDirection, setCustomerSortDirection] = useState<SortDirection>("asc");
  const [customerPage, setCustomerPage] = useState(1);
  const [leadSortKey, setLeadSortKey] = useState<LeadSortKey>("company");
  const [leadSortDirection, setLeadSortDirection] = useState<SortDirection>("asc");
  const [leadPage, setLeadPage] = useState(1);
  const [activitySortKey, setActivitySortKey] = useState<ActivitySortKey>("scheduledAt");
  const [activitySortDirection, setActivitySortDirection] = useState<SortDirection>("asc");
  const [activityPage, setActivityPage] = useState(1);
  const [calendarMonth, setCalendarMonth] = useState(() => startOfDay(new Date()));
  const [selectedCalendarDay, setSelectedCalendarDay] = useState(() => toIsoDay(new Date()));

  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);

  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);

  const [customerForm, setCustomerForm] = useState<CustomerFormState>(DEFAULT_CUSTOMER_FORM);
  const [leadForm, setLeadForm] = useState<LeadFormState>(DEFAULT_LEAD_FORM);
  const [activityForm, setActivityForm] = useState<ActivityFormState>(DEFAULT_ACTIVITY_FORM);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  useEffect(() => {
    if (session && !isAllowed) {
      void router.replace("/dashboard");
    }
  }, [session, isAllowed, router]);

  useEffect(() => {
    setCustomerPage(1);
    setLeadPage(1);
    setActivityPage(1);
  }, [search, stageFilter, ownerFilter]);

  const dashboardQuery = api.crm.dashboard.useQuery(
    {
      search: search || undefined,
      stage: stageFilter === "ALL" ? undefined : stageFilter,
      owner: ownerFilter === "ALL" ? undefined : ownerFilter,
    },
    {
      enabled: isAllowed,
      refetchOnWindowFocus: false,
    },
  );

  const customers = useMemo<DashboardData["customers"]>(
    () => dashboardQuery.data?.customers ?? [],
    [dashboardQuery.data?.customers],
  );
  const leads = useMemo<DashboardData["leads"]>(
    () => dashboardQuery.data?.leads ?? [],
    [dashboardQuery.data?.leads],
  );
  const activities = useMemo<DashboardData["activities"]>(
    () => dashboardQuery.data?.activities ?? [],
    [dashboardQuery.data?.activities],
  );
  const owners = useMemo<DashboardData["owners"]>(
    () => dashboardQuery.data?.owners ?? [],
    [dashboardQuery.data?.owners],
  );

  async function refreshDashboard() {
    await trpc.crm.dashboard.invalidate();
  }

  const createCustomerMutation = api.crm.createCustomer.useMutation({
    onSuccess: async () => {
      await refreshDashboard();
      setCustomerForm(DEFAULT_CUSTOMER_FORM);
      setEditingCustomerId(null);
      setIsCustomerModalOpen(false);
      showToast({ title: "Berhasil", message: "Customer berhasil ditambahkan.", variant: "success" });
    },
    onError: (error) => {
      showToast({ title: "Gagal", message: error.message, variant: "error" });
    },
  });

  const updateCustomerMutation = api.crm.updateCustomer.useMutation({
    onSuccess: async () => {
      await refreshDashboard();
      setCustomerForm(DEFAULT_CUSTOMER_FORM);
      setEditingCustomerId(null);
      setIsCustomerModalOpen(false);
      showToast({ title: "Berhasil", message: "Customer berhasil diperbarui.", variant: "success" });
    },
    onError: (error) => {
      showToast({ title: "Gagal", message: error.message, variant: "error" });
    },
  });

  const deleteCustomerMutation = api.crm.deleteCustomer.useMutation({
    onSuccess: async () => {
      await refreshDashboard();
      showToast({ title: "Berhasil", message: "Customer berhasil dihapus.", variant: "success" });
    },
    onError: (error) => {
      showToast({ title: "Gagal", message: error.message, variant: "error" });
    },
  });

  const createLeadMutation = api.crm.createLead.useMutation({
    onSuccess: async () => {
      await refreshDashboard();
      setLeadForm(DEFAULT_LEAD_FORM);
      setEditingLeadId(null);
      setIsLeadModalOpen(false);
      showToast({ title: "Berhasil", message: "Lead berhasil ditambahkan.", variant: "success" });
    },
    onError: (error) => {
      showToast({ title: "Gagal", message: error.message, variant: "error" });
    },
  });

  const updateLeadMutation = api.crm.updateLead.useMutation({
    onSuccess: async () => {
      await refreshDashboard();
      setLeadForm(DEFAULT_LEAD_FORM);
      setEditingLeadId(null);
      setIsLeadModalOpen(false);
      showToast({ title: "Berhasil", message: "Lead berhasil diperbarui.", variant: "success" });
    },
    onError: (error) => {
      showToast({ title: "Gagal", message: error.message, variant: "error" });
    },
  });

  const updateLeadStageMutation = api.crm.updateLeadStage.useMutation({
    onSuccess: async () => {
      await refreshDashboard();
      showToast({ title: "Berhasil", message: "Stage lead berhasil diperbarui.", variant: "success" });
    },
    onError: (error) => {
      showToast({ title: "Gagal", message: error.message, variant: "error" });
    },
  });

  const deleteLeadMutation = api.crm.deleteLead.useMutation({
    onSuccess: async () => {
      await refreshDashboard();
      showToast({ title: "Berhasil", message: "Lead berhasil dihapus.", variant: "success" });
    },
    onError: (error) => {
      showToast({ title: "Gagal", message: error.message, variant: "error" });
    },
  });

  const convertLeadMutation = api.crm.convertLeadToCustomer.useMutation({
    onSuccess: async () => {
      await refreshDashboard();
      showToast({ title: "Berhasil", message: "Lead berhasil dikonversi menjadi customer.", variant: "success" });
    },
    onError: (error) => {
      showToast({ title: "Gagal", message: error.message, variant: "error" });
    },
  });

  const createActivityMutation = api.crm.createActivity.useMutation({
    onSuccess: async () => {
      await refreshDashboard();
      setActivityForm(DEFAULT_ACTIVITY_FORM);
      setEditingActivityId(null);
      setIsActivityModalOpen(false);
      showToast({ title: "Berhasil", message: "Aktivitas CRM berhasil ditambahkan.", variant: "success" });
    },
    onError: (error) => {
      showToast({ title: "Gagal", message: error.message, variant: "error" });
    },
  });

  const updateActivityMutation = api.crm.updateActivity.useMutation({
    onSuccess: async () => {
      await refreshDashboard();
      setActivityForm(DEFAULT_ACTIVITY_FORM);
      setEditingActivityId(null);
      setIsActivityModalOpen(false);
      showToast({ title: "Berhasil", message: "Aktivitas CRM berhasil diperbarui.", variant: "success" });
    },
    onError: (error) => {
      showToast({ title: "Gagal", message: error.message, variant: "error" });
    },
  });

  const completeActivityMutation = api.crm.completeActivity.useMutation({
    onSuccess: async () => {
      await refreshDashboard();
      showToast({ title: "Berhasil", message: "Status aktivitas berhasil diperbarui.", variant: "success" });
    },
    onError: (error) => {
      showToast({ title: "Gagal", message: error.message, variant: "error" });
    },
  });

  const deleteActivityMutation = api.crm.deleteActivity.useMutation({
    onSuccess: async () => {
      await refreshDashboard();
      showToast({ title: "Berhasil", message: "Aktivitas berhasil dihapus.", variant: "success" });
    },
    onError: (error) => {
      showToast({ title: "Gagal", message: error.message, variant: "error" });
    },
  });

  const sortedCustomers = useMemo(
    () => sortCustomers(customers, customerSortKey, customerSortDirection),
    [customerSortDirection, customerSortKey, customers],
  );
  const sortedLeads = useMemo(
    () => sortLeads(leads, leadSortKey, leadSortDirection),
    [leadSortDirection, leadSortKey, leads],
  );
  const sortedActivities = useMemo(
    () => sortActivities(activities, activitySortKey, activitySortDirection),
    [activities, activitySortDirection, activitySortKey],
  );

  const paginatedCustomers = useMemo(
    () => paginate(sortedCustomers, customerPage, 5),
    [customerPage, sortedCustomers],
  );
  const paginatedLeads = useMemo(
    () => paginate(sortedLeads, leadPage, 5),
    [leadPage, sortedLeads],
  );
  const paginatedActivities = useMemo(
    () => paginate(sortedActivities, activityPage, 5),
    [activityPage, sortedActivities],
  );

  const boardLeads = useMemo(
    () => leads.filter((lead) => selectedStage === "ALL" || lead.stage === selectedStage),
    [leads, selectedStage],
  );

  const pipelineSummary = useMemo(
    () =>
      PIPELINE_STAGES.map((stage) => {
        const items = boardLeads.filter((lead) => lead.stage === stage);
        const totalValue = items.reduce(
          (sum, lead) => sum + Number(lead.value ?? 0),
          0,
        );
        return { stage, items, totalValue, total: items.length };
      }),
    [boardLeads],
  );

  const totalPipelineValue = useMemo(
    () => leads.reduce((sum, lead) => sum + Number(lead.value ?? 0), 0),
    [leads],
  );

  const weightedForecast = useMemo(
    () =>
      leads.reduce(
        (sum, lead) =>
          sum + (Number(lead.value ?? 0) * Number(lead.probability ?? 0)) / 100,
        0,
      ),
    [leads],
  );

  const wonDeals = useMemo(
    () => leads.filter((lead) => lead.stage === "WON").length,
    [leads],
  );

  const activityStats = useMemo(() => {
    const now = Date.now();
    const today = startOfDay(new Date()).getTime();
    let overdue = 0;
    let upcoming = 0;
    let completed = 0;
    let todayCount = 0;

    for (const activity of activities) {
      const scheduledTime = new Date(activity.scheduledAt).getTime();
      const scheduledDay = startOfDay(new Date(activity.scheduledAt)).getTime();

      if (activity.completedAt) {
        completed += 1;
      } else if (scheduledTime < now) {
        overdue += 1;
      } else {
        upcoming += 1;
      }

      if (scheduledDay === today) {
        todayCount += 1;
      }
    }

    return { overdue, upcoming, completed, todayCount };
  }, [activities]);

  const calendarDays = useMemo<CalendarDay[]>(() => {
    const monthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const monthEnd = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0);
    const gridStart = new Date(monthStart);
    gridStart.setDate(monthStart.getDate() - monthStart.getDay());
    const gridEnd = new Date(monthEnd);
    gridEnd.setDate(monthEnd.getDate() + (6 - monthEnd.getDay()));

    const items: CalendarDay[] = [];
    for (let cursor = new Date(gridStart); cursor <= gridEnd; cursor.setDate(cursor.getDate() + 1)) {
      const current = new Date(cursor);
      const iso = toIsoDay(current);
      items.push({
        date: current,
        iso,
        inCurrentMonth: current.getMonth() === calendarMonth.getMonth(),
        activities: sortedActivities.filter((activity) => sameDay(new Date(activity.scheduledAt), current)),
      });
    }

    return items;
  }, [calendarMonth, sortedActivities]);

  const selectedDayActivities = useMemo(
    () => sortedActivities.filter((activity) => toIsoDay(new Date(activity.scheduledAt)) === selectedCalendarDay),
    [selectedCalendarDay, sortedActivities],
  );

  const todayActivities = useMemo(
    () => sortedActivities.filter((activity) => sameDay(new Date(activity.scheduledAt), new Date())),
    [sortedActivities],
  );

  const overdueActivities = useMemo(
    () =>
      sortedActivities.filter(
        (activity) => !activity.completedAt && new Date(activity.scheduledAt).getTime() < Date.now(),
      ),
    [sortedActivities],
  );

  const conversionRate = pct(wonDeals, Math.max(leads.length, 1));

  function openCreateCustomer() {
    if (!canCreateCrm) return;
    setEditingCustomerId(null);
    setCustomerForm(DEFAULT_CUSTOMER_FORM);
    setIsCustomerModalOpen(true);
  }

  function openEditCustomer(customer: CustomerItem) {
    if (!canUpdateCrm) return;
    setEditingCustomerId(customer.id);
    setCustomerForm({
      name: customer.name,
      company: customer.company,
      email: customer.email,
      phone: customer.phone ?? "",
      segment: customer.segment,
      city: customer.city ?? "",
      ownerName: customer.ownerName,
      status: customer.status,
      totalValue: String(Number(customer.totalValue ?? 0)),
      notes: customer.notes ?? "",
    });
    setIsCustomerModalOpen(true);
  }

  function openCreateLead() {
    if (!canCreateCrm) return;
    setEditingLeadId(null);
    setLeadForm(DEFAULT_LEAD_FORM);
    setIsLeadModalOpen(true);
  }

  function openEditLead(lead: LeadItem) {
    if (!canUpdateCrm) return;
    setEditingLeadId(lead.id);
    setLeadForm({
      customerId: lead.customerId ?? "",
      name: lead.name,
      company: lead.company,
      email: lead.email,
      phone: lead.phone ?? "",
      stage: lead.stage,
      value: String(Number(lead.value ?? 0)),
      probability: String(lead.probability),
      source: lead.source,
      priority: lead.priority,
      ownerName: lead.ownerName,
      expectedCloseDate: toInputDate(lead.expectedCloseDate),
      notes: lead.notes ?? "",
    });
    setIsLeadModalOpen(true);
  }

  function openCreateActivity() {
    if (!canCreateCrm) return;
    setEditingActivityId(null);
    setActivityForm(DEFAULT_ACTIVITY_FORM);
    setIsActivityModalOpen(true);
  }

  function openEditActivity(activity: ActivityItem) {
    if (!canUpdateCrm) return;
    setEditingActivityId(activity.id);
    setActivityForm({
      customerId: activity.customerId ?? "",
      leadId: activity.leadId ?? "",
      title: activity.title,
      description: activity.description ?? "",
      type: activity.type,
      ownerName: activity.ownerName,
      scheduledAt: toInputDateTime(activity.scheduledAt),
    });
    setIsActivityModalOpen(true);
  }

  function handleDeleteCustomer(id: string) {
    if (!canDeleteCrm) return;
    setConfirmState({
      title: "Hapus Customer",
      message: "Customer ini akan dihapus dari CRM. Lanjutkan?",
      confirmLabel: "Hapus",
      variant: "danger",
      isLoading: deleteCustomerMutation.isPending,
      onConfirm: async () => {
        await deleteCustomerMutation.mutateAsync({ id });
        setConfirmState(null);
      },
    });
  }

  function handleDeleteLead(id: string) {
    if (!canDeleteCrm) return;
    setConfirmState({
      title: "Hapus Lead",
      message: "Lead ini akan dihapus dari CRM. Lanjutkan?",
      confirmLabel: "Hapus",
      variant: "danger",
      isLoading: deleteLeadMutation.isPending,
      onConfirm: async () => {
        await deleteLeadMutation.mutateAsync({ id });
        setConfirmState(null);
      },
    });
  }

  function handleDeleteActivity(id: string) {
    if (!canDeleteCrm) return;
    setConfirmState({
      title: "Hapus Aktivitas",
      message: "Aktivitas ini akan dihapus dari CRM. Lanjutkan?",
      confirmLabel: "Hapus",
      variant: "danger",
      isLoading: deleteActivityMutation.isPending,
      onConfirm: async () => {
        await deleteActivityMutation.mutateAsync({ id });
        setConfirmState(null);
      },
    });
  }

  function handleConvertLead(id: string) {
    if (!canUpdateCrm) return;
    setConfirmState({
      title: "Convert Lead",
      message: "Lead akan dikonversi menjadi customer dan stage berubah menjadi WON. Lanjutkan?",
      confirmLabel: "Convert",
      variant: "warning",
      isLoading: convertLeadMutation.isPending,
      onConfirm: async () => {
        await convertLeadMutation.mutateAsync({ id });
        setConfirmState(null);
      },
    });
  }

  async function handleDropLead(stage: PipelineStage) {
    if (!canUpdateCrm || !draggingLeadId) return;
    await updateLeadStageMutation.mutateAsync({ id: draggingLeadId, stage });
    setDraggingLeadId(null);
  }

  if (!session || !isAllowed) return null;

  const canSubmitCustomer = editingCustomerId ? canUpdateCrm : canCreateCrm;
  const canSubmitLead = editingLeadId ? canUpdateCrm : canCreateCrm;
  const canSubmitActivity = editingActivityId ? canUpdateCrm : canCreateCrm;

  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM"
        description="Kelola customer, lead, pipeline, aktivitas follow-up, reminder, dan konversi lead dari tenant aktif."
        primaryAction={
          canCreateCrm ? { label: "Tambah Lead", onClick: openCreateLead } : undefined
        }
        secondaryAction={
          canCreateCrm
            ? { label: "Tambah Customer", onClick: openCreateCustomer }
            : undefined
        }
      />

      {canCreateCrm ? (
        <div className="flex justify-end">
          <Button variant="ghost" onClick={openCreateActivity}>
            Tambah Aktivitas
          </Button>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Customer" value={customers.length} icon="🏢" />
        <StatCard
          label="Lead Aktif"
          value={leads.filter((lead) => !["WON", "LOST"].includes(lead.stage)).length}
          delta={`${leads.length} lead terfilter`}
          icon="🎯"
          variant="info"
        />
        <StatCard
          label="Nilai Pipeline"
          value={formatCurrency(totalPipelineValue)}
          delta="Nilai opportunity saat ini"
          icon="💼"
          variant="warning"
        />
        <StatCard
          label="Weighted Forecast"
          value={formatCurrency(weightedForecast)}
          delta={`Win rate ${conversionRate}%`}
          icon="📈"
          variant="success"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Reminder Overdue" value={activityStats.overdue} icon="⏰" variant="warning" />
        <StatCard label="Reminder Upcoming" value={activityStats.upcoming} icon="🗓️" variant="info" />
        <StatCard label="Aktivitas Hari Ini" value={activityStats.todayCount} icon="📅" variant="info" />
        <StatCard label="Aktivitas Completed" value={activityStats.completed} icon="✅" variant="success" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Kalender Aktivitas</h2>
              <p className="text-sm text-gray-500">Pantau aktivitas per tanggal dan pilih hari untuk melihat reminder detail.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setCalendarMonth(
                    new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1),
                  )
                }
              >
                ←
              </Button>
              <div className="min-w-40 text-center text-sm font-semibold text-gray-700">
                {monthLabel(calendarMonth)}
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setCalendarMonth(
                    new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1),
                  )
                }
              >
                →
              </Button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-400">
            {["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map((day) => (
              <div key={day}>{day}</div>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-7 gap-2">
            {calendarDays.map((day) => {
              const isSelected = day.iso === selectedCalendarDay;
              const isToday = day.iso === toIsoDay(new Date());
              const openCount = day.activities.filter((activity) => !activity.completedAt).length;

              return (
                <button
                  key={day.iso}
                  type="button"
                  onClick={() => setSelectedCalendarDay(day.iso)}
                  className={cn(
                    "min-h-24 rounded-xl border p-2 text-left transition",
                    day.inCurrentMonth ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50 text-gray-400",
                    isSelected && "border-blue-500 bg-blue-50",
                    isToday && "ring-2 ring-blue-200",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{day.date.getDate()}</span>
                    {day.activities.length > 0 && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                        {day.activities.length}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 space-y-1">
                    {day.activities.slice(0, 2).map((activity) => (
                      <div key={activity.id} className="truncate rounded bg-gray-100 px-1.5 py-1 text-[10px] text-gray-600">
                        {activity.title}
                      </div>
                    ))}
                    {openCount > 0 && (
                      <p className="text-[10px] font-medium text-orange-600">{openCount} open</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Reminder Harian</h2>
              <p className="text-sm text-gray-500">Fokus aktivitas hari ini, overdue, dan tanggal yang dipilih.</p>
            </div>
            <Badge variant="info">{selectedDayActivities.length} item</Badge>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <ReminderMiniCard title="Hari Ini" count={todayActivities.length} tone="info" />
            <ReminderMiniCard title="Overdue" count={overdueActivities.length} tone="warning" />
            <ReminderMiniCard title="Tanggal Dipilih" count={selectedDayActivities.length} tone="success" />
          </div>

          <div className="mt-4 rounded-xl border border-gray-200 p-3">
            <p className="text-sm font-semibold text-gray-900">Agenda tanggal {selectedCalendarDay}</p>
            <div className="mt-3 space-y-3">
              {selectedDayActivities.length === 0 ? (
                <p className="text-sm text-gray-500">Tidak ada aktivitas pada tanggal ini.</p>
              ) : (
                selectedDayActivities.slice(0, 6).map((activity) => {
                  const reminder = getActivityReminder(activity);
                  return (
                    <div key={activity.id} className="rounded-lg border border-gray-200 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{activity.title}</p>
                          <p className="mt-1 text-xs text-gray-500">{activity.ownerName} · {activity.lead?.company ?? activity.customer?.company ?? "Tanpa relasi"}</p>
                        </div>
                        <Badge variant={reminder.variant}>{reminder.label}</Badge>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Filter CRM</h2>
              <p className="text-sm text-gray-500">Cari data dan fokuskan board sesuai kebutuhan tim.</p>
            </div>
            <Button
              variant="ghost"
              onClick={() => {
                setSearch("");
                setStageFilter("ALL");
                setOwnerFilter("ALL");
                setSelectedStage("ALL");
              }}
            >
              Reset Filter
            </Button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <FilterField label="Cari">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className={inputClassName}
                placeholder="Nama, company, email, owner"
              />
            </FilterField>
            <FilterField label="Stage">
              <select
                value={stageFilter}
                onChange={(event) => setStageFilter(event.target.value as PipelineStage | "ALL")}
                className={inputClassName}
              >
                <option value="ALL">Semua Stage</option>
                {PIPELINE_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {STAGE_LABELS[stage]}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Owner">
              <select
                value={ownerFilter}
                onChange={(event) => setOwnerFilter(event.target.value)}
                className={inputClassName}
              >
                <option value="ALL">Semua Owner</option>
                {owners.map((owner) => (
                  <option key={owner} value={owner}>
                    {owner}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Board Focus">
              <select
                value={selectedStage}
                onChange={(event) => setSelectedStage(event.target.value as PipelineStage | "ALL")}
                className={inputClassName}
              >
                <option value="ALL">Semua Kolom</option>
                {PIPELINE_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {STAGE_LABELS[stage]}
                  </option>
                ))}
              </select>
            </FilterField>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Reminder Aktivitas</h2>
              <p className="text-sm text-gray-500">Kelola follow-up dan tandai selesai.</p>
            </div>
            <Badge variant="info">{sortedActivities.length} aktivitas</Badge>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <select value={activitySortKey} onChange={(event) => setActivitySortKey(event.target.value as ActivitySortKey)} className={inputClassName}>
              <option value="scheduledAt">Urutkan: Jadwal</option>
              <option value="ownerName">Urutkan: Owner</option>
              <option value="type">Urutkan: Jenis</option>
              <option value="status">Urutkan: Status</option>
            </select>
            <select value={activitySortDirection} onChange={(event) => setActivitySortDirection(event.target.value as SortDirection)} className={inputClassName}>
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>

          <div className="mt-4 space-y-3">
            {sortedActivities.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 px-3 py-6 text-center text-sm text-gray-400">
                Belum ada aktivitas CRM
              </div>
            ) : (
              paginatedActivities.items.map((activity) => {
                const reminder = getActivityReminder(activity);
                return (
                  <div key={activity.id} className="rounded-xl border border-gray-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-900">{activity.title}</p>
                        <p className="mt-1 text-sm text-gray-500">{activity.description ?? "-"}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant={reminder.variant}>{reminder.label}</Badge>
                        <Badge variant="default">{ACTIVITY_TYPE_LABELS[activity.type]}</Badge>
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-gray-500">
                      <p>{activity.lead?.company ?? activity.customer?.company ?? "Tanpa relasi"}</p>
                      <p className="mt-1">Owner: {activity.ownerName}</p>
                      <p className="mt-1">Jadwal: {formatDate(activity.scheduledAt)}</p>
                      {activity.completedAt && (
                        <p className="mt-1">Completed: {formatRelativeTime(activity.completedAt)}</p>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {canUpdateCrm ? (
                        <Button size="sm" variant="secondary" onClick={() => openEditActivity(activity)}>
                          Edit
                        </Button>
                      ) : null}
                      {canUpdateCrm ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            completeActivityMutation.mutate({
                              id: activity.id,
                              completed: !activity.completedAt,
                            })
                          }
                        >
                          {activity.completedAt ? "Buka Lagi" : "Selesai"}
                        </Button>
                      ) : null}
                      {canDeleteCrm ? (
                        <Button size="sm" variant="destructive" onClick={() => handleDeleteActivity(activity.id)}>
                          Hapus
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <PaginationControls
            page={paginatedActivities.page}
            totalPages={paginatedActivities.totalPages}
            totalItems={paginatedActivities.totalItems}
            onPrevious={() => setActivityPage((current) => Math.max(1, current - 1))}
            onNext={() => setActivityPage((current) => Math.min(paginatedActivities.totalPages, current + 1))}
          />
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Pipeline Board</h2>
            <p className="text-sm text-gray-500">Drag & drop card lead antar stage untuk update cepat.</p>
          </div>
          <Badge variant="info">{boardLeads.length} lead tampil</Badge>
        </div>

        {dashboardQuery.isLoading ? (
          <LoadingPanel text="Memuat pipeline CRM..." />
        ) : (
          <div className="grid gap-4 xl:grid-cols-6">
            {pipelineSummary.map((group) => (
              <div
                key={group.stage}
                className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm"
                onDragOver={canUpdateCrm ? (event) => event.preventDefault() : undefined}
                onDrop={canUpdateCrm ? () => void handleDropLead(group.stage) : undefined}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">{STAGE_LABELS[group.stage]}</h3>
                    <p className="text-xs text-gray-500">{group.total} lead</p>
                  </div>
                  <Badge variant={STAGE_BADGE_VARIANTS[group.stage]}>
                    {pct(group.totalValue, Math.max(totalPipelineValue, 1))}%
                  </Badge>
                </div>
                <p className="mt-2 text-xs font-medium text-gray-500">{formatCurrency(group.totalValue)}</p>

                <div className="mt-3 space-y-3">
                  {group.items.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-200 px-3 py-5 text-center text-xs text-gray-400">
                      Tidak ada lead
                    </div>
                  ) : (
                    group.items.map((lead) => (
                      <div
                        key={lead.id}
                        draggable={canUpdateCrm}
                        onDragStart={canUpdateCrm ? () => setDraggingLeadId(lead.id) : undefined}
                        onDragEnd={canUpdateCrm ? () => setDraggingLeadId(null) : undefined}
                        className={cn(
                          canUpdateCrm ? "cursor-move rounded-xl border border-gray-200 p-3" : "rounded-xl border border-gray-200 p-3",
                          draggingLeadId === lead.id && "opacity-60",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{lead.company}</p>
                            <p className="text-xs text-gray-500">{lead.name}</p>
                          </div>
                          <Badge variant={PRIORITY_BADGE_VARIANTS[lead.priority]}>{lead.priority}</Badge>
                        </div>
                        <div className="mt-3 space-y-1 text-xs text-gray-500">
                          <p>Owner: {lead.ownerName}</p>
                          <p>Nilai: {formatCurrency(Number(lead.value ?? 0))}</p>
                          <p>Probabilitas: {lead.probability}%</p>
                          <p>Close target: {lead.expectedCloseDate ? formatDate(lead.expectedCloseDate) : "-"}</p>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {canUpdateCrm ? (
                            <button
                              type="button"
                              className="text-xs font-medium text-blue-600 hover:text-blue-700"
                              onClick={() => openEditLead(lead)}
                            >
                              Edit
                            </button>
                          ) : null}
                          {canUpdateCrm ? (
                            <button
                              type="button"
                              className="text-xs font-medium text-green-600 hover:text-green-700"
                              onClick={() => handleConvertLead(lead.id)}
                            >
                              Convert
                            </button>
                          ) : null}
                          {canDeleteCrm ? (
                            <button
                              type="button"
                              className="text-xs font-medium text-red-600 hover:text-red-700"
                              onClick={() => handleDeleteLead(lead.id)}
                            >
                              Hapus
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Daftar Customer</h2>
              <p className="text-sm text-gray-500">Customer existing untuk account management.</p>
            </div>
            <Badge variant="success">{sortedCustomers.length} customer</Badge>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <select value={customerSortKey} onChange={(event) => setCustomerSortKey(event.target.value as CustomerSortKey)} className={inputClassName}>
              <option value="company">Urutkan: Company</option>
              <option value="ownerName">Urutkan: Owner</option>
              <option value="totalValue">Urutkan: Nilai</option>
            </select>
            <select value={customerSortDirection} onChange={(event) => setCustomerSortDirection(event.target.value as SortDirection)} className={inputClassName}>
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="px-3 py-2 font-medium">Customer</th>
                  <th className="px-3 py-2 font-medium">Segment</th>
                  <th className="px-3 py-2 font-medium">Owner</th>
                  <th className="px-3 py-2 font-medium">Nilai</th>
                  <th className="px-3 py-2 font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {paginatedCustomers.items.map((customer) => (
                  <tr key={customer.id} className="border-b border-gray-100 align-top">
                    <td className="px-3 py-3">
                      <div>
                        <p className="font-semibold text-gray-900">{customer.company}</p>
                        <p className="text-xs text-gray-500">{customer.name}</p>
                        <p className="mt-1 text-xs text-gray-500">{customer.email}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Badge variant={CUSTOMER_STATUS_BADGE[customer.status]}>{customer.status}</Badge>
                          <span className="text-xs text-gray-400">{customer.city ?? "-"}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-gray-600">{SEGMENT_LABELS[customer.segment]}</td>
                    <td className="px-3 py-3 text-gray-600">{customer.ownerName}</td>
                    <td className="px-3 py-3 text-gray-600">{formatCurrency(Number(customer.totalValue ?? 0))}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-2">
                        <Link href={`/crm/customers/${customer.id}`} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50">
                          Detail
                        </Link>
                        {canUpdateCrm ? (
                          <Button size="sm" variant="secondary" onClick={() => openEditCustomer(customer)}>
                            Edit
                          </Button>
                        ) : null}
                        {canDeleteCrm ? (
                          <Button size="sm" variant="destructive" onClick={() => handleDeleteCustomer(customer.id)}>
                            Hapus
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <PaginationControls
            page={paginatedCustomers.page}
            totalPages={paginatedCustomers.totalPages}
            totalItems={paginatedCustomers.totalItems}
            onPrevious={() => setCustomerPage((current) => Math.max(1, current - 1))}
            onNext={() => setCustomerPage((current) => Math.min(paginatedCustomers.totalPages, current + 1))}
          />
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Daftar Lead</h2>
              <p className="text-sm text-gray-500">Lead prospektif dan status peluang saat ini.</p>
            </div>
            <Badge variant="warning">{sortedLeads.length} lead</Badge>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <select value={leadSortKey} onChange={(event) => setLeadSortKey(event.target.value as LeadSortKey)} className={inputClassName}>
              <option value="company">Urutkan: Company</option>
              <option value="ownerName">Urutkan: Owner</option>
              <option value="value">Urutkan: Nilai</option>
              <option value="probability">Urutkan: Probability</option>
              <option value="stage">Urutkan: Stage</option>
            </select>
            <select value={leadSortDirection} onChange={(event) => setLeadSortDirection(event.target.value as SortDirection)} className={inputClassName}>
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>

          <div className="mt-4 space-y-3">
            {paginatedLeads.items.map((lead) => (
              <div key={lead.id} className="rounded-xl border border-gray-200 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-gray-900">{lead.company}</p>
                      <Badge variant={STAGE_BADGE_VARIANTS[lead.stage]}>{STAGE_LABELS[lead.stage]}</Badge>
                      <Badge variant={PRIORITY_BADGE_VARIANTS[lead.priority]}>{lead.priority}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">
                      {lead.name} · {lead.email} · {lead.phone ?? "-"}
                    </p>
                  </div>
                  <div className="text-sm text-gray-600 lg:text-right">
                    <p className="font-semibold text-gray-900">{formatCurrency(Number(lead.value ?? 0))}</p>
                    <p>{lead.probability}% probability</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <LeadInfo label="Owner" value={lead.ownerName} />
                  <LeadInfo label="Source" value={SOURCE_LABELS[lead.source]} />
                  <LeadInfo label="Customer" value={lead.customer?.company ?? "Belum terkait"} />
                  <LeadInfo label="Aktivitas Terakhir" value={lead.lastActivityAt ? formatRelativeTime(lead.lastActivityAt) : "-"} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`/crm/leads/${lead.id}`} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                    Detail
                  </Link>
                  {canUpdateCrm ? (
                    <Button size="sm" variant="secondary" onClick={() => openEditLead(lead)}>
                      Edit
                    </Button>
                  ) : null}
                  {canUpdateCrm ? (
                    <Button size="sm" variant="ghost" onClick={() => handleConvertLead(lead.id)}>
                      Convert ke Customer
                    </Button>
                  ) : null}
                  {canDeleteCrm ? (
                    <Button size="sm" variant="destructive" onClick={() => handleDeleteLead(lead.id)}>
                      Hapus
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <PaginationControls
            page={paginatedLeads.page}
            totalPages={paginatedLeads.totalPages}
            totalItems={paginatedLeads.totalItems}
            onPrevious={() => setLeadPage((current) => Math.max(1, current - 1))}
            onNext={() => setLeadPage((current) => Math.min(paginatedLeads.totalPages, current + 1))}
          />
        </section>
      </div>

      <Modal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        title={editingCustomerId ? "Edit Customer" : "Tambah Customer Baru"}
        size="lg"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Nama PIC"><input value={customerForm.name} onChange={(e) => setCustomerForm((c) => ({ ...c, name: e.target.value }))} className={inputClassName} /></FormField>
          <FormField label="Perusahaan"><input value={customerForm.company} onChange={(e) => setCustomerForm((c) => ({ ...c, company: e.target.value }))} className={inputClassName} /></FormField>
          <FormField label="Email"><input type="email" value={customerForm.email} onChange={(e) => setCustomerForm((c) => ({ ...c, email: e.target.value }))} className={inputClassName} /></FormField>
          <FormField label="No. Telepon"><input value={customerForm.phone} onChange={(e) => setCustomerForm((c) => ({ ...c, phone: e.target.value }))} className={inputClassName} /></FormField>
          <FormField label="Segment"><select value={customerForm.segment} onChange={(e) => setCustomerForm((c) => ({ ...c, segment: e.target.value as CustomerSegment }))} className={inputClassName}>{Object.entries(SEGMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></FormField>
          <FormField label="Kota"><input value={customerForm.city} onChange={(e) => setCustomerForm((c) => ({ ...c, city: e.target.value }))} className={inputClassName} /></FormField>
          <FormField label="Owner"><input value={customerForm.ownerName} onChange={(e) => setCustomerForm((c) => ({ ...c, ownerName: e.target.value }))} className={inputClassName} /></FormField>
          <FormField label="Status"><select value={customerForm.status} onChange={(e) => setCustomerForm((c) => ({ ...c, status: e.target.value as CustomerStatus }))} className={inputClassName}>{["ACTIVE", "INACTIVE", "VIP"].map((status) => <option key={status} value={status}>{status}</option>)}</select></FormField>
          <FormField label="Total Nilai (IDR)"><input type="number" min="0" value={customerForm.totalValue} onChange={(e) => setCustomerForm((c) => ({ ...c, totalValue: e.target.value }))} className={inputClassName} /></FormField>
          <div className="md:col-span-2">
            <FormField label="Catatan"><textarea value={customerForm.notes} onChange={(e) => setCustomerForm((c) => ({ ...c, notes: e.target.value }))} className={cn(inputClassName, "min-h-24")} /></FormField>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setIsCustomerModalOpen(false)}>Batal</Button>
          <Button
            isLoading={createCustomerMutation.isPending || updateCustomerMutation.isPending}
            disabled={!canSubmitCustomer}
            onClick={() => {
              const payload = {
                name: customerForm.name,
                company: customerForm.company,
                email: customerForm.email,
                phone: customerForm.phone || undefined,
                segment: customerForm.segment,
                city: customerForm.city || undefined,
                ownerName: customerForm.ownerName,
                status: customerForm.status,
                totalValue: Number(customerForm.totalValue || 0),
                notes: customerForm.notes || undefined,
              };

              if (editingCustomerId) {
                updateCustomerMutation.mutate({ id: editingCustomerId, ...payload });
              } else {
                createCustomerMutation.mutate(payload);
              }
            }}
          >
            {editingCustomerId ? "Update Customer" : "Simpan Customer"}
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={isLeadModalOpen}
        onClose={() => setIsLeadModalOpen(false)}
        title={editingLeadId ? "Edit Lead" : "Tambah Lead Baru"}
        size="lg"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Customer (opsional)"><select value={leadForm.customerId} onChange={(e) => setLeadForm((c) => ({ ...c, customerId: e.target.value }))} className={inputClassName}><option value="">Tanpa customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.company}</option>)}</select></FormField>
          <div />
          <FormField label="Nama Kontak"><input value={leadForm.name} onChange={(e) => setLeadForm((c) => ({ ...c, name: e.target.value }))} className={inputClassName} /></FormField>
          <FormField label="Perusahaan"><input value={leadForm.company} onChange={(e) => setLeadForm((c) => ({ ...c, company: e.target.value }))} className={inputClassName} /></FormField>
          <FormField label="Email"><input type="email" value={leadForm.email} onChange={(e) => setLeadForm((c) => ({ ...c, email: e.target.value }))} className={inputClassName} /></FormField>
          <FormField label="No. Telepon"><input value={leadForm.phone} onChange={(e) => setLeadForm((c) => ({ ...c, phone: e.target.value }))} className={inputClassName} /></FormField>
          <FormField label="Stage"><select value={leadForm.stage} onChange={(e) => setLeadForm((c) => ({ ...c, stage: e.target.value as PipelineStage }))} className={inputClassName}>{PIPELINE_STAGES.map((stage) => <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>)}</select></FormField>
          <FormField label="Source"><select value={leadForm.source} onChange={(e) => setLeadForm((c) => ({ ...c, source: e.target.value as LeadSource }))} className={inputClassName}>{Object.entries(SOURCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></FormField>
          <FormField label="Prioritas"><select value={leadForm.priority} onChange={(e) => setLeadForm((c) => ({ ...c, priority: e.target.value as LeadPriority }))} className={inputClassName}>{["LOW", "MEDIUM", "HIGH"].map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select></FormField>
          <FormField label="Owner"><input value={leadForm.ownerName} onChange={(e) => setLeadForm((c) => ({ ...c, ownerName: e.target.value }))} className={inputClassName} /></FormField>
          <FormField label="Nilai Opportunity (IDR)"><input type="number" min="0" value={leadForm.value} onChange={(e) => setLeadForm((c) => ({ ...c, value: e.target.value }))} className={inputClassName} /></FormField>
          <FormField label="Probabilitas (%)"><input type="number" min="0" max="100" value={leadForm.probability} onChange={(e) => setLeadForm((c) => ({ ...c, probability: e.target.value }))} className={inputClassName} /></FormField>
          <FormField label="Target Close Date"><input type="date" value={leadForm.expectedCloseDate} onChange={(e) => setLeadForm((c) => ({ ...c, expectedCloseDate: e.target.value }))} className={inputClassName} /></FormField>
          <div className="md:col-span-2">
            <FormField label="Catatan"><textarea value={leadForm.notes} onChange={(e) => setLeadForm((c) => ({ ...c, notes: e.target.value }))} className={cn(inputClassName, "min-h-24")} /></FormField>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setIsLeadModalOpen(false)}>Batal</Button>
          <Button
            isLoading={createLeadMutation.isPending || updateLeadMutation.isPending}
            disabled={!canSubmitLead}
            onClick={() => {
              const payload = {
                customerId: leadForm.customerId || undefined,
                name: leadForm.name,
                company: leadForm.company,
                email: leadForm.email,
                phone: leadForm.phone || undefined,
                stage: leadForm.stage,
                value: Number(leadForm.value || 0),
                probability: Number(leadForm.probability || 0),
                source: leadForm.source,
                priority: leadForm.priority,
                ownerName: leadForm.ownerName,
                expectedCloseDate: leadForm.expectedCloseDate || undefined,
                notes: leadForm.notes || undefined,
              };

              if (editingLeadId) {
                updateLeadMutation.mutate({ id: editingLeadId, ...payload });
              } else {
                createLeadMutation.mutate(payload);
              }
            }}
          >
            {editingLeadId ? "Update Lead" : "Simpan Lead"}
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={isActivityModalOpen}
        onClose={() => setIsActivityModalOpen(false)}
        title={editingActivityId ? "Edit Aktivitas CRM" : "Tambah Aktivitas CRM"}
        size="lg"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Lead (opsional)"><select value={activityForm.leadId} onChange={(e) => setActivityForm((c) => ({ ...c, leadId: e.target.value }))} className={inputClassName}><option value="">Tanpa lead</option>{leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.company}</option>)}</select></FormField>
          <FormField label="Customer (opsional)"><select value={activityForm.customerId} onChange={(e) => setActivityForm((c) => ({ ...c, customerId: e.target.value }))} className={inputClassName}><option value="">Tanpa customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.company}</option>)}</select></FormField>
          <FormField label="Judul"><input value={activityForm.title} onChange={(e) => setActivityForm((c) => ({ ...c, title: e.target.value }))} className={inputClassName} /></FormField>
          <FormField label="Jenis Aktivitas"><select value={activityForm.type} onChange={(e) => setActivityForm((c) => ({ ...c, type: e.target.value as ActivityType }))} className={inputClassName}>{Object.entries(ACTIVITY_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></FormField>
          <FormField label="Owner"><input value={activityForm.ownerName} onChange={(e) => setActivityForm((c) => ({ ...c, ownerName: e.target.value }))} className={inputClassName} /></FormField>
          <FormField label="Jadwal"><input type="datetime-local" value={activityForm.scheduledAt} onChange={(e) => setActivityForm((c) => ({ ...c, scheduledAt: e.target.value }))} className={inputClassName} /></FormField>
          <div className="md:col-span-2">
            <FormField label="Deskripsi"><textarea value={activityForm.description} onChange={(e) => setActivityForm((c) => ({ ...c, description: e.target.value }))} className={cn(inputClassName, "min-h-24")} /></FormField>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setIsActivityModalOpen(false)}>Batal</Button>
          <Button
            isLoading={createActivityMutation.isPending || updateActivityMutation.isPending}
            disabled={!canSubmitActivity}
            onClick={() => {
              const payload = {
                customerId: activityForm.customerId || undefined,
                leadId: activityForm.leadId || undefined,
                title: activityForm.title,
                description: activityForm.description || undefined,
                type: activityForm.type,
                ownerName: activityForm.ownerName,
                scheduledAt: activityForm.scheduledAt,
              };

              if (editingActivityId) {
                updateActivityMutation.mutate({ id: editingActivityId, ...payload });
              } else {
                createActivityMutation.mutate(payload);
              }
            }}
          >
            {editingActivityId ? "Update Aktivitas" : "Simpan Aktivitas"}
          </Button>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={confirmState !== null}
        onClose={() => setConfirmState(null)}
        onConfirm={() => {
          void confirmState?.onConfirm();
        }}
        title={confirmState?.title ?? "Konfirmasi"}
        message={confirmState?.message ?? "Apakah Anda yakin?"}
        confirmLabel={confirmState?.confirmLabel ?? "Lanjutkan"}
        variant={confirmState?.variant ?? "danger"}
        isLoading={
          confirmState?.isLoading ??
          (deleteCustomerMutation.isPending ||
            deleteLeadMutation.isPending ||
            deleteActivityMutation.isPending ||
            convertLeadMutation.isPending)
        }
      />
    </div>
  );
}

const inputClassName =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500";

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}

function LeadInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-gray-700">{value}</p>
    </div>
  );
}

function LoadingPanel({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
      {text}
    </div>
  );
}

function PaginationControls({
  page,
  totalPages,
  totalItems,
  onPrevious,
  onNext,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="mt-4 flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
      <p className="text-sm text-gray-500">
        {totalItems} item · halaman {page}/{totalPages}
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={onPrevious} disabled={page <= 1}>
          Sebelumnya
        </Button>
        <Button size="sm" variant="secondary" onClick={onNext} disabled={page >= totalPages}>
          Berikutnya
        </Button>
      </div>
    </div>
  );
}

function ReminderMiniCard({
  title,
  count,
  tone,
}: {
  title: string;
  count: number;
  tone: "info" | "warning" | "success";
}) {
  const tones = {
    info: "border-blue-200 bg-blue-50 text-blue-900",
    warning: "border-orange-200 bg-orange-50 text-orange-900",
    success: "border-green-200 bg-green-50 text-green-900",
  } as const;

  return (
    <div className={cn("rounded-xl border p-3", tones[tone])}>
      <p className="text-xs font-semibold uppercase tracking-wide">{title}</p>
      <p className="mt-2 text-2xl font-bold">{count}</p>
    </div>
  );
}
