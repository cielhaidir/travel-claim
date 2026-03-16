"use client";

import { useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/features/PageHeader";
import { EmptyState } from "@/components/features/EmptyState";
import { COAFilters } from "@/components/features/coa/COAFilters";
import { COATable, type COAAccount } from "@/components/features/coa/COATable";
import { COAHierarchyView } from "@/components/features/coa/COAHierarchyView";
import { COAForm, type COAFormData } from "@/components/features/coa/COAForm";
import { Button } from "@/components/ui/Button";
import type { COAType } from "../../../../generated/prisma";

type ViewMode = "table" | "hierarchy";

export default function ChartOfAccountsPage() {
  const { data: session } = useSession();
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [accountTypeFilter, setAccountTypeFilter] = useState<COAType | "ALL">("ALL");
  const [isActiveFilter, setIsActiveFilter] = useState<boolean | "ALL">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<COAAccount | null>(null);

  const userRole = session?.user?.role ?? "EMPLOYEE";
  const isAdmin = userRole === "ADMIN";

  // Fetch all accounts
  const {
    data: accountsDataRaw, // eslint-disable-line @typescript-eslint/no-unsafe-assignment
    isLoading: isLoadingAccounts,
    refetch: refetchAccounts,
  } = api.chartOfAccount.getAll.useQuery(
    {
      accountType: accountTypeFilter === "ALL" ? undefined : accountTypeFilter,
      isActive: isActiveFilter === "ALL" ? undefined : isActiveFilter,
    },
    {
      refetchOnWindowFocus: false,
    }
  );
  const accountsData = accountsDataRaw as { accounts: COAAccount[] } | undefined;

  // Fetch hierarchy for tree view
  const {
    data: hierarchyDataRaw, // eslint-disable-line @typescript-eslint/no-unsafe-assignment
    isLoading: isLoadingHierarchy,
    refetch: refetchHierarchy,
  } = api.chartOfAccount.getHierarchy.useQuery(
    {
      accountType: accountTypeFilter === "ALL" ? undefined : accountTypeFilter,
      isActive: isActiveFilter === "ALL" ? undefined : isActiveFilter,
    },
    {
      enabled: viewMode === "hierarchy",
      refetchOnWindowFocus: false,
    }
  );
  const hierarchyData = hierarchyDataRaw as COAAccount[] | undefined;

  // Fetch active accounts for parent selection
  const { data: activeAccountsRaw } = api.chartOfAccount.getActiveAccounts.useQuery( // eslint-disable-line @typescript-eslint/no-unsafe-assignment
    {},
    {
      refetchOnWindowFocus: false,
    }
  );
  const activeAccounts = activeAccountsRaw as COAAccount[] | undefined;

  // Mutations

  const createMutation = api.chartOfAccount.create.useMutation({
    onSuccess: () => {
      void refetchAccounts();
      void refetchHierarchy();
      setIsFormOpen(false);
      setEditingAccount(null);
      alert("Akun berhasil ditambahkan!");
    },
    onError: (error) => {
      alert(`Gagal menambahkan akun: ${error.message}`);
    },
  });

  const updateMutation = api.chartOfAccount.update.useMutation({
    onSuccess: () => {
      void refetchAccounts();
      void refetchHierarchy();
      setIsFormOpen(false);
      setEditingAccount(null);
      alert("Akun berhasil diperbarui!");
    },
    onError: (error) => {
      alert(`Gagal memperbarui akun: ${error.message}`);
    },
  });

  const deleteMutation = api.chartOfAccount.delete.useMutation({
    onSuccess: (data: { message?: string }) => {
      void refetchAccounts();
      void refetchHierarchy();
      alert(data.message ?? "Akun berhasil dihapus!");
    },
    onError: (error) => {
      alert(`Gagal menghapus akun: ${error.message}`);
    },
  });

  const toggleActiveMutation = api.chartOfAccount.toggleActive.useMutation({
    onSuccess: (data: { isActive: boolean }) => {
      void refetchAccounts();
      void refetchHierarchy();
      alert(`Akun berhasil ${data.isActive ? "diaktifkan" : "dinonaktifkan"}!`);
    },
    onError: (error) => {
      alert(`Gagal mengubah status akun: ${error.message}`);
    },
  });

  // Filter accounts by search query
  const filteredAccounts = useMemo(() => {
    if (!accountsData?.accounts) return [];

    let filtered = accountsData.accounts;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (acc: COAAccount) =>
          acc.code.toLowerCase().includes(query) ||
          acc.name.toLowerCase().includes(query) ||
          acc.category.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [accountsData, searchQuery]);

  // Handlers
  const handleCreateNew = () => {
    setEditingAccount(null);
    setIsFormOpen(true);
  };

  const handleEdit = (account: COAAccount) => {
    setEditingAccount(account);
    setIsFormOpen(true);
  };

  const handleDelete = (account: COAAccount) => {
    const hasChildren = (account._count?.children ?? 0) > 0;
    const hasClaims = (account._count?.claims ?? 0) > 0;

    if (hasChildren) {
      alert("Akun dengan akun turunan tidak dapat dihapus. Hapus atau pindahkan akun turunannya terlebih dahulu.");
      return;
    }

    let confirmMessage = `Yakin ingin menghapus akun "${account.code} - ${account.name}"?`;

    if (hasClaims) {
      confirmMessage = `Akun ini memiliki ${account._count?.claims} klaim terkait. Akun akan dinonaktifkan, bukan dihapus. Lanjutkan?`;
    }

    if (confirm(confirmMessage)) {
      deleteMutation.mutate({
        id: account.id,
        force: hasClaims,
      });
    }
  };

  const handleToggleActive = (account: COAAccount) => {
    const message = account.isActive
      ? `Menonaktifkan akun ini juga akan menonaktifkan semua akun turunannya. Lanjutkan?`
      : `Yakin ingin mengaktifkan akun "${account.code} - ${account.name}"?`;

    if (confirm(message)) {
      toggleActiveMutation.mutate({ id: account.id });
    }
  };

  const handleFormSubmit = (data: COAFormData) => {
    if (editingAccount) {
      updateMutation.mutate({
        id: editingAccount.id,
        ...data,
        parentId: data.parentId || null,
        subcategory: data.subcategory || null,
        description: data.description || null,
      });
    } else {
      createMutation.mutate({
        ...data,
        parentId: data.parentId || undefined,
        subcategory: data.subcategory || undefined,
        description: data.description || undefined,
      });
    }
  };

  const handleFormCancel = () => {
    setIsFormOpen(false);
    setEditingAccount(null);
  };

  const isLoading = isLoadingAccounts || (viewMode === "hierarchy" && isLoadingHierarchy);
  const isMutating =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending ||
    toggleActiveMutation.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bagan Akun"
        description="Kelola struktur akun keuangan untuk pencatatan pengeluaran"
        primaryAction={
          isAdmin
            ? {
                label: "Tambah Akun",
                onClick: handleCreateNew,
              }
            : undefined
        }
      />

      {/* View Mode Toggle */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={viewMode === "table" ? "primary" : "secondary"}
          onClick={() => setViewMode("table")}
        >
          📊 Tampilan Tabel
        </Button>
        <Button
          size="sm"
          variant={viewMode === "hierarchy" ? "primary" : "secondary"}
          onClick={() => setViewMode("hierarchy")}
        >
          🌳 Tampilan Hierarki
        </Button>
      </div>

      {/* Filters */}
      <COAFilters
        accountType={accountTypeFilter}
        onAccountTypeChange={setAccountTypeFilter}
        isActive={isActiveFilter}
        onIsActiveChange={setIsActiveFilter}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Form Modal/Panel */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-black bg-opacity-30 transition-opacity"
              onClick={handleFormCancel}
            />
            <div className="relative w-full max-w-3xl rounded-lg bg-white p-6 shadow-xl">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                {editingAccount ? "Ubah Akun" : "Tambah Akun Baru"}
              </h2>
              <COAForm
                initialData={editingAccount ? {
                  id: editingAccount.id,
                  code: editingAccount.code,
                  name: editingAccount.name,
                  accountType: editingAccount.accountType,
                  category: editingAccount.category,
                  subcategory: editingAccount.subcategory ?? "",
                  parentId: editingAccount.parentId ?? "",
                  description: "",
                  isActive: editingAccount.isActive,
                } : undefined}
                availableParents={activeAccounts ?? []}
                isLoading={isMutating}
                onSubmit={handleFormSubmit}
                onCancel={handleFormCancel}
              />
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="rounded-lg border bg-white p-12 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="mt-4 text-sm text-gray-600">Memuat akun...</p>
        </div>
      ) : filteredAccounts.length === 0 && !searchQuery ? (
        <div className="rounded-lg border bg-white">
          <EmptyState
            icon="💼"
            title="Belum ada bagan akun"
            description={
              isAdmin
                ? "Tambahkan akun pertama untuk mulai mengelola data keuangan"
                : "Belum ada akun yang tersedia. Hubungi administrator Anda."
            }
            action={
              isAdmin
                ? {
                    label: "Tambah Akun Pertama",
                    onClick: handleCreateNew,
                  }
                : undefined
            }
          />
        </div>
      ) : filteredAccounts.length === 0 && searchQuery ? (
        <div className="rounded-lg border bg-white">
          <EmptyState
            icon="🔍"
            title="Akun tidak ditemukan"
            description={`Tidak ada akun yang cocok dengan "${searchQuery}". Coba kata kunci lain.`}
          />
        </div>
      ) : viewMode === "table" ? (
        <COATable
          accounts={filteredAccounts}
          isLoading={false}
          userRole={userRole}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onToggleActive={handleToggleActive}
        />
      ) : (
        <COAHierarchyView
          accounts={hierarchyData ?? []}
          isLoading={isLoadingHierarchy}
          userRole={userRole}
          onEdit={(account) => handleEdit(account as COAAccount)}
          onToggleActive={(account) => handleToggleActive(account as COAAccount)}
        />
      )}

      {/* Summary Stats */}
      {filteredAccounts.length > 0 && (
        <div className="grid gap-6 md:grid-cols-4">
          <div className="rounded-lg border bg-white p-6">
            <p className="text-sm text-gray-600">Total Akun</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">
              {filteredAccounts.length}
            </p>
          </div>
          <div className="rounded-lg border bg-green-50 p-6">
            <p className="text-sm text-green-900">Aktif</p>
            <p className="mt-2 text-3xl font-bold text-green-900">
              {filteredAccounts.filter((a: COAAccount) => a.isActive).length}
            </p>
          </div>
          <div className="rounded-lg border bg-gray-50 p-6">
            <p className="text-sm text-gray-700">Nonaktif</p>
            <p className="mt-2 text-3xl font-bold text-gray-700">
              {filteredAccounts.filter((a: COAAccount) => !a.isActive).length}
            </p>
          </div>
          <div className="rounded-lg border bg-blue-50 p-6">
            <p className="text-sm text-blue-900">Dipakai di Klaim</p>
            <p className="mt-2 text-3xl font-bold text-blue-900">
              {filteredAccounts.filter((a: COAAccount) => (a._count?.claims ?? 0) > 0).length}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
