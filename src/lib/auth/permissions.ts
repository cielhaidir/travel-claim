import { ROLES, type Role } from "@/lib/constants/roles";

export type PermissionAction =
  | "read"
  | "create"
  | "update"
  | "delete"
  | "submit"
  | "approve"
  | "reject"
  | "revision"
  | "lock"
  | "close"
  | "disburse"
  | "pay"
  | "post"
  | "void"
  | "export"
  | "import";

export type PermissionMap = Record<string, PermissionAction[]>;

type PermissionActionMeta = {
  label: string;
  description: string;
};

type PermissionModuleMeta = {
  label: string;
  description: string;
  color: string;
  actions: readonly PermissionAction[];
};

export const PERMISSION_ACTIONS: Record<PermissionAction, PermissionActionMeta> =
  {
    read: {
      label: "Read",
      description: "View pages, lists, and details.",
    },
    create: {
      label: "Create",
      description: "Create new records.",
    },
    update: {
      label: "Update",
      description: "Edit existing records.",
    },
    delete: {
      label: "Delete",
      description: "Delete records.",
    },
    submit: {
      label: "Submit",
      description: "Submit documents into workflow.",
    },
    approve: {
      label: "Approve",
      description: "Approve workflow items.",
    },
    reject: {
      label: "Reject",
      description: "Reject workflow items.",
    },
    revision: {
      label: "Revision",
      description: "Request revisions on workflow items.",
    },
    lock: {
      label: "Lock",
      description: "Lock approved travel requests.",
    },
    close: {
      label: "Close",
      description: "Close completed travel requests.",
    },
    disburse: {
      label: "Disburse",
      description: "Disburse approved bailout requests.",
    },
    pay: {
      label: "Pay",
      description: "Mark approved claims as paid.",
    },
    post: {
      label: "Post",
      description: "Post journal entries.",
    },
    void: {
      label: "Void",
      description: "Void posted journal entries.",
    },
    export: {
      label: "Export",
      description: "Export reports or records.",
    },
    import: {
      label: "Import",
      description: "Bulk import records.",
    },
  };

export const PERMISSION_MODULES: Record<string, PermissionModuleMeta> = {
  dashboard: {
    label: "Dashboard",
    description: "Main dashboard and summary cards.",
    color: "bg-sky-50 text-sky-700 border-sky-200",
    actions: ["read"],
  },
  travel: {
    label: "Perjalanan Dinas",
    description: "Menu pengajuan perjalanan dinas dan seluruh aksi siklusnya.",
    color: "bg-blue-50 text-blue-700 border-blue-200",
    actions: ["read", "create", "update", "delete", "submit", "lock", "close"],
  },
  projects: {
    label: "Proyek",
    description: "Master data proyek.",
    color: "bg-cyan-50 text-cyan-700 border-cyan-200",
    actions: ["read", "create", "update", "delete"],
  },
  bailout: {
    label: "Bailouts",
    description: "Bailout requests and finance disbursement.",
    color: "bg-orange-50 text-orange-700 border-orange-200",
    actions: ["read", "create", "update", "submit", "approve", "reject", "disburse"],
  },
  claims: {
    label: "Klaim",
    description: "Menu klaim dan aksi settlement finance.",
    color: "bg-amber-50 text-amber-700 border-amber-200",
    actions: ["read", "create", "update", "delete", "submit", "approve", "pay"],
  },
  approvals: {
    label: "Approvals",
    description: "Approval queue and approval actions.",
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
    actions: ["read", "approve", "reject", "revision"],
  },
  crm: {
    label: "CRM",
    description: "Customer, lead, activity, and pipeline management.",
    color: "bg-red-50 text-red-700 border-red-200",
    actions: ["read", "create", "update", "delete"],
  },
  accounting: {
    label: "Akuntansi & Keuangan",
    description: "Menu utama akuntansi, keuangan, jurnal, dan laporan.",
    color: "bg-violet-50 text-violet-700 border-violet-200",
    actions: ["read"],
  },
  "chart-of-accounts": {
    label: "Chart of Accounts",
    description: "COA management.",
    color: "bg-indigo-50 text-indigo-700 border-indigo-200",
    actions: ["read", "create", "update", "delete"],
  },
  "balance-accounts": {
    label: "Balance Accounts",
    description: "Balance account management.",
    color: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
    actions: ["read", "create", "update", "delete"],
  },
  journals: {
    label: "Journal Entries",
    description: "Journal creation, posting, and export.",
    color: "bg-purple-50 text-purple-700 border-purple-200",
    actions: ["read", "create", "update", "post", "void", "export"],
  },
  reports: {
    label: "Reports",
    description: "Finance and accounting reports.",
    color: "bg-pink-50 text-pink-700 border-pink-200",
    actions: ["read", "export"],
  },
  notifications: {
    label: "Notifications",
    description: "In-app or outgoing notifications.",
    color: "bg-rose-50 text-rose-700 border-rose-200",
    actions: ["read", "create"],
  },
  audit: {
    label: "Audit Logs",
    description: "Audit log visibility.",
    color: "bg-slate-50 text-slate-700 border-slate-200",
    actions: ["read"],
  },
  users: {
    label: "Manajemen Pengguna",
    description: "CRUD pengguna, reset password, dan impor massal.",
    color: "bg-lime-50 text-lime-700 border-lime-200",
    actions: ["read", "create", "update", "delete", "import"],
  },
  roles: {
    label: "Manajemen Peran",
    description: "Kelola izin menu dan fitur per peran secara global.",
    color: "bg-gray-100 text-gray-800 border-gray-300",
    actions: ["read", "update"],
  },
  profile: {
    label: "Profil",
    description: "Akses dan pembaruan profil pribadi.",
    color: "bg-teal-50 text-teal-700 border-teal-200",
    actions: ["read", "update"],
  },
};

export function buildFullAccessPermissionMap(): PermissionMap {
  return Object.fromEntries(
    Object.entries(PERMISSION_MODULES).map(([moduleKey, moduleMeta]) => [
      moduleKey,
      [...moduleMeta.actions],
    ]),
  );
}

export function mergePermissionMaps(
  ...maps: Array<PermissionMap | null | undefined>
): PermissionMap {
  const merged = new Map<string, Set<PermissionAction>>();

  for (const map of maps) {
    if (!map) continue;

    for (const [moduleKey, actions] of Object.entries(map)) {
      const knownActions = PERMISSION_MODULES[moduleKey]?.actions;
      if (!knownActions) continue;

      if (!merged.has(moduleKey)) {
        merged.set(moduleKey, new Set<PermissionAction>());
      }

      for (const action of actions ?? []) {
        if (knownActions.includes(action)) {
          merged.get(moduleKey)?.add(action);
        }
      }
    }
  }

  const normalized: PermissionMap = {};

  for (const [moduleKey, actionSet] of merged.entries()) {
    const actions = [...actionSet].sort();
    if (actions.length > 0) {
      normalized[moduleKey] = actions;
    }
  }

  return normalized;
}

const EMPLOYEE_PERMISSIONS: PermissionMap = {
  dashboard: ["read"],
  travel: ["read", "create", "update", "delete", "submit"],
  bailout: ["read", "create", "submit"],
  claims: ["read", "create", "update", "delete", "submit"],
  notifications: ["read"],
  profile: ["read", "update"],
};

const CRM_FULL_PERMISSIONS: PermissionMap = {
  crm: ["read", "create", "update", "delete"],
};

const SUPERVISOR_PERMISSIONS: PermissionMap = mergePermissionMaps(
  EMPLOYEE_PERMISSIONS,
  {
    approvals: ["read", "approve", "reject", "revision"],
    bailout: ["read", "approve", "reject"],
    projects: ["read"],
  },
);

const MANAGER_PERMISSIONS: PermissionMap = mergePermissionMaps(
  SUPERVISOR_PERMISSIONS,
  {
    ...CRM_FULL_PERMISSIONS,
    projects: ["read", "create", "update"],
    reports: ["read", "export"],
  },
);

const FINANCE_PERMISSIONS: PermissionMap = {
  dashboard: ["read"],
  travel: ["read", "lock", "close"],
  claims: ["read", "approve", "pay"],
  bailout: ["read", "disburse"],
  approvals: ["read", "approve", "reject", "revision"],
  accounting: ["read"],
  "chart-of-accounts": ["read", "create", "update", "delete"],
  "balance-accounts": ["read", "create", "update", "delete"],
  journals: ["read", "create", "update", "post", "void", "export"],
  reports: ["read", "export"],
  audit: ["read"],
  notifications: ["read", "create"],
  profile: ["read", "update"],
};

const ADMIN_PERMISSIONS = (() => {
  return buildFullAccessPermissionMap();
})();

export const DEFAULT_ROLE_PERMISSION_PRESETS: Record<Role, PermissionMap> = {
  [ROLES.ROOT]: buildFullAccessPermissionMap(),
  [ROLES.ADMIN]: ADMIN_PERMISSIONS,
  [ROLES.FINANCE]: FINANCE_PERMISSIONS,
  [ROLES.DIRECTOR]: mergePermissionMaps(MANAGER_PERMISSIONS, {
    audit: ["read"],
  }),
  [ROLES.MANAGER]: MANAGER_PERMISSIONS,
  [ROLES.SALES_CHIEF]: mergePermissionMaps(SUPERVISOR_PERMISSIONS, {
    ...CRM_FULL_PERMISSIONS,
    projects: ["read", "create", "update"],
  }),
  [ROLES.SUPERVISOR]: SUPERVISOR_PERMISSIONS,
  [ROLES.SALES_EMPLOYEE]: mergePermissionMaps(EMPLOYEE_PERMISSIONS, {
    ...CRM_FULL_PERMISSIONS,
    projects: ["read"],
  }),
  [ROLES.EMPLOYEE]: EMPLOYEE_PERMISSIONS,
};

export const FULL_ACCESS_PERMISSIONS = buildFullAccessPermissionMap();

export function sanitizePermissionMap(input: unknown): PermissionMap {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  const normalized: PermissionMap = {};

  for (const [moduleKey, rawActions] of Object.entries(input)) {
    const knownModule = PERMISSION_MODULES[moduleKey];
    if (!knownModule || !Array.isArray(rawActions)) continue;

    const validActions = rawActions.filter((action): action is PermissionAction =>
      typeof action === "string" &&
      knownModule.actions.includes(action as PermissionAction),
    );

    if (rawActions.length === 0) {
      normalized[moduleKey] = [];
      continue;
    }

    if (validActions.length > 0) {
      normalized[moduleKey] = [...new Set(validActions)].sort();
    }
  }

  return normalized;
}

export function mergeMissingPermissionModules(
  permissions: unknown,
  defaults: unknown,
): PermissionMap {
  const normalizedPermissions = sanitizePermissionMap(permissions);
  const normalizedDefaults = sanitizePermissionMap(defaults);
  const merged: PermissionMap = { ...normalizedPermissions };

  for (const [moduleKey, actions] of Object.entries(normalizedDefaults)) {
    if (!(moduleKey in merged)) {
      merged[moduleKey] = [...actions];
    }
  }

  return merged;
}

export function normalizePermissionMap(input: unknown): PermissionMap {
  return sanitizePermissionMap(input);
}

export function hasPermissionMap(
  permissions: PermissionMap | null | undefined,
  moduleKey: string,
  action: PermissionAction = "read",
): boolean {
  return permissions?.[moduleKey]?.includes(action) ?? false;
}

export function countPermissionActions(
  permissions: PermissionMap | null | undefined,
): number {
  if (!permissions) return 0;
  return Object.values(permissions).reduce(
    (total, actions) => total + actions.length,
    0,
  );
}
