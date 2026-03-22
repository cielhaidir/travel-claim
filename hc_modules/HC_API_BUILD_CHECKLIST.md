# HC API Build Checklist (Execution Tracker)

Dokumen ini menjadi sumber utama tracking implementasi HC berbasis blueprint.

## Scope Aktif
- Fokus modul: `attendance`, `overtime`, `leave`, `workday`, `shared`
- Skip sementara: `payroll`, `bonus`
- Employee master existing: `User`
- Seluruh update per iterasi wajib dicatat di file ini (lokasi: `hc_modules/`)

## Log Iterasi
- 2026-03-17: Struktur modular HC sudah dibangun untuk modul aktif (router/service/repository/schema/types + shared utilities), routing utama `hc` sudah terhubung, dan skema DB HC inti (tanpa payroll/bonus) sudah ditambahkan.
- 2026-03-17 (iterasi lanjutan): Implementasi dipusatkan ke `hc_modules/hc_backend` sesuai arahan. Ditambahkan paket modular HC, draft SQL migration HC core, dan seed SQL minimal.
- 2026-03-22: Arah arsitektur diperbarui. `User` menjadi master employee existing. Seluruh model HC aktif harus direvisi dari pola `employeeId/employee_id` ke `userId/user_id` dan approval actor ke `actorUserId/actor_user_id`.

## 1. Persiapan Fondasi
- [x] Finalisasi naming convention
- [x] Prefix tabel `hc_`
- [x] Nama endpoint modular (`attendance.*`, `overtime.*`, `leave.*`, `workday.*`)
- [x] Standar status enum lintas modul (scope aktif)
- [ ] Definisikan role dan permission matrix final lintas bisnis
- [x] Tentukan timezone official sistem (UTC storage + konversi terkontrol)
- [x] Tentukan standar response API dasar (payload, error, pagination)
- [x] Tentukan standar audit log untuk approval flow
- [x] Putuskan sumber master employee = `User`

## 2. Database & Prisma
- [x] Model Prisma modul aktif:
- [x] `hc_workdays`
- [x] `hc_attendance`
- [x] `hc_overtime_requests`
- [x] `hc_leave_requests`
- [x] `hc_approval_logs`
- [x] Enum Prisma modul aktif
- [ ] Revisi seluruh FK HC agar mengarah ke `User.id`
- [ ] Revisi seluruh nama kolom employee menjadi `user_id`
- [x] Constraint domain aktif (tanggal valid, durasi lembur > 0, anti duplikasi attendance)
- [x] Buat migration SQL (draft) di `hc_modules/hc_backend/prisma/migrations/20260317_hc_core/migration.sql`
- [ ] Jalankan migrate dan verifikasi schema DB
- [ ] Seed minimal HC
- [x] Seed minimal HC (draft) di `hc_modules/hc_backend/prisma/seed-hc.sql`

## 3. Struktur Kode Modular
- [x] `hc_modules/hc_backend/src/server/modules/hc/shared`
- [x] `hc_modules/hc_backend/src/server/modules/hc/attendance`
- [x] `hc_modules/hc_backend/src/server/modules/hc/overtime`
- [x] `hc_modules/hc_backend/src/server/modules/hc/leave`
- [x] `hc_modules/hc_backend/src/server/modules/hc/workday`
- [x] Setiap modul punya `*.schema.ts`, `*.service.ts`, `*.repository.ts`, `*.types.ts`, `*.router.ts`
- [x] Router agregat HC (`hc.router.ts`) pada paket modular
- [x] Utility bersama:
- [x] Error helper
- [x] Date utility
- [x] Approval log helper
- [ ] Transaction helper generik terpisah (saat ini inline per service)
- [x] Revisi seluruh kontrak internal dari `employeeId` ke `userId`

## 4. Modul Absensi
- [x] `attendance.createCheckIn`
- [x] Validasi user aktif
- [x] Validasi check-in tidak duplikat
- [x] Validasi workday (dengan fallback weekend)
- [x] Status awal (`present`/`late`/`holiday`)
- [x] `attendance.createCheckOut`
- [x] Validasi check-in sudah ada
- [x] Validasi `checkOutAt >= checkInAt`
- [x] Update checkout data
- [x] `attendance.listByEmployeePeriod`
- [x] Filter periode
- [x] Pagination
- [x] Sorting
- [x] `attendance.nightlyFinalizeStatus`
- [x] Tandai `absent` di hari kerja tanpa check-in
- [x] Sinkron status `leave` dari cuti approved
- [ ] Rename method contract yang masih menyebut `Employee` bila ingin konsisten penuh

## 5. Modul Lembur
- [x] `overtime.submit`
- [x] Validasi range waktu
- [x] Validasi konflik cuti approved
- [x] Hitung durasi menit
- [x] Generate nomor request
- [x] Insert approval log `submit`
- [x] `overtime.approve`
- [x] Cek role approver
- [x] Cek status `submitted`
- [x] Update status + approver metadata
- [x] Insert approval log `approve`
- [x] `overtime.reject`
- [x] Cek status `submitted`
- [x] Simpan alasan reject
- [x] Insert approval log `reject`
- [x] `overtime.list`
- [x] Filter status, user, period
- [ ] Include data user

## 6. Modul Cuti
- [x] `leave.submit`
- [x] Validasi tanggal (`start <= end`)
- [x] Hitung hari cuti efektif berdasar `hc_workdays`
- [x] Cek konflik request existing
- [x] Cek kuota cuti (default quota sementara)
- [x] Simpan status `submitted`
- [x] Insert approval log `submit`
- [x] `leave.approve`
- [x] Validasi role approver
- [x] Validasi status `submitted`
- [x] Re-check kuota cuti (annual)
- [x] Update status + approver
- [x] Sinkronkan attendance status `leave`
- [x] Insert approval log `approve`
- [x] `leave.reject`
- [x] Cek status `submitted`
- [x] Simpan alasan
- [x] Insert approval log `reject`
- [x] `leave.list`
- [x] Filter leave type/status/period

## 7. Modul Hari Kerja
- [x] `workday.bulkUpsert`
- [x] Validasi payload dan duplikasi tanggal
- [x] Upsert batch
- [x] `workday.listByPeriod`
- [x] Query range tanggal
- [x] Filter `is_workday`
- [x] `workday.syncImpactedAttendance` (opsional)
- [x] Identifikasi absensi terdampak
- [x] Recalculate status absensi dasar (`absent <-> holiday`)
- [ ] Penandaan dampak ke payroll period (ditunda karena payroll di-skip)

## 8. Modul Bonus (SKIP)
- [x] Seluruh task modul bonus di-skip sesuai arahan saat ini.

## 9. Modul Payroll (SKIP)
- [x] Seluruh task modul payroll di-skip sesuai arahan saat ini.
- [ ] Jika payroll diaktifkan lagi, semua relasi employee harus langsung pakai `User.id`

## 10. Security & Authorization
- [x] Auth middleware diterapkan via `protectedProcedure`/`supervisorProcedure`
- [x] Role guard endpoint approval/reject/bulk update sudah ada
- [x] Anti horizontal privilege escalation dasar pada list/request per user
- [x] Validasi input ketat dengan Zod
- [ ] Sanitasi text field lanjutan (hardening)
- [ ] Matrix role HC final untuk role blueprint (`employee/manager/hr/payroll_admin/super_admin`)

## 11. Logging, Monitoring, Audit
- [x] Semua approval aktif write ke `hc_approval_logs`
- [ ] Structured application log standar lintas endpoint
- [ ] Correlation/request id
- [ ] Metric endpoint HC

## 12. Testing
- [x] Unit test service layer (`hc_modules/hc_backend/tests`)
- [ ] Integration test endpoint HC
- [ ] Concurrency test (double approve)
- [ ] Regression test perubahan workday vs attendance
- [x] Audit kontrak internal setelah migrasi `employeeId -> userId` di area `hc_modules`
- [ ] Test runtime/integration kontrak setelah HC di-wire ke app utama

## 13. Dokumentasi API
- [ ] Tambah dokumentasi endpoint HC di OpenAPI/tRPC docs
- [ ] Tambah contoh request/response per endpoint modul aktif
- [ ] Tambah sequence diagram: leave approval flow
- [ ] Perjelas bahwa employee master source adalah `User`

## 14. Next Action (Iterasi Berikut)
- [ ] Finalisasi revisi dokumen blueprint + simulation mengikuti `User` sebagai employee master
- [ ] Finalisasi rename seluruh source code HC aktif ke `userId`
- [ ] Jalankan migration draft HC core ke database target
- [ ] Eksekusi seed HC minimal ke database target
- [ ] Lengkapi test unit untuk attendance/overtime/leave/workday
- [ ] Integrasi package `hc_modules/hc_backend` ke app router utama project
- [ ] Rapikan role mapping agar sesuai role blueprint HC (termasuk `hr`)
