# HC Backend Blueprint (Modular System)

## 1. Tujuan
Blueprint ini menjadi acuan backend Human Capital (HC) dengan pendekatan modular dan menyesuaikan schema existing project.

Fokus sementara:
- `Absensi`
- `Lembur`
- `Permintaan Cuti`
- `Hari Kerja`
- `Penggajian`
- `Bonus`

Target utama:
- Mudah dikembangkan per modul
- Konsisten untuk audit, approval, dan payroll
- Nyambung ke schema existing tanpa duplikasi master employee

## 2. Prinsip Arsitektur Penting
- **Master employee existing adalah `User`**, bukan tabel `hc_employees`
- Data organisasi mengikuti tabel existing seperti `User`, `Department`, dan `UserRole`
- Modul HC hanya menambah **tabel transaksi/domain HC**
- Semua FK person di HC memakai `User.id`

Naming yang dipakai di HC:
- `user_id` untuk pemilik transaksi HC
- `approved_by_user_id` untuk approver
- `actor_user_id` untuk audit log actor

## 3. Struktur Stack (Backend)
- Runtime: `Node.js` (TypeScript)
- Framework: `Next.js` API route + `tRPC` routers
- ORM: `Prisma`
- Database: `PostgreSQL`
- AuthN/AuthZ: `NextAuth` + role-based access
- Validation: `Zod`
- Logging: service-level structured logging

## 4. Arsitektur Modular
Setiap modul memiliki layer:
- `router`
- `service`
- `repository`
- `schema`
- `types`

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

## 5. Relasi Domain Tingkat Tinggi
- `User` memiliki banyak data `absensi`, `lembur`, `cuti`, `payroll`, `bonus`
- `Department` dipakai dari schema existing untuk struktur organisasi
- `hc_workdays` menjadi referensi kalender kerja
- `lembur` dan `cuti` memakai approval flow
- `payroll` mengambil data periodik dari absensi, lembur approved, cuti approved, dan bonus

## 6. Tabel Inti HC (Draft Revisi)

## 6.1 `User` (existing master employee)
Bukan tabel HC baru. Dipakai sebagai sumber utama data employee.

Field existing yang relevan:
- `id`
- `name`
- `email`
- `employeeId`
- `role`
- `departmentId`
- `supervisorId`
- `phoneNumber`
- `deletedAt`

## 6.2 `hc_workdays`
Referensi hari kerja dan hari libur.

Kolom utama:
- `id` (uuid, pk)
- `work_date` (date, unique)
- `is_workday` (boolean)
- `work_type` (enum: regular, weekend, holiday, collective_leave)
- `description` (varchar, nullable)
- `created_at`, `updated_at`

## 6.3 `hc_attendance`
Catatan absensi harian user.

Kolom utama:
- `id` (uuid, pk)
- `user_id` (text, fk -> `User.id`)
- `attendance_date` (date)
- `check_in_at` (timestamp, nullable)
- `check_out_at` (timestamp, nullable)
- `attendance_status` (enum: present, late, absent, leave, holiday, sick, remote)
- `source` (enum: mobile, web, machine, import)
- `notes` (text, nullable)
- `created_at`, `updated_at`

Constraint:
- unique (`user_id`, `attendance_date`)

## 6.4 `hc_overtime_requests`
Permintaan lembur.

Kolom utama:
- `id` (uuid, pk)
- `request_no` (varchar, unique)
- `user_id` (text, fk -> `User.id`)
- `overtime_date` (date)
- `start_time` (timestamp)
- `end_time` (timestamp)
- `duration_minutes` (int)
- `reason` (text)
- `status` (enum: draft, submitted, approved, rejected, cancelled)
- `approved_by_user_id` (text, nullable, fk -> `User.id`)
- `approved_at` (timestamp, nullable)
- `rejection_reason` (text, nullable)
- `created_at`, `updated_at`

## 6.5 `hc_leave_requests`
Permintaan cuti.

Kolom utama:
- `id` (uuid, pk)
- `request_no` (varchar, unique)
- `user_id` (text, fk -> `User.id`)
- `leave_type` (enum: annual, sick, unpaid, maternity, paternity, special)
- `start_date` (date)
- `end_date` (date)
- `total_days` (numeric(5,2))
- `reason` (text, nullable)
- `status` (enum: draft, submitted, approved, rejected, cancelled)
- `approved_by_user_id` (text, nullable, fk -> `User.id`)
- `approved_at` (timestamp, nullable)
- `rejection_reason` (text, nullable)
- `created_at`, `updated_at`

## 6.6 `hc_payroll_periods`
Header periode payroll.

Kolom utama:
- `id` (uuid, pk)
- `period_code` (varchar, unique)
- `start_date` (date)
- `end_date` (date)
- `status` (enum: draft, processing, finalized, paid)
- `processed_at` (timestamp, nullable)
- `processed_by_user_id` (text, nullable, fk -> `User.id`)
- `created_at`, `updated_at`

## 6.7 `hc_payroll_items`
Rincian payroll per user per periode.

Kolom utama:
- `id` (uuid, pk)
- `payroll_period_id` (uuid, fk -> hc_payroll_periods.id)
- `user_id` (text, fk -> `User.id`)
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
- unique (`payroll_period_id`, `user_id`)

## 6.8 `hc_bonus`
Bonus user.

Kolom utama:
- `id` (uuid, pk)
- `user_id` (text, fk -> `User.id`)
- `bonus_type` (enum: performance, attendance, project, retention, other)
- `bonus_date` (date)
- `amount` (numeric(14,2))
- `description` (text, nullable)
- `payroll_period_id` (uuid, nullable, fk -> hc_payroll_periods.id)
- `status` (enum: proposed, approved, rejected, paid)
- `approved_by_user_id` (text, nullable, fk -> `User.id`)
- `approved_at` (timestamp, nullable)
- `created_at`, `updated_at`

## 6.9 `hc_approval_logs`
Audit approval lintas modul.

Kolom utama:
- `id` (uuid, pk)
- `module_name` (enum: overtime, leave, bonus, payroll)
- `reference_id` (uuid)
- `action` (enum: submit, approve, reject, cancel, revise)
- `actor_user_id` (text, fk -> `User.id`)
- `notes` (text, nullable)
- `created_at`

## 7. Alur Proses Inti

## 7.1 Absensi
1. User check-in/check-out.
2. Sistem validasi terhadap `hc_workdays`.
3. Sistem hitung status hadir/lambat/absen.
4. Data dipakai untuk rekap payroll.

## 7.2 Lembur
1. User submit lembur.
2. Atasan melakukan approve/reject.
3. Hanya status `approved` yang dihitung ke payroll.

## 7.3 Cuti
1. User submit cuti.
2. Sistem cek bentrok tanggal + saldo cuti.
3. Atasan/HR approve atau reject.
4. Cuti approved mempengaruhi status absensi/perhitungan payroll.

## 7.4 Penggajian
1. Buat payroll period.
2. Generate payroll items dari absensi + lembur + bonus + potongan.
3. Review dan finalize.
4. Tandai paid setelah pembayaran.

## 8. API Kontrak Minimum (Draft)
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

## 9. Catatan Revisi Penting
- `hc_employees` tidak lagi dipakai sebagai master employee
- semua relasi employee di HC harus diarahkan ke `User.id`
- naming lama seperti `employeeId`, `employee_id`, `approved_by`, `actor_id` harus diganti agar konsisten dengan model baru
