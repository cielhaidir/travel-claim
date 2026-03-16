# HC API Build Checklist (Detailed)

Dokumen ini adalah checklist implementasi API backend HC berdasarkan blueprint dan simulasi modul.

## 1. Persiapan Fondasi
- [ ] Finalisasi naming convention:
  - [ ] Prefix tabel `hc_`
  - [ ] Nama endpoint (mis. `leave.approve`, `payroll.generatePeriod`)
  - [ ] Standar status enum lintas modul
- [ ] Definisikan role dan permission matrix:
  - [ ] `employee`
  - [ ] `manager`
  - [ ] `hr`
  - [ ] `payroll_admin`
  - [ ] `super_admin`
- [ ] Tentukan timezone official sistem:
  - [ ] Simpan timestamp di UTC
  - [ ] Atur konversi tampilan ke zona operasional (mis. `Asia/Makassar`)
- [ ] Tentukan standar response API:
  - [ ] Success payload
  - [ ] Error code + message + details
  - [ ] Pagination standard
- [ ] Tentukan standar audit log:
  - [ ] Aksi apa saja wajib dilog
  - [ ] Format `module_name`, `reference_id`, `actor_id`, `action`

## 2. Database & Prisma
- [ ] Buat/rapikan model Prisma untuk tabel:
  - [ ] `hc_employees`
  - [ ] `hc_workdays`
  - [ ] `hc_attendance`
  - [ ] `hc_overtime_requests`
  - [ ] `hc_leave_requests`
  - [ ] `hc_payroll_periods`
  - [ ] `hc_payroll_items`
  - [ ] `hc_bonus`
  - [ ] `hc_approval_logs`
- [ ] Definisikan enum Prisma:
  - [ ] Employment status
  - [ ] Attendance status
  - [ ] Overtime status
  - [ ] Leave type/status
  - [ ] Payroll period status
  - [ ] Bonus type/status
  - [ ] Approval action/module
- [ ] Tambahkan relasi FK dan index:
  - [ ] Unique key (`employee_id`, `attendance_date`)
  - [ ] Unique key (`payroll_period_id`, `employee_id`)
  - [ ] Index semua kolom filter utama (`employee_id`, `status`, `date`)
- [ ] Tambahkan constraint penting:
  - [ ] End date tidak boleh < start date
  - [ ] Amount tidak boleh negatif
  - [ ] Durasi lembur > 0
- [ ] Buat migration SQL
- [ ] Jalankan migrate dan verifikasi schema
- [ ] Siapkan seed minimal:
  - [ ] Sample employee
  - [ ] Sample workday
  - [ ] Sample role mapping

## 3. Struktur Kode Modul
- [ ] Buat folder modul:
  - [ ] `src/server/modules/hc/attendance`
  - [ ] `src/server/modules/hc/overtime`
  - [ ] `src/server/modules/hc/leave`
  - [ ] `src/server/modules/hc/workday`
  - [ ] `src/server/modules/hc/payroll`
  - [ ] `src/server/modules/hc/bonus`
  - [ ] `src/server/modules/hc/shared`
- [ ] Di tiap modul siapkan file:
  - [ ] `*.schema.ts` (zod)
  - [ ] `*.service.ts`
  - [ ] `*.repository.ts`
  - [ ] `*.types.ts`
  - [ ] `*.router.ts`
- [ ] Siapkan utility bersama:
  - [ ] Error mapper
  - [ ] Date utility
  - [ ] Approval log helper
  - [ ] Transaction helper

## 4. Checklist Endpoint Modul Absensi
- [ ] `attendance.createCheckIn`
  - [ ] Validasi employee aktif
  - [ ] Validasi check-in tidak duplikat
  - [ ] Validasi workday
  - [ ] Tentukan status awal (`present`/`late`)
- [ ] `attendance.createCheckOut`
  - [ ] Validasi check-in sudah ada
  - [ ] Validasi `checkOutAt >= checkInAt`
  - [ ] Update durasi kerja harian
- [ ] `attendance.listByEmployeePeriod`
  - [ ] Filter tanggal
  - [ ] Pagination
  - [ ] Sorting
- [ ] Job `attendance.nightlyFinalizeStatus`
  - [ ] Tandai `absent` di hari kerja tanpa check-in
  - [ ] Sinkron status `leave` dari cuti approved

## 5. Checklist Endpoint Modul Lembur
- [ ] `overtime.submit`
  - [ ] Validasi range waktu
  - [ ] Validasi konflik dengan cuti
  - [ ] Hitung durasi menit
  - [ ] Generate nomor request
  - [ ] Insert approval log `submit`
- [ ] `overtime.approve`
  - [ ] Cek role approver
  - [ ] Cek status saat ini `submitted`
  - [ ] Update status + approver metadata
  - [ ] Insert approval log `approve`
- [ ] `overtime.reject`
  - [ ] Cek status `submitted`
  - [ ] Simpan alasan reject
  - [ ] Insert approval log `reject`
- [ ] `overtime.list`
  - [ ] Filter status, employee, period
  - [ ] Include approval metadata

## 6. Checklist Endpoint Modul Cuti
- [ ] `leave.submit`
  - [ ] Validasi tanggal (`start <= end`)
  - [ ] Hitung hari cuti efektif berdasar `hc_workdays`
  - [ ] Cek konflik request existing
  - [ ] Cek kuota cuti
  - [ ] Simpan status `submitted`
  - [ ] Insert approval log `submit`
- [ ] `leave.approve` (konfirmasi izin)
  - [ ] Validasi role approver
  - [ ] Validasi status `submitted`
  - [ ] Re-check kuota cuti (anti race-condition)
  - [ ] Update status + approver
  - [ ] Sinkronkan attendance status menjadi `leave` jika diperlukan
  - [ ] Insert approval log `approve`
- [ ] `leave.reject`
  - [ ] Cek status `submitted`
  - [ ] Simpan alasan
  - [ ] Insert approval log `reject`
- [ ] `leave.list`
  - [ ] Filter leave type/status/period
  - [ ] Include summary kuota dan used days

## 7. Checklist Endpoint Modul Hari Kerja
- [ ] `workday.bulkUpsert`
  - [ ] Validasi payload dan duplikasi tanggal
  - [ ] Upsert batch
  - [ ] Simpan info perubahan tanggal yang berdampak
- [ ] `workday.listByPeriod`
  - [ ] Query range tanggal
  - [ ] Filter `is_workday`
- [ ] `workday.syncImpactedAttendance` (opsional)
  - [ ] Identifikasi absensi terdampak
  - [ ] Recalculate status absensi
  - [ ] Tandai payroll period butuh regenerate bila masih editable

## 8. Checklist Endpoint Modul Bonus
- [ ] `bonus.create`
  - [ ] Validasi amount > 0
  - [ ] Validasi employee aktif
  - [ ] Status awal `proposed`
  - [ ] Insert approval log `submit`
- [ ] `bonus.approve`
  - [ ] Validasi status `proposed`
  - [ ] Update approver metadata
  - [ ] Insert approval log `approve`
- [ ] `bonus.reject`
  - [ ] Validasi status `proposed`
  - [ ] Simpan alasan reject
  - [ ] Insert approval log `reject`
- [ ] `bonus.list`
  - [ ] Filter status/type/period/employee

## 9. Checklist Endpoint Modul Payroll
- [ ] `payroll.createPeriod`
  - [ ] Validasi period unik (`period_code`)
  - [ ] Validasi tanggal periode
- [ ] `payroll.generatePeriod`
  - [ ] Idempotent upsert payroll items
  - [ ] Hitung komponen salary per employee
  - [ ] Ambil overtime approved
  - [ ] Ambil bonus approved
  - [ ] Hitung deduction attendance
  - [ ] Hitung gross/net
  - [ ] Bungkus dalam DB transaction
- [ ] `payroll.finalizePeriod`
  - [ ] Validasi kelengkapan payroll items
  - [ ] Kunci perubahan periode
  - [ ] Set `processed_at`, `processed_by`
- [ ] `payroll.markAsPaid`
  - [ ] Validasi period sudah `finalized`
  - [ ] Update status `paid`
  - [ ] Update bonus terkait menjadi `paid` (jika ikut payroll)
- [ ] `payroll.getSlipByEmployee`
  - [ ] Return detail payroll item per employee
  - [ ] Role check (employee hanya boleh melihat dirinya)

## 10. Security & Authorization
- [ ] Terapkan middleware auth di semua router HC
- [ ] Terapkan role guard per endpoint
- [ ] Masking data sensitif payroll untuk role non-authorized
- [ ] Anti horizontal privilege escalation:
  - [ ] Employee tidak bisa approve request
  - [ ] Employee tidak bisa akses payroll employee lain
- [ ] Validasi input ketat dengan Zod
- [ ] Sanitasi field text (reason/description/notes)

## 11. Logging, Monitoring, dan Audit
- [ ] Structured logs untuk operasi penting:
  - [ ] submit
  - [ ] approve/reject
  - [ ] generate/finalize payroll
- [ ] Pastikan semua approval write ke `hc_approval_logs`
- [ ] Tambahkan correlation/request id
- [ ] Tambahkan metric:
  - [ ] jumlah request approve/reject
  - [ ] durasi generate payroll
  - [ ] error rate per endpoint

## 12. Testing Checklist
- [ ] Unit test service layer:
  - [ ] Attendance status calculation
  - [ ] Overtime duration calculation
  - [ ] Leave quota validator
  - [ ] Payroll formula
- [ ] Integration test endpoint:
  - [ ] Happy path semua endpoint utama
  - [ ] Invalid input path
  - [ ] Unauthorized/forbidden path
  - [ ] Concurrency case (double approve)
- [ ] Transaction test:
  - [ ] Rollback bila salah satu step payroll gagal
- [ ] Idempotency test:
  - [ ] `payroll.generatePeriod` dipanggil berulang hasil tetap konsisten
- [ ] Regression test:
  - [ ] perubahan workday mempengaruhi attendance/payroll sesuai rule

## 13. API Documentation Checklist
- [ ] Tambah dokumentasi endpoint di OpenAPI/tRPC docs:
  - [ ] Request schema
  - [ ] Response schema
  - [ ] Error code
  - [ ] Role yang diizinkan
- [ ] Tambah contoh request/response:
  - [ ] leave submit/approve
  - [ ] overtime submit/approve
  - [ ] payroll generate/finalize
- [ ] Tambah sequence diagram sederhana:
  - [ ] Leave approval flow
  - [ ] Payroll generation flow

## 14. Deployment & Release Checklist
- [ ] Jalankan migration di staging
- [ ] Jalankan seed data staging
- [ ] Uji E2E skenario bulanan di staging
- [ ] Verifikasi performance query payroll dan list endpoint
- [ ] Siapkan rollback plan migration
- [ ] Release bertahap:
  - [ ] Phase 1: attendance + leave + overtime
  - [ ] Phase 2: bonus + payroll
  - [ ] Phase 3: optimization + reporting

## 15. Definition of Done (DoD)
- [ ] Semua endpoint inti tersedia dan lolos test
- [ ] Role-based access tervalidasi
- [ ] Audit log lengkap pada status transition
- [ ] Payroll generate idempotent dan transactional
- [ ] Dokumentasi API lengkap dan dipahami tim
- [ ] Skenario end-to-end berhasil di staging tanpa blocker kritikal

