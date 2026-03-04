# 💰 Bailout (Dana Talangan) — Flow & Implementation Plan

> **Last updated:** 4 Maret 2026  
> **Status review:** Fase 1–3 selesai ✅ | Fase 4 pending  
> **Reviewer:** GitHub Copilot AI

---

## Daftar Isi

1. [Ringkasan Flow](#1-ringkasan-flow)
2. [Flow Detail Per Aktor](#2-flow-detail-per-aktor)
3. [Status Lifecycle Bailout](#3-status-lifecycle-bailout)
4. [Struktur Data Bailout](#4-struktur-data-bailout)
5. [Temuan Masalah Pasca-Merge](#5-temuan-masalah-pasca-merge)
6. [Progress Implementasi](#6-progress-implementasi)
7. [Checklist Teknis](#7-checklist-teknis)
8. [Bug Fixes Pasca-Implementasi (4 Maret 2026)](#8-bug-fixes-pasca-implementasi-4-maret-2026)

---

## 1. Ringkasan Flow

```
  SALES/EMPLOYEE          SALES_CHIEF/MANAGER        DIRECTOR               FINANCE
  ─────────────           ───────────────────        ────────               ───────
  [1] Buat BusTrip    →  
  [2] Tambah Bailout  →  
  [3] Submit BusTrip  →  
                         [4] Approve BusTrip    →  
                                                    [5] Approve BusTrip  →
  
  ── setelah BusTrip APPROVED ──────────────────────────────────────────────────────
  
  [6] Submit Bailout  →  
                         [7] Approve Bailout    →
                                                    [8] Approve Bailout  →
                                                                            [9] Cairkan
                                                                            [10] Lampirkan Bukti
```

Setiap Bailout adalah record **terpisah** per kategori pengeluaran.
Satu BusTrip bisa punya banyak Bailout (transport, hotel, makan, dll.).
Setiap Bailout punya `financeId` sendiri — siapa finance yang memproses pencairan.

---

## 2. Flow Detail Per Aktor

### 👤 Sales Employee / Sales Chief (Pemohon)

**Saat membuat BusTrip:**
- Buka halaman `/travel`
- Klik **"New Business Trip Request"**
- Isi data perjalanan (tujuan, tanggal, tipe, peserta)
- Pada tab **"Dana Talangan"**, tambahkan 1 atau lebih bailout:
  - Setiap item memilih kategori: `TRANSPORT`, `HOTEL`, `MEAL`, atau `OTHER`
  - Isi detail spesifik per kategori (no. penerbangan, nama hotel, tanggal makan, dll.)
  - Isi jumlah yang dibutuhkan
- Submit BusTrip untuk approval

**Setelah BusTrip APPROVED:**
- Pemohon bisa submit bailout (dari panel BusTrip atau halaman `/travel`)
- Setiap bailout di-submit secara individual (bisa bertahap sesuai kebutuhan)
- Status berubah: `DRAFT` → `SUBMITTED`

**Catatan:** Bailout bisa dibuat SESUDAH BusTrip approved. Tidak harus semuanya dibuat di awal.

---

### 👔 Sales Chief / Manager (Approver Level 1)

- Menerima notifikasi WhatsApp saat ada bailout SUBMITTED
- Masuk ke halaman `/bailout`
- Review detail bailout (kategori, jumlah, keterangan)
- Klik **"Setujui (Chief)"** → status: `SUBMITTED` → `APPROVED_CHIEF`
- Atau **"Tolak"** dengan alasan → status: `REJECTED`
- Director menerima notifikasi WhatsApp setelah approval chief

---

### 🏢 Director (Approver Level 2)

- Menerima notifikasi WhatsApp saat ada bailout `APPROVED_CHIEF`
- Masuk ke halaman `/bailout`
- Review dan klik **"Setujui (Direktur)"** → status: `APPROVED_CHIEF` → `APPROVED_DIRECTOR`
- Atau tolak dengan alasan
- Setelah approve: requester dan team Finance menerima notifikasi

---

### 💼 Finance (Pencair Dana)

- Menerima notifikasi saat bailout mencapai `APPROVED_DIRECTOR`
- Masuk ke halaman `/bailout` (atau melalui menu Finance)
- Melihat daftar bailout yang siap dicairkan (`APPROVED_DIRECTOR`)
- Untuk setiap bailout:
  1. Review detail (kategori, jumlah, info perjalanan terkait)
  2. Transfer/bayarkan ke rekening pemohon secara external (bank/transfer manual)
  3. Kembali ke sistem, klik **"Cairkan Dana"**:
     - Isi referensi pencairan (no. transaksi, dll.) — opsional
     - Upload bukti transfer/dokumen pembayaran (`storageUrl`)
  4. Status berubah: `APPROVED_DIRECTOR` → `DISBURSED`
  5. `financeId` otomatis diisi dengan ID user finance yang memproses

---

## 3. Status Lifecycle Bailout

```
  DRAFT
    │
    ▼ (submit oleh pemohon setelah BusTrip approved)
  SUBMITTED
    │  └─── REJECTED (oleh Chief/Manager, kapan saja)
    ▼
  APPROVED_CHIEF
    │  └─── REJECTED (oleh Director, kapan saja)
    ▼
  APPROVED_DIRECTOR
    │
    ▼ (oleh Finance)
  DISBURSED
```

**Aturan transisi status:**

| Dari              | Ke                 | Siapa              |
|-------------------|--------------------|--------------------|
| `DRAFT`           | `SUBMITTED`        | Pemohon (requester)|
| `SUBMITTED`       | `APPROVED_CHIEF`   | SALES_CHIEF, MANAGER, DIRECTOR, ADMIN |
| `SUBMITTED`       | `REJECTED`         | SALES_CHIEF, MANAGER, DIRECTOR, ADMIN |
| `APPROVED_CHIEF`  | `APPROVED_DIRECTOR`| DIRECTOR, ADMIN    |
| `APPROVED_CHIEF`  | `REJECTED`         | DIRECTOR, ADMIN    |
| `APPROVED_DIRECTOR` | `DISBURSED`      | FINANCE, ADMIN     |

---

## 4. Struktur Data Bailout

### Field Utama

```prisma
model Bailout {
  id            String          @id @default(cuid())
  bailoutNumber String          @unique          // BLT-2026-00001
  travelRequestId String                          // wajib terkait BusTrip
  requesterId   String                            // pemohon
  
  category      BailoutCategory @default(OTHER)   // TRANSPORT | HOTEL | MEAL | OTHER
  description   String                            // deskripsi kebutuhan
  amount        Decimal(15,2)                     // jumlah yang dibutuhkan

  // Field spesifik kategori (per jenis pengeluaran)
  // → TRANSPORT: transportMode, carrier, departureFrom, arrivalTo, dll.
  // → HOTEL: hotelName, hotelAddress, checkIn, checkOut, roomType
  // → MEAL: mealDate, mealLocation

  status        BailoutStatus   @default(DRAFT)

  // Pencairan (diisi oleh Finance)
  financeId     String?                           // ← User finance yang memproses
  disbursedAt   DateTime?
  disbursementRef String?                         // no. referensi transaksi
  storageUrl    String?                           // ← bukti transfer / dokumen

  // Penolakan
  rejectedAt    DateTime?
  rejectionReason String?

  // Relasi approval chain (opsional, untuk audit trail lengkap)
  approvals     Approval[]
}
```

### Enum BailoutStatus yang Benar

```prisma
enum BailoutStatus {
  DRAFT
  SUBMITTED
  APPROVED_CHIEF      // ← bukan APPROVED_L1
  APPROVED_DIRECTOR   // ← bukan APPROVED_L2
  REJECTED
  DISBURSED
}
```

---

## 5. Temuan Masalah Pasca-Merge

Setelah merge dari branch `main`, ditemukan beberapa inkonsistensi berikut.
**Semua masalah di bawah telah diselesaikan per 4 Maret 2026.** ✅

### 🔴 KRITIS — Menyebabkan runtime error ✅ Selesai

| # | File | Masalah | Status |
|---|------|---------|--------|
| 1 | `schema.prisma` | `BailoutStatus` enum masih pakai `APPROVED_L1`, `APPROVED_L2` | ✅ Diganti ke `APPROVED_CHIEF`/`APPROVED_DIRECTOR` |
| 2 | `schema.prisma` | `Bailout` model belum punya kolom `financeId` dan `storageUrl` | ✅ Migration baru dibuat dan dijalankan |
| 3 | `finance.ts` | `attachFileToBailout` mengacu `BailoutStatus.APPROVED_L2` | ✅ Diganti ke `APPROVED_DIRECTOR` |
| 4 | `bailout.ts` | `approveByChief`/`approveByDirector` set status ke `APPROVED_L1`/`L2` | ✅ Diganti ke `APPROVED_CHIEF`/`APPROVED_DIRECTOR` |
| 5 | `bailout.ts` | `disburse` check status `APPROVED_L2` yang tidak ada di DB | ✅ Diganti ke `APPROVED_DIRECTOR` |

### 🟡 SEDANG — Fungsionalitas belum lengkap ✅ Selesai

| # | File | Masalah | Status |
|---|------|---------|--------|
| 6 | `bailout.ts` | `disburse` tidak mengisi `financeId` dengan id user yang login | ✅ Ditambahkan `financeId: ctx.session.user.id` |
| 7 | `bailout.ts` | `disburse` tidak bisa menerima `storageUrl` | ✅ Field `storageUrl` ditambahkan ke input disburse |
| 8 | `finance.ts` | `getBailout` include `approvals` dengan `orderBy: { sequence: "asc" }` | ✅ Diperbaiki sesuai schema DB |
| 9 | `finance.ts` | `listBailout` tidak include info approver | ✅ Include approver chain ditambahkan |
| 10 | `schema.prisma` | `ApprovalLevel` enum pakai nama lama | ✅ Disinkronkan dengan DB |

### 🔵 MINOR — UX dan fitur yang belum aktif ✅ Selesai

| # | File | Masalah | Status |
|---|------|---------|--------|
| 11 | `SidebarNav.tsx` | Menu "Bailout Approval" di-comment out | ✅ Di-uncomment |
| 12 | `bailout/page.tsx` | Status filter tidak sesuai enum | ✅ Diperbaiki sesuai `APPROVED_CHIEF`/`APPROVED_DIRECTOR` |
| 13 | `travel/page.tsx` | Belum ada cara submit bailout dari halaman detail trip | ✅ Tombol `💰 Bailout` dan `BailoutPanel` ditambahkan |
| 14 | Backend | Tidak ada validasi status BusTrip sebelum submit bailout | ✅ Validasi ditambahkan di `bailout.create` |

### 🗑️ CLEANUP — File konflik dari sesi sebelumnya ✅ Selesai

| # | File | Status |
|---|------|--------|
| 15 | `prisma/migrations/20260303000000_fix_schema_drift/migration.sql` | ✅ Dihapus |

---

## 6. Progress Implementasi

### Fase 1: Perbaikan Schema & Database ✅ Selesai (3 Maret 2026)
- [x] **1.1** Hapus migration `20260303000000_fix_schema_drift` yang konflik
- [x] **1.2** Update `schema.prisma` — ganti `BailoutStatus` enum ke `APPROVED_CHIEF`/`APPROVED_DIRECTOR`
- [x] **1.3** Update `schema.prisma` — ganti `ApprovalLevel` enum ke nilai yang sesuai DB (`L1_SUPERVISOR` dll.)
- [x] **1.4** Buat migration baru untuk tambah kolom `financeId` dan `storageUrl` ke tabel `Bailout`
- [x] **1.5** Jalankan `prisma migrate deploy` dan `prisma generate`

### Fase 2: Perbaikan Backend Router ✅ Selesai (3 Maret 2026)

- [x] **2.1** `bailout.ts` — ganti `APPROVED_L1` → `APPROVED_CHIEF`, `APPROVED_L2` → `APPROVED_DIRECTOR`
- [x] **2.2** `bailout.ts` — `disburse`: tambah `financeId: ctx.session.user.id` dan terima field `storageUrl`
- [x] **2.3** `bailout.ts` — `create`: tambahkan validasi BusTrip harus di-approve sebelum bailout bisa dibuat secara mandiri (post-trip)
- [x] **2.4** `finance.ts` — ganti `BailoutStatus.APPROVED_L2` → `BailoutStatus.APPROVED_DIRECTOR`
- [x] **2.5** `finance.ts` — perbaiki include di `getBailout` (hapus `sequence` jika tidak ada di DB)
- [x] **2.6** `finance.ts` — tambahkan endpoint `disburse` khusus finance (delegasi ke `bailout.disburse`)
- [x] **2.7** `finance.ts` — tambahkan `financeId` dan `storageUrl` saat `attachFileToBailout`

### Fase 3: Perbaikan Frontend ✅ Selesai (3 Maret 2026)

- [x] **3.1** `SidebarNav.tsx` — uncomment menu "Bailout Approval"
- [x] **3.2** `bailout/page.tsx` — pastikan status filter sesuai dengan enum yang benar
- [x] **3.3** `bailout/page.tsx` — tambahkan kolom "Finance" di tabel (siapa yang memproses)
- [x] **3.4** `travel/page.tsx` — tambahkan tombol `💰 Bailout` + `BailoutPanel` di setiap baris trip
- [x] **3.5** Finance view — tambahkan form upload bukti transfer di modal "Cairkan Dana"

### Fase 4: Fitur Tambahan (Nice to Have)

- [ ] **4.1** Notifikasi in-app (db `Notification`) untuk setiap perubahan status bailout
- [ ] **4.2** Halaman finance khusus (`/finance/bailouts`) dengan filter dan summary total
- [ ] **4.3** Export PDF summary bailout per BusTrip
- [ ] **4.4** Validasi: satu finance hanya bisa proses bailout yang belum ada `financeId`-nya

---

## 8. Bug Fixes Pasca-Implementasi (4 Maret 2026)

Setelah Fase 1–3 selesai, ditemukan dan diperbaiki beberapa bug berikut:

| # | Komponen | Bug | Fix |
|---|----------|-----|-----|
| B1 | `travel/page.tsx` | Edit modal tidak merestorasi data bailout yang sudah disimpan — field banyak yang hilang | Interface `TravelRequest.bailouts` dilengkapi semua field; `initialData` di edit modal di-mapping ulang secara lengkap |
| B2 | `travel/page.tsx` | Edit modal tidak merestorasi data peserta (tab Peserta kosong) | Tambahkan `participantIds: editingRequest.participants.map((p) => p.userId)` ke `initialData` |
| B3 | `TravelRequestForm.tsx` | Checkbox "Finance sama dengan di atas" selalu unchecked saat buka edit — user harus re-check manual | Inisialisasi `sameFinanceFlags` sekarang auto-detect dengan membandingkan `financeId` antar bailout yang berdekatan |
| B4 | `TravelRequestForm.tsx` | Label di sebelah checkbox menampilkan nama user finance secara eksplisit (tidak perlu) | Hapus spans nama finance di sebelah label checkbox |
| B5 | `travelRequest.ts` | `Unique constraint failed on bailoutNumber` saat simpan edit — terjadi karena numbering pakai `COUNT` (berbahaya setelah ada deletion) | Ganti ke `findFirst(...orderBy: bailoutNumber desc)` untuk ambil nomor tertinggi, lalu increment; berlaku di `create` dan `update` |
| B6 | `travelRequest.ts` | `update` mutation tidak menerima field bailout — data bailout di edit tidak tersimpan ke DB | Tambahkan input Zod schema lengkap untuk bailouts di `update`; logika delete-then-recreate untuk bailout DRAFT |
| B7 | `travelRequest.ts` | `getAll` tidak include relasi `finance` pada bailout | Ganti `bailouts: true` ke `bailouts: { include: { finance: { select: { id, name, email } } } }` |
| B8 | `react.tsx` | Semua log tRPC dev-mode tampil merah sebagai "Console Error" di browser | Custom `logger` di `loggerLink`: pakai `console.log` untuk log biasa, `console.error` hanya untuk error nyata |
| B9 | `approval.ts` | User role ADMIN mendapat error "This approval has already been processed" saat approve dari halaman approvals | Tambah `isAdmin` bypass di semua 6 action mutation + query `getMyApprovals` dan `getPendingCount` |
| B10 | `travel/page.tsx` | View modal tidak menampilkan finance yang ditugaskan di tiap bailout | Tambah baris `💳 Finance:` di setiap bailout card di view modal |
| B11 | `travel/page.tsx` | View modal menyembunyikan seksi Peserta jika kosong — tidak ada feedback "tidak ada peserta" | Seksi Peserta sekarang selalu ditampilkan; kosong = tampil pesan "Tidak ada peserta tambahan" |

---

## 7. Checklist Teknis

### Urutan Pengerjaan yang Disarankan

```
[Fase 1] Schema → [Fase 2] Backend → [Fase 3] Frontend → Test → [Fase 4]
```

### File yang Diubah

| File | Aksi | Status |
|------|------|--------|
| `prisma/migrations/20260303000000_fix_schema_drift/migration.sql` | **HAPUS** — konflik dengan schema saat ini | ✅ Selesai |
| `prisma/schema.prisma` | Update enum `BailoutStatus` dan `ApprovalLevel` | ✅ Selesai |
| `prisma/migrations/20260303_add_bailout_finance_fields/migration.sql` | **DIBUAT** — tambah `financeId`, `storageUrl` ke Bailout | ✅ Selesai |
| `src/server/api/routers/bailout.ts` | Fix status enum references, tambah `financeId` di disburse | ✅ Selesai |
| `src/server/api/routers/finance.ts` | Fix `APPROVED_L2` reference, perbaiki include | ✅ Selesai |
| `src/components/navigation/SidebarNav.tsx` | Uncomment bailout menu | ✅ Selesai |
| `src/app/(authenticated)/bailout/page.tsx` | Pastikan status values konsisten | ✅ Selesai |
| `src/server/api/routers/travelRequest.ts` | Fix bailout numbering (max-based), update mutation terima bailouts, getAll include finance | ✅ Selesai (4 Mar) |
| `src/server/api/routers/approval.ts` | ADMIN bypass di 6 action mutation + 2 query filter | ✅ Selesai (4 Mar) |
| `src/components/features/travel/TravelRequestForm.tsx` | Auto-detect sameFinanceFlags, fix label, fix participantIds di initialData | ✅ Selesai (4 Mar) |
| `src/app/(authenticated)/travel/page.tsx` | Fix interface, edit initialData, handleUpdate, view modal finance & peserta | ✅ Selesai (4 Mar) |
| `src/trpc/react.tsx` | Custom loggerLink logger (console.log vs console.error) | ✅ Selesai (4 Mar) |

### Pertanyaan yang Sudah Dikonfirmasi

1. **Apakah bailout bisa dibuat SEBELUM BusTrip di-approve?**  
   ✅ Validasi ditambahkan — BusTrip harus sudah APPROVED sebelum bailout bisa di-submit.

2. **Apakah Finance bisa pilih siapa yang mengerjakan?**  
   ✅ `financeId` diisi otomatis dari user yang login saat klik "Cairkan" (desain saat ini).

3. **Apakah upload bukti transfer WAJIB saat cairkan?**  
   ✅ `storageUrl` tetap opsional per kebutuhan saat ini.

4. **Apakah `ApprovalLevel` untuk bailout menggunakan generic chain (via `Approval` model)?**  
   ✅ Bailout menggunakan status langsung — tidak memakai `Approval` records (sengaja disederhanakan).
