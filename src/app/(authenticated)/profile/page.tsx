"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/features/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/features/EmptyState";
import { hasPermissionMap } from "@/lib/auth/permissions";
import { formatDateTime, getInitials } from "@/lib/utils/format";

type SessionMembership = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  status: string;
  isDefault: boolean;
  isRootTenant: boolean;
};

type ProfileData = {
  id: string;
  name: string | null;
  email: string | null;
  employeeId: string | null;
  role: string;
  phoneNumber: string | null;
  image: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  department?: {
    id: string;
    name: string;
    code: string | null;
  } | null;
  supervisor?: {
    id: string;
    name: string | null;
    email: string | null;
    role: string;
  } | null;
  directReports: Array<{
    id: string;
    name: string | null;
    email: string | null;
    role: string;
    employeeId: string | null;
  }>;
};

const FIELD_CLS =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:bg-gray-50 disabled:text-gray-500";
const LABEL_CLS = "mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500";

const ROLE_LABELS: Record<string, string> = {
  ROOT: "Root",
  ADMIN: "Admin",
  FINANCE: "Finance",
  DIRECTOR: "Director",
  MANAGER: "Manager",
  SALES_CHIEF: "Sales Chief",
  SUPERVISOR: "Supervisor",
  SALES_EMPLOYEE: "Sales Employee",
  EMPLOYEE: "Employee",
};

export default function ProfilePage() {
  const { data: session, status, update: refreshSession } = useSession();
  const router = useRouter();
  const utils = api.useUtils();

  const canReadProfile =
    (session?.user?.isRoot ?? false) ||
    hasPermissionMap(session?.user?.permissions, "profile", "read");
  const canUpdateProfile =
    (session?.user?.isRoot ?? false) ||
    hasPermissionMap(session?.user?.permissions, "profile", "update");

  useEffect(() => {
    if (status === "loading") return;
    if (!canReadProfile) {
      void router.replace("/dashboard");
    }
  }, [canReadProfile, router, status]);

  const profileQuery = api.user.getMe.useQuery(undefined, {
    enabled: status === "authenticated" && canReadProfile,
    refetchOnWindowFocus: false,
  });

  const profile = profileQuery.data as ProfileData | undefined;
  const memberships = (session?.user?.memberships ?? []) as SessionMembership[];
  const activeTenant = memberships.find(
    (membership) => membership.tenantId === session?.user?.activeTenantId,
  );
  const scopedRoles = useMemo(() => {
    const roles = ((session?.user?.roles ?? []) as string[]).filter(Boolean);
    if (roles.length > 0) return roles;
    return session?.user?.role ? [session.user.role] : [];
  }, [session?.user?.role, session?.user?.roles]);

  const [profileForm, setProfileForm] = useState({
    name: "",
    phoneNumber: "",
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  useEffect(() => {
    if (!profile) return;
    setProfileForm({
      name: profile.name ?? "",
      phoneNumber: profile.phoneNumber ?? "",
    });
  }, [profile?.id, profile?.name, profile?.phoneNumber]);

  const updateProfileMutation = api.user.updateMe.useMutation({
    onSuccess: async () => {
      setProfileError("");
      setProfileSuccess("Profil berhasil diperbarui.");
      await utils.user.getMe.invalidate();
      await refreshSession();
    },
    onError: (error) => {
      setProfileSuccess("");
      setProfileError(error.message);
    },
  });

  const changePasswordMutation = api.user.changePassword.useMutation({
    onSuccess: () => {
      setPasswordError("");
      setPasswordSuccess("Password berhasil diperbarui.");
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    },
    onError: (error) => {
      setPasswordSuccess("");
      setPasswordError(error.message);
    },
  });

  const handleProfileSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canUpdateProfile) return;

    const trimmedName = profileForm.name.trim();
    if (trimmedName.length === 0) {
      setProfileSuccess("");
      setProfileError("Nama wajib diisi.");
      return;
    }

    setProfileError("");
    setProfileSuccess("");
    updateProfileMutation.mutate({
      name: trimmedName,
      phoneNumber: profileForm.phoneNumber.trim() || null,
    });
  };

  const handlePasswordSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canUpdateProfile) return;

    if (passwordForm.currentPassword.length === 0) {
      setPasswordSuccess("");
      setPasswordError("Password saat ini wajib diisi.");
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      setPasswordSuccess("");
      setPasswordError("Password baru minimal 8 karakter.");
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordSuccess("");
      setPasswordError("Konfirmasi password baru tidak sama.");
      return;
    }

    setPasswordError("");
    setPasswordSuccess("");
    changePasswordMutation.mutate({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    });
  };

  if (status === "loading" || (status === "authenticated" && !canReadProfile)) {
    return null;
  }

  if (profileQuery.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Profil"
          description="Kelola informasi akun dan keamanan akun Anda."
        />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="h-72 animate-pulse rounded-2xl border border-gray-200 bg-gray-100" />
          <div className="h-72 animate-pulse rounded-2xl border border-gray-200 bg-gray-100" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Profil"
          description="Kelola informasi akun dan keamanan akun Anda."
        />
        <div className="rounded-lg border bg-white">
          <EmptyState
            icon="PF"
            title="Profil tidak ditemukan"
            description="Data akun untuk sesi yang sedang aktif tidak tersedia."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profil"
        description="Kelola informasi akun, tenant aktif, dan keamanan akun yang sedang login."
        secondaryAction={{
          label: "Muat Ulang",
          onClick: () => void profileQuery.refetch(),
        }}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100 text-xl font-bold text-blue-700">
                {getInitials(profile.name ?? profile.email ?? "User")}
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-2xl font-bold text-gray-900">
                  {profile.name ?? "-"}
                </h2>
                <p className="truncate text-sm text-gray-500">
                  {profile.email ?? "-"}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {scopedRoles.map((role) => (
                    <span
                      key={role}
                      className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700"
                    >
                      {ROLE_LABELS[role] ?? role}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Tenant Aktif
              </p>
              <p className="mt-1 font-semibold text-gray-900">
                {activeTenant?.tenantName ?? "Tidak ada tenant aktif"}
              </p>
              <p className="text-xs text-gray-500">
                {activeTenant?.tenantSlug ?? "-"}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <InfoCard label="Email" value={profile.email ?? "-"} />
            <InfoCard label="Employee ID" value={profile.employeeId ?? "-"} />
            <InfoCard
              label="Departemen"
              value={
                profile.department
                  ? `${profile.department.name}${profile.department.code ? ` (${profile.department.code})` : ""}`
                  : "-"
              }
            />
            <InfoCard
              label="Supervisor"
              value={profile.supervisor?.name ?? profile.supervisor?.email ?? "-"}
            />
            <InfoCard
              label="Akses Tenant"
              value={`${memberships.length} tenant`}
              helper="Jumlah workspace yang bisa Anda akses"
            />
            <InfoCard
              label="Direct Reports"
              value={String(profile.directReports.length)}
              helper="Jumlah bawahan langsung"
            />
            <InfoCard
              label="Dibuat"
              value={formatDateTime(profile.createdAt)}
            />
            <InfoCard
              label="Terakhir Diperbarui"
              value={formatDateTime(profile.updatedAt)}
            />
          </div>

          <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-sm font-semibold text-gray-900">Workspace Yang Tersedia</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {memberships.length > 0 ? (
                memberships.map((membership) => (
                  <span
                    key={membership.tenantId}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${
                      membership.tenantId === session?.user?.activeTenantId
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-gray-200 bg-white text-gray-600"
                    }`}
                  >
                    {membership.tenantName}
                    {membership.isDefault ? " • Default" : ""}
                    {membership.tenantId === session?.user?.activeTenantId
                      ? " • Active"
                      : ""}
                  </span>
                ))
              ) : (
                <span className="text-sm text-gray-500">
                  Tidak ada membership tenant yang aktif.
                </span>
              )}
            </div>
          </div>
        </section>

        <div className="space-y-6">
          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Edit Profil
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Perbarui nama tampilan dan nomor telepon untuk akun ini.
                </p>
              </div>
              {!canUpdateProfile ? (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                  Read Only
                </span>
              ) : null}
            </div>

            <form className="mt-5 space-y-4" onSubmit={handleProfileSubmit}>
              <div>
                <label className={LABEL_CLS}>Nama</label>
                <input
                  value={profileForm.name}
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  className={FIELD_CLS}
                  placeholder="Nama lengkap"
                  disabled={!canUpdateProfile || updateProfileMutation.isPending}
                />
              </div>

              <div>
                <label className={LABEL_CLS}>Nomor Telepon</label>
                <input
                  value={profileForm.phoneNumber}
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      phoneNumber: event.target.value,
                    }))
                  }
                  className={FIELD_CLS}
                  placeholder="08xxxxxxxxxx"
                  disabled={!canUpdateProfile || updateProfileMutation.isPending}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Kosongkan jika nomor telepon ingin dihapus.
                </p>
              </div>

              {profileError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {profileError}
                </div>
              ) : null}
              {profileSuccess ? (
                <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                  {profileSuccess}
                </div>
              ) : null}

              <div className="flex justify-end gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setProfileForm({
                      name: profile.name ?? "",
                      phoneNumber: profile.phoneNumber ?? "",
                    })
                  }
                  disabled={!canUpdateProfile || updateProfileMutation.isPending}
                >
                  Reset
                </Button>
                <Button
                  type="submit"
                  isLoading={updateProfileMutation.isPending}
                  disabled={!canUpdateProfile}
                >
                  Simpan Profil
                </Button>
              </div>
            </form>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Keamanan Akun
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Ganti password akun yang sedang login.
                </p>
              </div>
              <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-600">
                Min. 8 karakter
              </span>
            </div>

            <form className="mt-5 space-y-4" onSubmit={handlePasswordSubmit}>
              <div>
                <label className={LABEL_CLS}>Password Saat Ini</label>
                <input
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(event) =>
                    setPasswordForm((current) => ({
                      ...current,
                      currentPassword: event.target.value,
                    }))
                  }
                  className={FIELD_CLS}
                  disabled={!canUpdateProfile || changePasswordMutation.isPending}
                />
              </div>

              <div>
                <label className={LABEL_CLS}>Password Baru</label>
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(event) =>
                    setPasswordForm((current) => ({
                      ...current,
                      newPassword: event.target.value,
                    }))
                  }
                  className={FIELD_CLS}
                  disabled={!canUpdateProfile || changePasswordMutation.isPending}
                />
              </div>

              <div>
                <label className={LABEL_CLS}>Konfirmasi Password Baru</label>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(event) =>
                    setPasswordForm((current) => ({
                      ...current,
                      confirmPassword: event.target.value,
                    }))
                  }
                  className={FIELD_CLS}
                  disabled={!canUpdateProfile || changePasswordMutation.isPending}
                />
              </div>

              {passwordError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {passwordError}
                </div>
              ) : null}
              {passwordSuccess ? (
                <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                  {passwordSuccess}
                </div>
              ) : null}

              <div className="flex justify-end">
                <Button
                  type="submit"
                  isLoading={changePasswordMutation.isPending}
                  disabled={!canUpdateProfile}
                >
                  Ganti Password
                </Button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}

function InfoCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-2 break-words text-sm font-semibold text-gray-900">
        {value}
      </p>
      {helper ? <p className="mt-1 text-xs text-gray-500">{helper}</p> : null}
    </div>
  );
}
