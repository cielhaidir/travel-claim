# 🧪 Skema Uji Coba — Travel Claim System

> **Semua password:** `password123`
> **URL:** `http://localhost:3000`

---

## 👥 Daftar User Seed

| # | Email | Nama | Role | Dept | EMP ID | Supervisor |
|---|-------|------|------|------|--------|-----------|
| 1 | `executive@company.com` | Pak Hendra Wijaya | `ADMIN` (C-Level) | — | EMP001 | — |
| 2 | `director@company.com` | Ibu Ratna Sari | `DIRECTOR` | — | EMP002 | executive |
| 3 | `finance.chief@company.com` | Dewi Anggraeni | `MANAGER` | Finance | EMP003 | director |
| 4 | `finance.staff1@company.com` | Bambang Nugroho | `FINANCE` | Finance | EMP010 | finance.chief |
| 5 | `finance.staff2@company.com` | Sri Wahyuni | `FINANCE` | Finance | EMP011 | finance.chief |
| 6 | `sales.chief@company.com` | Reza Pratama | `SALES_CHIEF` | Sales | EMP020 | director |
| 7 | `sales.staff1@company.com` | Andi Wijaya | `SALES_EMPLOYEE` | Sales | EMP021 | sales.chief |
| 8 | `sales.staff2@company.com` | Rina Kusuma | `SALES_EMPLOYEE` | Sales | EMP022 | sales.chief |
| 9 | `engineer.chief@company.com` | Deni Hermawan | `SUPERVISOR` | Engineering | EMP030 | director |
| 10 | `engineer.staff1@company.com` | Tia Rahayu | `EMPLOYEE` | Engineering | EMP031 | engineer.chief |
| 11 | `engineer.staff2@company.com` | Fajar Nugroho | `EMPLOYEE` | Engineering | EMP032 | engineer.chief |
| 12 | `admin@company.com` | Diana Kusuma | `ADMIN` | Administration | EMP040 | director |
| 13 | `admin.staff1@company.com` | Budi Santoso | `EMPLOYEE` | Administration | EMP041 | admin |

---

## 🗺️ Hirarki Organisasi

```
executive@company.com   (ADMIN / C-Level)  ← EMP001
└─ director@company.com  (DIRECTOR)         ← EMP002
   ├─ finance.chief@company.com  (MANAGER)  ← EMP003  [Dept Chief: Finance]
   │  ├─ finance.staff1@company.com (FINANCE) ← EMP010
   │  └─ finance.staff2@company.com (FINANCE) ← EMP011
   ├─ sales.chief@company.com (SALES_CHIEF) ← EMP020  [Dept Chief: Sales]
   │  ├─ sales.staff1@company.com (SALES_EMPLOYEE) ← EMP021
   │  └─ sales.staff2@company.com (SALES_EMPLOYEE) ← EMP022
   ├─ engineer.chief@company.com (SUPERVISOR) ← EMP030 [Dept Chief: Engineering]
   │  ├─ engineer.staff1@company.com (EMPLOYEE) ← EMP031
   │  └─ engineer.staff2@company.com (EMPLOYEE) ← EMP032
   └─ admin@company.com (ADMIN)            ← EMP040  [Dept Chief: Administration]
      └─ admin.staff1@company.com (EMPLOYEE) ← EMP041
```

---

## 📋 Aturan Approval Chain

### Rule A — Sales Employee / Sales Chief (travel apapun)
```
seq=1  DEPT_CHIEF   → sales.chief@company.com  (Reza Pratama)
seq=2  DIRECTOR     → director@company.com      (Ibu Ratna Sari)
seq=3  EXECUTIVE    → executive@company.com     (Pak Hendra Wijaya)
```

### Rule B — Employee biasa, travel type=SALES (linked ke Project)
```
seq=1  SALES_LEAD   → [sales lead dari project]
seq=2  DEPT_CHIEF   → [supervisor dari sales lead]
seq=3  DIRECTOR     → director@company.com
seq=4  EXECUTIVE    → executive@company.com
```

### Rule C — Employee biasa, travel type bukan SALES
```
seq=1  DEPT_CHIEF   → [dept chief si pemohon]
seq=2  DIRECTOR     → director@company.com
seq=3  EXECUTIVE    → executive@company.com
```

---

## 🧪 SKENARIO 1 — Sales Employee mengajukan Travel Request (Rule A)

### Tujuan
Menguji alur penuh dari pembuatan travel request hingga fully approved untuk role `SALES_EMPLOYEE`.

### Langkah-langkah

---

#### STEP 1 — Login sebagai Sales Staff

| Field | Value |
|-------|-------|
| **Login sebagai** | `sales.staff1@company.com` |
| **Password** | `password123` |
| **Nama** | Andi Wijaya (SALES_EMPLOYEE) |

---

#### STEP 2 — Buat Travel Request

> **Menu:** `Travel` → `New Request`

| Field | Value |
|-------|-------|
| **Purpose** | Kunjungan ke klien PT. Maju Bersama untuk presentasi produk terbaru |
| **Destination** | Surabaya, Jawa Timur |
| **Travel Type** | `SALES` |
| **Project** | *(pilih project yang tersedia, atau buat dulu via Admin)* |
| **Start Date** | `2026-03-10` |
| **End Date** | `2026-03-12` |
| **Participants** | Rina Kusuma (sales.staff2) *(opsional)* |

**Bailout (Uang Muka) — opsional saat create:**

| Category | Description | Amount |
|----------|-------------|--------|
| `TRANSPORT` | Tiket pesawat Jakarta–Surabaya PP (Garuda GA-301) | Rp 2.500.000 |
| `HOTEL` | Hotel Majapahit 2 malam | Rp 1.800.000 |

**Hasil yang diharapkan:**
- Request dibuat dengan status `DRAFT`
- Request number: `TR-2026-00001`

---

#### STEP 3 — Submit Travel Request

> Klik tombol **Submit** pada request yang baru dibuat.

**Hasil yang diharapkan:**
- Status berubah dari `DRAFT` → `SUBMITTED`
- Approval chain otomatis terbentuk (Rule A — karena requester = SALES_EMPLOYEE):

| Seq | Level | Approver | Email |
|-----|-------|----------|-------|
| 1 | `DEPT_CHIEF` | Reza Pratama | `sales.chief@company.com` |
| 2 | `DIRECTOR` | Ibu Ratna Sari | `director@company.com` |
| 3 | `EXECUTIVE` | Pak Hendra Wijaya | `executive@company.com` |

- Notifikasi WhatsApp/In-App dikirim ke **Reza Pratama** (seq=1)

---

#### STEP 4 — Approval Level 1: Sales Chief

| Field | Value |
|-------|-------|
| **Login sebagai** | `sales.chief@company.com` |
| **Password** | `password123` |
| **Nama** | Reza Pratama (SALES_CHIEF) |

> **Menu:** `Approvals` → pilih request `TR-2026-00001`

- Review detail request
- Klik **Approve**
- Isi komentar: `"Disetujui, pastikan laporan dikumpulkan H+3 kembali"`

**Hasil yang diharapkan:**
- Approval seq=1 status → `APPROVED`
- TravelRequest status → `APPROVED_L1`
- Notifikasi dikirim ke **Ibu Ratna Sari** (seq=2)

---

#### STEP 5 — Approval Level 2: Director

| Field | Value |
|-------|-------|
| **Login sebagai** | `director@company.com` |
| **Password** | `password123` |
| **Nama** | Ibu Ratna Sari (DIRECTOR) |

> **Menu:** `Approvals` → pilih request `TR-2026-00001`

- Klik **Approve**
- Komentar: `"Approved"`

**Hasil yang diharapkan:**
- Approval seq=2 status → `APPROVED`
- TravelRequest status → `APPROVED_L2`
- Notifikasi dikirim ke **Pak Hendra Wijaya** (seq=3)

---

#### STEP 6 — Approval Level 3: Executive

| Field | Value |
|-------|-------|
| **Login sebagai** | `executive@company.com` |
| **Password** | `password123` |
| **Nama** | Pak Hendra Wijaya (ADMIN/Executive) |

> **Menu:** `Approvals` → pilih request `TR-2026-00001`

- Klik **Approve**
- Komentar: `"Approved by Executive"`

**Hasil yang diharapkan:**
- Approval seq=3 status → `APPROVED`
- TravelRequest status → **`APPROVED`** ✅ (fully approved)

---

#### STEP 7 — Finance: Lock Travel Request

| Field | Value |
|-------|-------|
| **Login sebagai** | `finance.staff1@company.com` |
| **Password** | `password123` |
| **Nama** | Bambang Nugroho (FINANCE) |

> **Menu:** `Travel` → cari `TR-2026-00001` → klik **Lock**

**Hasil yang diharapkan:**
- TravelRequest status → `LOCKED`
- Peserta perjalanan (Andi Wijaya + Rina Kusuma) kini bisa mengajukan **Claim**

---

#### STEP 8 — Buat Claim (oleh Sales Staff)

| Field | Value |
|-------|-------|
| **Login sebagai** | `sales.staff1@company.com` |

> **Menu:** `Claims` → `New Claim` → pilih TR `TR-2026-00001`

| Field | Value |
|-------|-------|
| **Claim Type** | `NON_ENTERTAINMENT` |
| **Category** | `TRAVEL_EXPENSES` |
| **Amount** | Rp 350.000 |
| **Description** | Taxi dari bandara ke hotel dan ke venue klien |
| **Expense Date** | `2026-03-10` |
| **Expense Destination** | Surabaya |

**Hasil yang diharapkan:**
- Claim dibuat dengan status `DRAFT`
- Claim number: `CLM-2026-00001`

---

#### STEP 9 — Finance: Close Travel Request (setelah semua claim selesai)

> **Menu:** `Travel` → `TR-2026-00001` → klik **Close**

**Hasil yang diharapkan:**
- TravelRequest status → `CLOSED`

---

## 🧪 SKENARIO 2 — Skenario Rejection & Revision

### Tujuan
Menguji alur ketika approver menolak atau meminta revisi.

---

#### STEP 1 — Login sebagai Sales Staff 2

| Field | Value |
|-------|-------|
| **Login sebagai** | `sales.staff2@company.com` |
| **Password** | `password123` |
| **Nama** | Rina Kusuma (SALES_EMPLOYEE) |

---

#### STEP 2 — Buat & Submit Travel Request

| Field | Value |
|-------|-------|
| **Purpose** | Demo produk ke calon klien baru PT. Surya Abadi |
| **Destination** | Bandung, Jawa Barat |
| **Travel Type** | `MEETING` |
| **Start Date** | `2026-03-15` |
| **End Date** | `2026-03-16` |

- Submit → status `SUBMITTED`
- Approval chain (Rule A):
  - seq=1 → `sales.chief@company.com`
  - seq=2 → `director@company.com`
  - seq=3 → `executive@company.com`

---

#### STEP 3 — Sales Chief: Request Revision

| Field | Value |
|-------|-------|
| **Login sebagai** | `sales.chief@company.com` |

> Pilih request → klik **Request Revision**
> Isi alasan: `"Tolong lengkapi detail tujuan kunjungan dan nama PIC klien"`

**Hasil yang diharapkan:**
- TravelRequest status → `REVISION`
- Notifikasi dikirim ke Rina Kusuma

---

#### STEP 4 — Rina Merevisi & Re-submit

| Field | Value |
|-------|-------|
| **Login sebagai** | `sales.staff2@company.com` |

> Edit request, update purpose/detail → klik **Re-submit**

**Hasil yang diharapkan:**
- Approval chain lama dihapus, chain baru dibuat ulang
- Status kembali ke `SUBMITTED`

---

#### STEP 5 — Sales Chief: Reject

| Field | Value |
|-------|-------|
| **Login sebagai** | `sales.chief@company.com` |

> Pilih request → klik **Reject**
> Alasan: `"Kunjungan ditunda, klien tidak tersedia"`

**Hasil yang diharapkan:**
- TravelRequest status → `REJECTED` ❌

---

## 🧪 SKENARIO 3 — Engineer Staff (Rule C: Non-sales, Non-sales travel)

### Tujuan
Menguji Rule C: Employee biasa (bukan sales) yang mengajukan travel bukan untuk SALES.

> ⚠️ **Catatan:** Berdasarkan kode sistem, hanya `SALES_EMPLOYEE`, `SALES_CHIEF`, dan `ADMIN` yang bisa membuat Travel Request. Untuk Engineer/Employee biasa, perlu di-test jika role diberi akses, atau gunakan `admin@company.com` sebagai proxy.

---

#### STEP 1 — Login sebagai Admin (sebagai workaround)

| Field | Value |
|-------|-------|
| **Login sebagai** | `admin@company.com` |
| **Password** | `password123` |
| **Nama** | Diana Kusuma (ADMIN) |

---

#### STEP 2 — Buat Travel Request (type: TRAINING)

| Field | Value |
|-------|-------|
| **Purpose** | Pelatihan keamanan sistem IT di Jakarta Convention Center |
| **Destination** | Jakarta Pusat |
| **Travel Type** | `TRAINING` |
| **Start Date** | `2026-03-20` |
| **End Date** | `2026-03-21` |

- Submit → Approval chain (Rule C karena requester ada dept chief):
  - seq=1 → `admin@company.com` / dept chief Admin
  - seq=2 → `director@company.com`
  - seq=3 → `executive@company.com`

---

## 🧪 SKENARIO 4 — Quick Test Bailout (Dana Talangan)

### Tujuan
Menguji pengajuan bailout/uang muka yang menyertai travel request.

---

#### Pada saat STEP 2 Skenario 1 (buat travel request), tambahkan bailout:

| Field | Value |
|-------|-------|
| **Category** | `TRANSPORT` |
| **Transport Mode** | `FLIGHT` |
| **Carrier** | Garuda Indonesia |
| **Departure From** | Jakarta (CGK) |
| **Arrival To** | Surabaya (SUB) |
| **Departure At** | `2026-03-10 06:00` |
| **Arrival At** | `2026-03-10 07:10` |
| **Flight Number** | GA-301 |
| **Seat Class** | Economy |
| **Booking Ref** | GIA20260310 |
| **Amount** | Rp 2.500.000 |
| **Description** | Tiket pesawat Jakarta–Surabaya untuk kunjungan klien |

**Bailout Number yang terbentuk:** `BLT-2026-00001`

---

## 📊 Ringkasan Status Flow

```
Travel Request:
DRAFT → SUBMITTED → APPROVED_L1 → APPROVED_L2 → APPROVED_L3 → APPROVED → LOCKED → CLOSED
                                                              ↘ REJECTED
                  ↘ REVISION (kembali ke requester) ↗

Claim:
DRAFT → SUBMITTED → APPROVED → PAID
                  ↘ REJECTED
      ↘ REVISION ↗

Bailout:
DRAFT → SUBMITTED → APPROVED_L1 → ... → APPROVED → DISBURSED
                                       ↘ REJECTED
```

---

## ✅ Checklist Uji Coba

### Travel Request
- [ ] Buat Travel Request sebagai `sales.staff1` (DRAFT)
- [ ] Submit request (SUBMITTED + approval chain terbentuk)
- [ ] Approval L1 oleh `sales.chief` (APPROVED_L1)
- [ ] Approval L2 oleh `director` (APPROVED_L2)
- [ ] Approval L3 oleh `executive` (APPROVED / fully approved)
- [ ] Lock oleh `finance.staff1` (LOCKED)
- [ ] Buat Claim setelah LOCKED
- [ ] Close oleh `finance.staff1` (CLOSED)

### Rejection & Revision
- [ ] Submit sebagai `sales.staff2`
- [ ] `sales.chief` request revision
- [ ] `sales.staff2` revisi dan re-submit
- [ ] `sales.chief` reject

### Bailout
- [ ] Buat travel request dengan bailout items
- [ ] Verifikasi bailout number ter-generate
- [ ] Setelah approve, finance bisa disburse

---

## 🔑 Quick Login Reference

```
executive@company.com   → password123  (Final approver / C-Level)
director@company.com    → password123  (L2 approver)
finance.chief@company.com → password123 (Manager Finance)
finance.staff1@company.com → password123 (Finance — bisa Lock & Close)
sales.chief@company.com → password123  (L1 approver untuk Sales team)
sales.staff1@company.com → password123 (Pembuat Travel Request ← START HERE)
sales.staff2@company.com → password123 (Participant / pembuat request lain)
engineer.chief@company.com → password123 (Supervisor Engineering)
admin@company.com       → password123  (Admin — bisa akses semua)
```
