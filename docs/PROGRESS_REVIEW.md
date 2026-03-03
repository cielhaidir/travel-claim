# Progress Review — Business Trip & Claim Flow

> **Tanggal audit:** 2 Maret 2026  
> File ini digunakan sebagai referensi tetap untuk memantau progress pengerjaan.  
> Update status setiap kali ada perubahan di kolom **Status** dan **Catatan**.

---

## Daftar Isi
1. [Ringkasan Temuan](#ringkasan-temuan)
2. [Flow 1 — Business Trip (BussTrip)](#flow-1--business-trip-busstrip)
3. [Flow 2 — Claim](#flow-2--claim)
4. [Checklist Perbaikan](#checklist-perbaikan)
5. [Status Tiap Layer](#status-tiap-layer)

---

## Ringkasan Temuan

| Area | Kondisi Saat Ini | Keterangan |
|------|-----------------|------------|
| **Schema (Prisma)** | ✅ Lengkap | Semua field dan relasi sudah benar |
| **Backend – TravelRequest** | ✅ Fixed | BUG-1 (role check) & BUG-2 (approval chain) sudah diperbaiki |
| **Backend – Bailout** | ✅ Oke | Fleksibel, semua field opsional |
| **Backend – Claim** | ✅ Fixed | BUG-8 (approval chain) & ISSUE-9 (coaId) sudah diperbaiki |
| **Backend – Approval** | ✅ Oke | Sudah ada approve/reject/revision |
| **Backend – User** | ✅ Updated | `getActiveUsers` endpoint ditambahkan |
| **Frontend – Travel Page** | ✅ Fixed | Role guard, tab visibility, rejection alert, participant picker |
| **Frontend – Claim Page** | ✅ Fixed | COA dropdown + coaId wired through |
| **Frontend – BailoutPanel** | ✅ Oke | Flow tambah bailout post-create sudah ada |

---

## Flow 1 — Business Trip (BussTrip)

### Alur yang Diinginkan

```
Sales / Sales Chief
        │
        ▼
[1] Buat BussTrip (isi tujuan, destinasi, tanggal, kategori)
        │
        ├── Jika SALES → pilih Project
        │
        ▼
[2] Isi Dana Talangan / Bailout (OPSIONAL)
    - Transport (tiket pesawat/kereta/dll)
    - Penginapan (hotel, dsb.)
    - Uang Makan
    - Lainnya
    ⚠️ BussTrip TETAP bisa jalan tanpa bailout apapun
        │
        ▼
[3] Pilih Peserta (dari daftar users)
        │
        ▼
[4] Submit → Approval Chain:
    ┌─────────────────────────────────┐
    │ Role Requester = SALES_EMPLOYEE │
    │  L1 → Sales Chief (supervisor)  │
    │  L3 → Director                  │
    └─────────────────────────────────┘
    ┌────────────────────────────────────┐
    │ Role Requester = SALES_CHIEF       │
    │  Langsung L3 → Director            │
    │  (skip L1 karena dia sudah chief)  │
    └────────────────────────────────────┘
        │
        ├── Ditolak → Sales menerima notifikasi + alasan di detail view
        │
        └── Disetujui → Status APPROVED → peserta siap berangkat
```

---

### Analisis Schema — `TravelRequest`

| Field | Ada? | Catatan |
|-------|------|---------|
| `purpose` | ✅ | Tujuan perjalanan |
| `destination` | ✅ | Kota/lokasi tujuan |
| `travelType` | ✅ | SALES/OPERATIONAL/MEETING/TRAINING |
| `startDate` / `endDate` | ✅ | |
| `projectId` (opsional) | ✅ | Wajib jika travelType = SALES |
| `participants` (relasi TravelParticipant) | ✅ | |
| `bailouts` (relasi Bailout) | ✅ | Opsional, bisa ditambah kapan saja |
| `status` (TravelStatus enum) | ✅ | Lengkap: DRAFT→SUBMITTED→APPROVED_Lx→APPROVED→REJECTED/REVISION |
| URL tiket/booking (string field di TravelRequest) | ❌ **MISSING** | Saat ini hanya ada `bookingRef` di model Bailout (per-item). Tidak ada field booking URL di level TravelRequest itu sendiri. Jika URL tiket/penginapan memang per-bailout item, ini oke. Jika ingin field global, perlu tambahkan. |

**Rekomendasi Schema:**  
Menambahkan field opsional `bookingUrls String[] @db.Text` atau dibiarkan di level Bailout via `bookingRef` yang sudah ada — tergantung kebutuhan. Untuk sekarang, **tidak perlu migrasi schema** karena bookingRef per-bailout sudah cukup.

---

### Analisis Schema — `Bailout`

| Field | Ada? | Catatan |
|-------|------|---------|
| `category` (TRANSPORT/HOTEL/MEAL/OTHER) | ✅ | |
| `amount` | ✅ | |
| `description` | ✅ | |
| Transport: mode, carrier, from/to, tiket, kelas | ✅ | Semua nullable/opsional |
| Hotel: nama, alamat, checkIn/Out, roomType | ✅ | Semua nullable/opsional |
| Meal: mealDate, mealLocation | ✅ | Nullable |
| `status` (DRAFT→SUBMITTED→APPROVED_CHIEF→APPROVED_DIRECTOR→DISBURSED/REJECTED) | ✅ | |
| Approval chief & director fields | ✅ | |

**Kesimpulan:** Schema Bailout sudah sangat fleksibel — semua field detail bersifat opsional sesuai kebutuhan.

---

### Analisis Backend — `travelRequest` Router

#### ❌ BUG 1 — Tidak Ada Role Check saat Create

**File:** `src/server/api/routers/travelRequest.ts` — `create` mutation

**Masalah:** Endpoint `create` menggunakan `protectedProcedure` (semua user yang login bisa akses). Sesuai requirement, hanya `SALES_EMPLOYEE` dan `SALES_CHIEF` yang boleh membuat BussTrip.

**Fix yang dibutuhkan:**
```typescript
// Tambahkan di awal mutation create:
const allowedRoles = ["SALES_EMPLOYEE", "SALES_CHIEF"];
if (!allowedRoles.includes(ctx.session.user.role)) {
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Hanya Sales Employee dan Sales Chief yang bisa mengajukan BussTrip",
  });
}
```

---

#### ❌ BUG 2 — Approval Chain Tidak Mempertimbangkan Role Requester

**File:** `src/server/api/routers/travelRequest.ts` — `submit` mutation

**Masalah:** Saat ini, `submit` selalu membuat L1 (supervisor) + L2 (manager dept) + L3 (director). Padahal:
- Jika requester adalah **SALES_CHIEF** → tidak perlu L1, langsung ke L3 (Director)
- Jika requester adalah **SALES_EMPLOYEE** → L1 (Sales Chief = supervisornya) → L3 (Director)
- L2 (Manager dept) seharusnya tidak dipakai untuk Sales flow, kecuali ada Sales Manager di antara Chief dan Director

**Fix yang dibutuhkan:**
```typescript
// Di dalam submit mutation, ganti logika approval chain:
const requesterRole = request.requester.role;
const approvalEntries: { level: ApprovalLevel; approverId: string }[] = [];

if (requesterRole === "SALES_EMPLOYEE") {
  // L1 = Sales Chief (supervisor langsung)
  if (request.requester.supervisorId) {
    approvalEntries.push({
      level: ApprovalLevel.L1_SUPERVISOR,
      approverId: request.requester.supervisorId,
    });
  }
}
// L3 = Director (untuk semua)
const directorId = request.requester.department?.directorId ?? /* fallback */;
if (directorId) {
  approvalEntries.push({
    level: ApprovalLevel.L3_DIRECTOR,
    approverId: directorId,
  });
}
```

---

#### ⚠️ ISSUE 3 — Participant Selection Tidak Disimpan Saat Update

**File:** `src/server/api/routers/travelRequest.ts` — `update` mutation

**Kondisi:** Update sudah ada, dan `participantIds` sudah diterima. OK dari sisi API. Masalahnya ada di frontend (lihat Frontend Issues).

---

### Analisis Frontend — Travel Page (`src/app/(authenticated)/travel/page.tsx`)

#### ❌ ISSUE 4 — Tidak Ada Role Guard untuk Tombol "New Request"

**Masalah:** Semua user (termasuk yang bukan Sales) dapat melihat dan mengklik tombol `+ New Request`. Seharusnya hanya `SALES_EMPLOYEE` dan `SALES_CHIEF` yang bisa membuat BussTrip.

**Fix:**
```tsx
const { data: session } = useSession();
const canCreate = ["SALES_EMPLOYEE", "SALES_CHIEF"].includes(session?.user?.role ?? "");

// Lalu kondisikan tombol:
{canCreate && <Button onClick={() => setIsFormOpen(true)}>+ New Request</Button>}
```

---

#### ❌ ISSUE 5 — Form Tidak Ada Tab Peserta (Participant)

**File:** `src/components/features/travel/TravelRequestForm.tsx`

**Masalah:**
- Form hanya memiliki 2 tab: "Informasi Dasar" dan "Dana Talangan"
- **Tidak ada tab untuk memilih Peserta**
- Type `TravelRequestFormData` tidak memiliki field `participantIds`
- API `create` dan `update` sudah menerima `participantIds`, tapi frontend tidak mengirimkannya

**Fix yang dibutuhkan:**
1. Tambahkan `participantIds: string[]` ke `TravelRequestFormData`
2. Tambahkan tab ketiga "👥 Peserta" di form
3. Di tab peserta: tampilkan daftar user aktif (dari `user.getAll` atau endpoint khusus), dengan search/filter, dan checkbox/multi-select
4. Di `handleCreate` di page.tsx: tambahkan `participantIds: formData.participantIds`

---

#### ❌ ISSUE 6 — Tab Page Tidak Role-Based

**Masalah:** Page menampilkan 3 tab: "Pengajuan Busstrip", "Approval Supervisor", "Approval Director" untuk semua user. Seharusnya:

| Role | Tab yang Tampil |
|------|----------------|
| SALES_EMPLOYEE | Pengajuan saja |
| SALES_CHIEF | Pengajuan + Approval Supervisor |
| DIRECTOR/ADMIN | Pengajuan (semua) + Approval Director |
| MANAGER | Sesuai role yang relevan |

---

#### ❌ ISSUE 7 — Detail View Tidak Menampilkan Alasan Penolakan secara Jelas

**Masalah:** Saat sebuah BussTrip ditolak (`status = REJECTED`), sales perlu melihat secara jelas **mengapa** ditolak. Saat ini di detail view ada approval list, tapi tidak ada banner/alert khusus yang menonjolkan alasan penolakan.

**Fix:** Tambahkan di detail view/modal:
```tsx
{request.status === "REJECTED" && (
  <div className="rounded-lg border border-red-200 bg-red-50 p-4">
    <p className="font-semibold text-red-700">❌ Pengajuan Ditolak</p>
    <p className="text-sm text-red-600 mt-1">
      {request.approvals.find(a => a.status === "REJECTED")?.rejectionReason ?? "Tidak ada alasan yang diberikan"}
    </p>
  </div>
)}
```

---

## Flow 2 — Claim

### Alur yang Diinginkan

```
Engineer / Sales (requester atau participant dari BussTrip)
        │
        ▼
[1] Pilih BussTrip terkait (hanya yang APPROVED/LOCKED)
        │
        ▼
[2] Pilih Tipe Claim:
    ├── ENTERTAINMENT (makan bersama client, gift, event)
    │     - Isi: tanggal, lokasi, nama tamu, perusahaan tamu,
    │       jabatan tamu, apakah pejabat pemerintah
    └── NON_ENTERTAINMENT (transport, hotel, makan biasa, dll)
          - Isi: kategori (TRANSPORT/HOTEL/TRAVEL_EXPENSES/dll),
            tanggal expense, deskripsi
        │
        ▼
[3] Upload Nota/Bukti (WAJIB minimal 1 attachment)
        │
        ▼
[4] Submit → Approval Chain:
    ┌─────────────────────────────────────────────┐
    │ Submitter = SALES_EMPLOYEE / Engineer biasa  │
    │  L1 → Supervisor (Sales Chief yang membawa) │
    │  L3 → Director                               │
    └─────────────────────────────────────────────┘
    ┌─────────────────────────────────────────────┐
    │ Submitter = SALES_CHIEF (supervisor)         │
    │  Langsung L3 → Director (skip L1)            │
    └─────────────────────────────────────────────┘
        │
        ├── Ditolak → Submitter notifikasi + alasan
        │
        ├── Disetujui → Status APPROVED
        │
        └── Finance tandai PAID → Status PAID
```

---

### Analisis Schema — `Claim`

| Field | Ada? | Catatan |
|-------|------|---------|
| `claimType` (ENTERTAINMENT / NON_ENTERTAINMENT) | ✅ | |
| Entertainment fields (type, date, location, guest info, isGovtOfficial) | ✅ | |
| Non-entertainment fields (category, date, destination, customerName) | ✅ | |
| `amount` | ✅ | |
| `coaId` (Chart of Account) | ✅ | Ada di schema, tapi belum di form UI |
| `attachments` (relasi Attachment) | ✅ | Required saat submit |
| `status` (DRAFT→SUBMITTED→APPROVED→PAID/REJECTED) | ✅ | |
| `isPaid`, `paidAt`, `paidBy`, `paymentReference` | ✅ | Untuk Finance |

**Kesimpulan:** Schema sudah lengkap untuk flow Claim.

---

### Analisis Backend — `claim` Router

#### ❌ BUG 8 — Approval Chain Salah untuk Claim

**File:** `src/server/api/routers/claim.ts` — `submit` mutation

**Kondisi saat ini:**
```typescript
// L1: Supervisor
if (claim.submitter.supervisorId) {
  approvalEntries.push({ level: ApprovalLevel.L1_SUPERVISOR, approverId: claim.submitter.supervisorId });
}
// L2: Finance jika amount > 5.000.000
if (Number(claim.amount) > 5000000) { /* tambah Finance */ }
```

**Masalah:**
- Jika submitter adalah SALES_CHIEF, approval tetap dibuat ke L1 (supervisor-nya SALES_CHIEF itu sendiri, yang mungkin adalah Director — duplikasi)
- Tidak ada L3 (Director) dalam approval claim saat ini! Hanya L1 (supervisor) dan kadang L2 (finance). Padahal setelah Sales Chief approve, harus ke Director.
- Logic Finance threshold (>5jt) mungkin bukan kebutuhan bisnis ini

**Fix yang dibutuhkan:**
```typescript
const submitterRole = claim.submitter.role;

if (submitterRole !== "SALES_CHIEF" && claim.submitter.supervisorId) {
  // L1: Supervisor (Sales Chief yang membawa engineer)
  approvalEntries.push({
    level: ApprovalLevel.L1_SUPERVISOR,
    approverId: claim.submitter.supervisorId,
  });
}

// L3: Director (untuk semua claim)
const directorId = claim.submitter.department?.directorId ?? /* fallback */;
if (directorId) {
  approvalEntries.push({
    level: ApprovalLevel.L3_DIRECTOR,
    approverId: directorId,
  });
}
```

> **Catatan:** Untuk mendapatkan `department.directorId` di submit claim, perlu tambahkan `include: { department: true }` di query `submitter` saat load claim.

---

#### ⚠️ ISSUE 9 — COA (Chart of Account) Tidak Bisa Diisi dari Form

**File:** `src/server/api/routers/claim.ts` — `createEntertainment` dan `createNonEntertainment`

**Kondisi:** Field `coaId` ada di schema Claim, dan relasi ke `ChartOfAccount` sudah ada. Tapi:
- Input mutation `createEntertainment` dan `createNonEntertainment` tidak menerima `coaId`
- Form ClaimForm tidak memiliki dropdown COA

**Fix:** Tambahkan `coaId: z.string().optional()` ke kedua mutation create + update, dan tambahkan dropdown ChartOfAccount di ClaimForm.

---

#### ✅ YANG SUDAH BENAR

- Claim hanya bisa dibuat untuk BussTrip dengan status `APPROVED` atau `LOCKED` ✅
- Hanya requester atau participant dari BussTrip yang bisa membuat claim ✅
- Minimal 1 attachment wajib ada sebelum submit ✅
- Soft delete hanya untuk DRAFT ✅
- Finance dapat `markAsPaid` ✅
- Update hanya bisa di status `DRAFT` atau `REVISION` ✅

---

### Analisis Frontend — Claims Page (`src/app/(authenticated)/claims/page.tsx`)

#### ❌ ISSUE 10 — ClaimForm Tidak Ada Field COA

**File:** `src/components/features/claims/ClaimForm.tsx`

**Masalah:** Tidak ada dropdown untuk memilih Chart of Account (COA). Field `coaId` ada di schema tapi tidak terexpose di UI.

---

#### ❌ ISSUE 11 — Pilihan Travel Request di ClaimForm Terlalu Lebar

**Kondisi:** `ClaimForm` menerima prop `travelRequests: TravelRequestOption[]` dan menampilkan dropdown. Tapi filter statusnya (hanya APPROVED/LOCKED) dilakukan di parent — perlu diverifikasi apakah di `ClaimsPage` sudah memfilter hanya trip yang APPROVED/LOCKED.

**Cek di:** `src/app/(authenticated)/claims/page.tsx` — query `api.travelRequest.getAll` untuk memastikan filter `status: "APPROVED"` atau `["APPROVED", "LOCKED"]` aktif.

---

## Checklist Perbaikan

Tandai dengan `[x]` saat sudah selesai dikerjakan.

### Backend Fixes

- [x] **#BUG-1** `travelRequest.create` — tambah role check (hanya SALES_EMPLOYEE & SALES_CHIEF)
- [x] **#BUG-2** `travelRequest.submit` — perbaiki approval chain berdasarkan role requester
  - SALES_EMPLOYEE: L1 (supervisor) → L3 (Director)
  - SALES_CHIEF: langsung L3 (Director)
- [x] **#BUG-8** `claim.submit` — perbaiki approval chain
  - SALES_EMPLOYEE/lainnya: L1 (supervisor) → L3 (Director)
  - SALES_CHIEF: langsung L3 (Director)
  - Finance L2 threshold dihapus dari sales flow
- [x] **#ISSUE-9** `claim.create*` — tambahkan field `coaId` opsional ke input schema dan mutation data
- [x] **Bonus** `user.ts` — tambahkan endpoint `getActiveUsers` (protectedProcedure) untuk participant picker

### Frontend Fixes

#### Travel Page & Form

- [x] **#ISSUE-4** `PengajuanTab` — tambah role guard pada tombol `+ New Request`
  - Hanya render jika `session.user.role === "SALES_EMPLOYEE" || "SALES_CHIEF" || "ADMIN"`
- [x] **#ISSUE-5** `TravelRequestForm` — tambahkan tab ketiga "👥 Peserta"
  - Ditambahkan `participantIds: string[]` ke type `TravelRequestFormData`
  - UI pilih peserta: query `getActiveUsers`, search input, checkbox list, badge selected
  - `participantIds` dipass saat `handleCreate` di `PengajuanTab`
- [x] **#ISSUE-6** `TravelRequestsPage` — filter tab berdasarkan role
  - Supervisor tab: SALES_CHIEF, MANAGER, DIRECTOR, ADMIN
  - Director tab: DIRECTOR, ADMIN, MANAGER
- [x] **#ISSUE-7** Detail view BussTrip — tambahkan rejection alert yang jelas
  - Banner merah/kuning dengan alasan penolakan jika status = REJECTED atau REVISION

#### Claims Page & Form

- [x] **#ISSUE-10** `ClaimForm` — tambahkan dropdown Chart of Account (COA)
  - Query `api.chartOfAccount.getAll` (filter `isActive: true`)
  - Field `coaId` ditambahkan ke `EntertainmentFormData` dan `NonEntertainmentFormData`
  - `coaId` dipass ke `handleCreate` dan `handleUpdate` di `claims/page.tsx`
- [x] **#ISSUE-11** `ClaimsPage` — filter travel request di dropdown form
  - Sudah filter: hanya trip dengan status APPROVED atau LOCKED yang tampil (verified by audit)

---

## Status Tiap Layer

### Schema (Prisma) — `prisma/schema.prisma`

| Model | Status | Catatan |
|-------|--------|---------|
| `TravelRequest` | ✅ Sesuai | Field lengkap, relasi oke |
| `TravelParticipant` | ✅ Sesuai | |
| `Bailout` | ✅ Sesuai | Semua field opsional — sangat fleksibel |
| `Claim` | ✅ Sesuai | COA field ada, Attachment relasi ada |
| `Attachment` | ✅ Sesuai | |
| `Approval` | ✅ Sesuai | Bisa link ke TravelRequest ATAU Claim |
| `User` (role, supervisorId, department) | ✅ Sesuai | Hierarki sudah ada |
| `Department` (managerId, directorId) | ✅ Sesuai | Diperlukan untuk approval chain |

### Backend (tRPC Routers)

| Router | Status | Masalah |
|--------|--------|----------|
| `travelRequest.ts` | ✅ Fixed | BUG-1 dan BUG-2 sudah diperbaiki |
| `bailout.ts` | ✅ Oke | Flow sudah benar |
| `claim.ts` | ✅ Fixed | BUG-8 dan ISSUE-9 sudah diperbaiki |
| `approval.ts` | ✅ Oke | Approve/reject/revision sudah lengkap |
| `user.ts` | ✅ Updated | Tambah `getActiveUsers` endpoint |
| `project.ts` | ✅ Oke | Untuk dropdown Sales |

### Frontend (Pages & Components)

| File | Status | Masalah |
|------|--------|----------|
| `travel/page.tsx` | ✅ Fixed | ISSUE-4, ISSUE-6, ISSUE-7 sudah diselesaikan |
| `TravelRequestForm.tsx` | ✅ Fixed | ISSUE-5 — tab Peserta sudah ditambahkan |
| `BailoutPanel.tsx` | ✅ Oke | Sudah bisa add/submit/approve bailout post-create |
| `claims/page.tsx` | ✅ Updated | coaId dipass ke semua create/update mutations |
| `ClaimForm.tsx` | ✅ Fixed | ISSUE-10 — COA dropdown sudah ditambahkan |

---

## Urutan Pengerjaan yang Disarankan

Kerjakan dalam urutan ini agar perubahan tidak saling bertabrakan:

1. **Backend dulu** (tidak ada perubahan UI, aman):
   - Fix BUG-1: role check di `travelRequest.create`
   - Fix BUG-2: approval chain di `travelRequest.submit`
   - Fix BUG-8: approval chain di `claim.submit`
   - Fix ISSUE-9: tambah `coaId` ke claim mutations

2. **Frontend — Travel Form & Page**:
   - ISSUE-5: Tambah tab Peserta di `TravelRequestForm`
   - ISSUE-4: Role guard tombol `+ New Request`
   - ISSUE-6: Tab page berdasarkan role
   - ISSUE-7: Rejection alert di detail view

3. **Frontend — Claims Form & Page**:
   - ISSUE-10: Tambah COA dropdown di `ClaimForm`
   - ISSUE-11: Verifikasi filter trip di `ClaimsPage`

4. **Testing manual** per flow:
   - Login sebagai SALES_EMPLOYEE → buat BussTrip → submit → cek approval chain
   - Login sebagai SALES_CHIEF → buat BussTrip → submit → langsung ke Director
   - Login sebagai DIRECTOR → approve → cek status jadi APPROVED
   - Login sebagai SALES_EMPLOYEE (participant) → buat Claim → submit → cek chain
   - Login sebagai FINANCE → tandai PAID

---

*Dokumen ini diperbarui terakhir: 3 Maret 2026 — Semua 9 perbaikan selesai diimplementasi.*
