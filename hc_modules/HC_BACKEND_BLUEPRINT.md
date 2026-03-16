# HC Backend Blueprint (Modular System)

## 1. Tujuan
Blueprint ini menjadi acuan awal backend untuk Human Capital (HC) dengan pendekatan modular. Fokus sementara:
- `Absensi`
- `Lembur`
- `Permintaan Cuti`
- `Hari Kerja`
- `Penggajian`
- `Bonus`

Target utama:
- Mudah dikembangkan per modul.
- Konsisten untuk audit, approval, dan payroll.
- Siap diintegrasikan ke sistem existing (auth, notification, finance bila diperlukan).

## 2. Struktur Stack (Backend)
Rekomendasi mengikuti stack project saat ini:
- Runtime: `Node.js` (TypeScript)
- Framework: `Next.js` API route + `tRPC` routers
- ORM: `Prisma`
- Database: `PostgreSQL`
- AuthN/AuthZ: `NextAuth` + role-based access
- Validation: `Zod`
- Logging: service-level structured logging
- Background jobs (opsional tahap lanjut): queue worker untuk payroll batch

## 3. Arsitektur Modular
Setiap modul memiliki layer:
- `router` (tRPC/API endpoint)
- `service` (business rules)
- `repository` (query DB via Prisma)
- `schema` (zod validation)
- `types` (DTO dan type internal)

Contoh struktur direktori:
```txt
src/server/modules/hc/
  attendance/
  overtime/
  leave/
  workday/
  payroll/
  bonus/
  shared/
```

`shared/` berisi komponen lintas modul:
- approval workflow helper
- status enum
- date/time utility
- audit log helper

## 4. Relasi Domain Tingkat Tinggi
- `karyawan` memiliki banyak data `absensi`, `lembur`, `cuti`, `payroll`, `bonus`.
- `hari_kerja` menjadi referensi kalender kerja untuk validasi absensi/cuti/lembur.
- `lembur` dan `cuti` bisa memakai alur approval.
- `payroll` mengambil data periodik dari absensi, lembur approved, cuti approved, dan bonus.

## 5. Tabel Inti (Draft)

## 5.1 `hc_employees`
Master data karyawan.

Kolom utama:
- `id` (uuid, pk)
- `employee_code` (varchar, unique)
- `full_name` (varchar)
- `email` (varchar, unique)
- `department_id` (uuid, nullable)
- `position` (varchar)
- `employment_status` (enum: probation, permanent, contract, inactive)
- `join_date` (date)
- `resign_date` (date, nullable)
- `created_at`, `updated_at`

## 5.2 `hc_workdays`
Referensi hari kerja dan hari libur.

Kolom utama:
- `id` (uuid, pk)
- `work_date` (date, unique)
- `is_workday` (boolean)
- `work_type` (enum: regular, weekend, holiday, collective_leave)
- `description` (varchar, nullable)
- `created_at`, `updated_at`

## 5.3 `hc_attendance`
Catatan absensi harian karyawan.

Kolom utama:
- `id` (uuid, pk)
- `employee_id` (uuid, fk -> hc_employees.id)
- `attendance_date` (date)
- `check_in_at` (timestamp, nullable)
- `check_out_at` (timestamp, nullable)
- `attendance_status` (enum: present, late, absent, leave, holiday, sick, remote)
- `source` (enum: mobile, web, machine, import)
- `notes` (text, nullable)
- `created_at`, `updated_at`

Constraint:
- unique (`employee_id`, `attendance_date`)

## 5.4 `hc_overtime_requests`
Permintaan lembur.

Kolom utama:
- `id` (uuid, pk)
- `request_no` (varchar, unique)
- `employee_id` (uuid, fk)
- `overtime_date` (date)
- `start_time` (timestamp)
- `end_time` (timestamp)
- `duration_minutes` (int)
- `reason` (text)
- `status` (enum: draft, submitted, approved, rejected, cancelled)
- `approved_by` (uuid, nullable)
- `approved_at` (timestamp, nullable)
- `rejection_reason` (text, nullable)
- `created_at`, `updated_at`

## 5.5 `hc_leave_requests`
Permintaan cuti.

Kolom utama:
- `id` (uuid, pk)
- `request_no` (varchar, unique)
- `employee_id` (uuid, fk)
- `leave_type` (enum: annual, sick, unpaid, maternity, paternity, special)
- `start_date` (date)
- `end_date` (date)
- `total_days` (numeric(5,2))
- `reason` (text, nullable)
- `status` (enum: draft, submitted, approved, rejected, cancelled)
- `approved_by` (uuid, nullable)
- `approved_at` (timestamp, nullable)
- `rejection_reason` (text, nullable)
- `created_at`, `updated_at`

## 5.6 `hc_payroll_periods`
Header periode payroll.

Kolom utama:
- `id` (uuid, pk)
- `period_code` (varchar, unique) contoh: `2026-03`
- `start_date` (date)
- `end_date` (date)
- `status` (enum: draft, processing, finalized, paid)
- `processed_at` (timestamp, nullable)
- `processed_by` (uuid, nullable)
- `created_at`, `updated_at`

## 5.7 `hc_payroll_items`
Rincian payroll per karyawan per periode.

Kolom utama:
- `id` (uuid, pk)
- `payroll_period_id` (uuid, fk -> hc_payroll_periods.id)
- `employee_id` (uuid, fk -> hc_employees.id)
- `basic_salary` (numeric(14,2))
- `attendance_deduction` (numeric(14,2), default 0)
- `overtime_amount` (numeric(14,2), default 0)
- `allowance_amount` (numeric(14,2), default 0)
- `bonus_amount` (numeric(14,2), default 0)
- `tax_amount` (numeric(14,2), default 0)
- `bpjs_amount` (numeric(14,2), default 0)
- `other_deduction` (numeric(14,2), default 0)
- `gross_salary` (numeric(14,2))
- `net_salary` (numeric(14,2))
- `created_at`, `updated_at`

Constraint:
- unique (`payroll_period_id`, `employee_id`)

## 5.8 `hc_bonus`
Bonus karyawan (insentif, performance bonus, dsb).

Kolom utama:
- `id` (uuid, pk)
- `employee_id` (uuid, fk -> hc_employees.id)
- `bonus_type` (enum: performance, attendance, project, retention, other)
- `bonus_date` (date)
- `amount` (numeric(14,2))
- `description` (text, nullable)
- `payroll_period_id` (uuid, nullable, fk -> hc_payroll_periods.id)
- `status` (enum: proposed, approved, rejected, paid)
- `approved_by` (uuid, nullable)
- `approved_at` (timestamp, nullable)
- `created_at`, `updated_at`

## 5.9 `hc_approval_logs`
Audit approval lintas modul (lembur/cuti/bonus/payroll opsional).

Kolom utama:
- `id` (uuid, pk)
- `module_name` (enum: overtime, leave, bonus, payroll)
- `reference_id` (uuid)
- `action` (enum: submit, approve, reject, cancel, revise)
- `actor_id` (uuid)
- `notes` (text, nullable)
- `created_at`

## 6. Alur Proses Inti

## 6.1 Absensi
1. Karyawan check-in/check-out.
2. Sistem validasi terhadap `hc_workdays`.
3. Sistem hitung status hadir/lambat/absen.
4. Data dipakai untuk rekap payroll.

## 6.2 Lembur
1. Karyawan submit lembur.
2. Atasan melakukan approve/reject.
3. Hanya status `approved` yang dihitung ke payroll.

## 6.3 Cuti
1. Karyawan submit cuti.
2. Sistem cek bentrok tanggal + saldo cuti (tabel saldo ditambahkan fase berikutnya).
3. Atasan/HR approve atau reject.
4. Cuti approved mempengaruhi status absensi/perhitungan payroll.

## 6.4 Penggajian
1. Buat payroll period.
2. Generate payroll items dari absensi + lembur + bonus + potongan.
3. Review dan finalize.
4. Tandai paid setelah pembayaran.

## 7. API Kontrak Minimum (Draft)
Endpoint/route yang disarankan:
- `attendance.createCheckIn`
- `attendance.createCheckOut`
- `attendance.listByPeriod`
- `overtime.submit`
- `overtime.approve`
- `overtime.reject`
- `leave.submit`
- `leave.approve`
- `leave.reject`
- `workday.bulkUpsert`
- `payroll.generatePeriod`
- `payroll.finalizePeriod`
- `bonus.create`
- `bonus.approve`

## 8. Role dan Akses (Minimum)
- `employee`: input absensi, ajukan lembur/cuti.
- `manager`: approve/reject lembur & cuti tim.
- `hr`: kelola kalender kerja, monitoring, payroll preparation.
- `payroll_admin`: generate/finalize payroll.
- `super_admin`: akses penuh + audit.

## 9. Non-Functional Requirement (Awal)
- Semua perubahan status approval tercatat di `hc_approval_logs`.
- Gunakan transaksi DB untuk proses payroll generate/finalize.
- Idempotent operation untuk endpoint payroll generate.
- Timezone diset konsisten (mis. `Asia/Makassar` atau UTC + konversi terkontrol).

## 10. Rencana Fase Lanjutan
- Tambah tabel saldo cuti tahunan (`hc_leave_balances`).
- Tambah komponen komplain payroll + revisi.
- Integrasi notifikasi (email/WA/in-app) untuk approval.
- Tambah laporan: rekap kehadiran, biaya lembur, biaya payroll per departemen.

---

Dokumen ini adalah blueprint backend tahap awal. Struktur tabel dan enum dapat disesuaikan dengan kebijakan perusahaan dan regulasi yang berlaku.
