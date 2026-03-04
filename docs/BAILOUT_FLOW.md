# 💰 Bailout (Dana Talangan) — Flow & Implementation Plan

> **Last updated:** 3 Maret 2026  
> **Status review:** Post-merge dari branch `main`  
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

Setelah merge dari branch `main`, ditemukan beberapa inkonsistensi berikut:

### 🔴 KRITIS — Menyebabkan runtime error

| # | File | Masalah | Dampak |
|---|------|---------|--------|
| 1 | `schema.prisma` | `BailoutStatus` enum masih pakai `APPROVED_L1`, `APPROVED_L2`, dll. — tapi **DB sudah pakai** `APPROVED_CHIEF`, `APPROVED_DIRECTOR` (dari migration `20260223162635`) | Prisma client generate error / query mismatch |
| 2 | `schema.prisma` | `Bailout` model belum punya kolom `financeId` dan `storageUrl` di DB | Column not found error saat query menggunakan `finance.*` |
| 3 | `finance.ts` | `attachFileToBailout` mengacu `BailoutStatus.APPROVED_L2` — nilai ini tidak ada di DB | TypeScript compile ok tapi runtime mismatch |
| 4 | `bailout.ts` | `approveByChief` set status ke `APPROVED_L1`; `approveByDirector` ke `APPROVED_L2` — tapi DB tidak punya nilai itu | `prisma.bailout.update` akan gagal |
| 5 | `bailout.ts` | `disburse` check status `APPROVED_L2` yang tidak ada di DB | Finance tidak bisa cairkan dana |

### 🟡 SEDANG — Fungsionalitas belum lengkap

| # | File | Masalah | Dampak |
|---|------|---------|--------|
| 6 | `bailout.ts` | `disburse` tidak mengisi `financeId` dengan id user yang login | Tidak bisa tracking siapa yang mencairkan |
| 7 | `bailout.ts` | `disburse` tidak bisa menerima `storageUrl` (bukti transfer) | Finance tidak bisa lampirkan bukti saat cairkan |
| 8 | `finance.ts` | `getBailout` include `approvals` dengan `orderBy: { sequence: "asc" }` — field `sequence` ada di schema tapi perlu cek di DB | Query bisa error jika kolom tidak ada |
| 9 | `finance.ts` | `listBailout` tidak include info `chiefApprover` / `directorApprover` | Finance tidak tahu siapa yang sudah approve |
| 10 | `schema.prisma` | `ApprovalLevel` enum masih pakai nama lama (`SALES_LEAD`, `DEPT_CHIEF`, dll.) tapi DB sudah pakai `L1_SUPERVISOR`, dll. | Error pada approval flow |

### 🔵 MINOR — UX dan fitur yang belum aktif

| # | File | Masalah | Dampak |
|---|------|---------|--------|
| 11 | `SidebarNav.tsx` | Menu "Bailout Approval" di-comment out | Finance/Chief tidak bisa akses halaman `/bailout` via sidebar |
| 12 | `bailout/page.tsx` | Menggunakan `APPROVED_CHIEF`/`APPROVED_DIRECTOR` (benar) tapi router mengembalikan `APPROVED_L1`/`L2` | Filter status di halaman tidak bekerja |
| 13 | Tidak ada | Belum ada cara bagi SALES_EMPLOYEE untuk submit bailout dari `/travel` detail | User harus tahu ada URL tersendiri |
| 14 | Tidak ada | Tidak ada validasi bahwa BusTrip harus `APPROVED` / `LOCKED` sebelum bailout bisa di-submit | User bisa submit bailout sebelum trip disetujui |

### 🗑️ CLEANUP — File konflik dari sesi sebelumnya

| # | File | Masalah |
|---|------|---------|
| 15 | `prisma/migrations/20260303000000_fix_schema_drift/migration.sql` | File migration yang dibuat sebelum merge — menambahkan `chiefApproverId` dll. yang sekarang tidak dipakai dan akan konflik dengan schema saat ini |

---

## 6. Progress Implementasi

### Fase 1: Perbaikan Schema & Database
- [ ] **1.1** Hapus migration `20260303000000_fix_schema_drift` yang konflik
- [ ] **1.2** Update `schema.prisma` — ganti `BailoutStatus` enum ke `APPROVED_CHIEF`/`APPROVED_DIRECTOR`
- [ ] **1.3** Update `schema.prisma` — ganti `ApprovalLevel` enum ke nilai yang sesuai DB (`L1_SUPERVISOR` dll.) atau sebaliknya
- [ ] **1.4** Buat migration baru untuk tambah kolom `financeId` dan `storageUrl` ke tabel `Bailout`
- [ ] **1.5** Jalankan `prisma migrate deploy` dan `prisma generate`

### Fase 2: Perbaikan Backend Router

- [ ] **2.1** `bailout.ts` — ganti `APPROVED_L1` → `APPROVED_CHIEF`, `APPROVED_L2` → `APPROVED_DIRECTOR`
- [ ] **2.2** `bailout.ts` — `disburse`: tambah `financeId: ctx.session.user.id` dan terima field `storageUrl`
- [ ] **2.3** `bailout.ts` — `create`: tambahkan validasi BusTrip harus di-approve sebelum bailout bisa dibuat secara mandiri (post-trip)
- [ ] **2.4** `finance.ts` — ganti `BailoutStatus.APPROVED_L2` → `BailoutStatus.APPROVED_DIRECTOR`
- [ ] **2.5** `finance.ts` — perbaiki include di `getBailout` (hapus `sequence` jika tidak ada di DB, atau sesuaikan)
- [ ] **2.6** `finance.ts` — tambahkan endpoint `disburse` khusus finance (atau delegasikan ke `bailout.disburse`)
- [ ] **2.7** `finance.ts` — tambahkan `financeId` dan `storageUrl` saat `attachFileToBailout`

### Fase 3: Perbaikan Frontend

- [ ] **3.1** `SidebarNav.tsx` — uncomment menu "Bailout Approval"
- [ ] **3.2** `bailout/page.tsx` — pastikan status filter sesuai dengan enum yang benar
- [ ] **3.3** `bailout/page.tsx` — tambahkan kolom "Finance" di tabel (siapa yang memproses)
- [ ] **3.4** `travel/page.tsx` — tambahkan tombol "Submit Bailout" di detail view setelah BusTrip approved
- [ ] **3.5** Finance view — tambahkan form upload bukti transfer di modal "Cairkan Dana"

### Fase 4: Fitur Tambahan (Nice to Have)

- [ ] **4.1** Notifikasi in-app (db `Notification`) untuk setiap perubahan status bailout
- [ ] **4.2** Halaman finance khusus (`/finance/bailouts`) dengan filter dan summary total
- [ ] **4.3** Export PDF summary bailout per BusTrip
- [ ] **4.4** Validasi: satu finance hanya bisa proses bailout yang belum ada `financeId`-nya

---

## 7. Checklist Teknis

### Urutan Pengerjaan yang Disarankan

```
[Fase 1] Schema → [Fase 2] Backend → [Fase 3] Frontend → Test → [Fase 4]
```

### File yang Perlu Diubah

| File | Aksi |
|------|------|
| `prisma/migrations/20260303000000_fix_schema_drift/migration.sql` | **HAPUS** — konflik dengan schema saat ini |
| `prisma/schema.prisma` | Update enum `BailoutStatus` dan `ApprovalLevel` |
| `prisma/migrations/YYYYMMDD_add_bailout_finance_fields/migration.sql` | **BUAT BARU** — tambah `financeId`, `storageUrl` ke Bailout |
| `src/server/api/routers/bailout.ts` | Fix status enum references, tambah `financeId` di disburse |
| `src/server/api/routers/finance.ts` | Fix `APPROVED_L2` reference, perbaiki include |
| `src/components/navigation/SidebarNav.tsx` | Uncomment bailout menu |
| `src/app/(authenticated)/bailout/page.tsx` | Pastikan status values konsisten |

### Pertanyaan yang Perlu Dikonfirmasi

> Sebelum implementasi, perlu konfirmasi:

1. **Apakah bailout bisa dibuat SEBELUM BusTrip di-approve?**  
   Saat ini kode membolehkan. Kalau harus setelah approve, perlu tambah validasi.

2. **Apakah Finance bisa pilih siapa yang mengerjakan?**  
   Saat ini `financeId` diisi otomatis dari user yang login saat klik "Cairkan". Kalau perlu bisa assign ke finance lain, perlu UI tambahan.

3. **Apakah upload bukti transfer WAJIB saat cairkan?**  
   Saat ini `storageUrl` opsional. Kalau wajib, perlu validasi di frontend dan backend.

4. **Apakah `ApprovalLevel` untuk bailout menggunakan generic chain (via `Approval` model)?**  
   Saat ini bailout menggunakan status langsung (bukan Approval records). Kalau mau unify dengan flow approval TravelRequest, perlu refactor besar.
