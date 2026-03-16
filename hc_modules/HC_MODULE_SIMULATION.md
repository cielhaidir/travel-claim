# HC Module Simulation (Functional Flow)

## 1. Tujuan Dokumen
Dokumen ini berisi simulasi proses bisnis dan fungsi backend yang akan terjadi pada modul HC:
- Absensi
- Lembur
- Permintaan Cuti
- Hari Kerja
- Penggajian
- Bonus
- Approval Log (lintas modul)

Fokus: alur end-to-end, validasi, update table, dan dampak antar modul.

## 2. Daftar Tabel yang Dipakai
- `hc_employees`
- `hc_workdays`
- `hc_attendance`
- `hc_overtime_requests`
- `hc_leave_requests`
- `hc_payroll_periods`
- `hc_payroll_items`
- `hc_bonus`
- `hc_approval_logs`

Catatan tambahan untuk simulasi cuti:
- Untuk cek kuota cuti yang presisi, sistem idealnya memiliki `hc_leave_balances` (fase lanjutan).
- Untuk sementara, simulasi kuota bisa dihitung dari kebijakan default tahunan dikurangi cuti approved pada `hc_leave_requests`.

## 3. Simulasi Modul Absensi

## 3.1 Fungsi: `attendance.createCheckIn`
Tujuan: simpan jam masuk.

Input:
- `employeeId`
- `attendanceDate`
- `checkInAt`
- `source`

Langkah sistem:
1. Validasi user aktif di `hc_employees`.
2. Ambil `hc_workdays` berdasarkan `attendanceDate`.
3. Jika tanggal tidak ada di `hc_workdays`, fallback rule: weekend = non-workday.
4. Cek record `hc_attendance` (`employee_id`, `attendance_date`).
5. Jika belum ada, insert record baru dengan `check_in_at`.
6. Jika sudah ada dan `check_in_at` terisi, tolak request (hindari double check-in).
7. Tentukan `attendance_status` awal (`present`/`late`) berdasar cutoff jam kerja.

Output:
- data absensi tersimpan.

Table terlibat:
- read: `hc_employees`, `hc_workdays`, `hc_attendance`
- write: `hc_attendance`

## 3.2 Fungsi: `attendance.createCheckOut`
Tujuan: simpan jam pulang.

Input:
- `employeeId`
- `attendanceDate`
- `checkOutAt`

Langkah sistem:
1. Cari record `hc_attendance` hari tersebut.
2. Jika tidak ada check-in, tolak request (atau buat exception policy).
3. Validasi `checkOutAt >= checkInAt`.
4. Update `check_out_at`.
5. Hitung durasi kerja harian (untuk referensi payroll/rule attendance).

Table terlibat:
- read/write: `hc_attendance`

## 3.3 Fungsi: `attendance.nightlyFinalizeStatus` (batch)
Tujuan: menandai absen/lengkap setiap akhir hari.

Langkah sistem:
1. Ambil seluruh karyawan aktif (`hc_employees`).
2. Cek tanggal di `hc_workdays`.
3. Untuk karyawan tanpa record `hc_attendance` di hari kerja, insert status `absent`.
4. Jika ada cuti approved di tanggal tersebut, update status jadi `leave`.
5. Jika tanggal hari libur, status bisa `holiday`.

Table terlibat:
- read: `hc_employees`, `hc_workdays`, `hc_leave_requests`, `hc_attendance`
- write: `hc_attendance`

## 4. Simulasi Modul Lembur

## 4.1 Fungsi: `overtime.submit`
Tujuan: pengajuan lembur.

Input:
- `employeeId`
- `overtimeDate`
- `startTime`
- `endTime`
- `reason`

Langkah sistem:
1. Validasi employee aktif.
2. Validasi `endTime > startTime`.
3. Cek konflik dengan approved leave (`hc_leave_requests`) pada tanggal sama.
4. Hitung `duration_minutes`.
5. Generate `request_no`.
6. Simpan ke `hc_overtime_requests` dengan status `submitted`.
7. Catat `hc_approval_logs` action `submit`.

Table terlibat:
- read: `hc_employees`, `hc_leave_requests`
- write: `hc_overtime_requests`, `hc_approval_logs`

## 4.2 Fungsi: `overtime.approve`
Tujuan: approval lembur oleh manager/HR.

Input:
- `requestId`
- `approverId`
- `notes`

Langkah sistem:
1. Lock data request (transaction).
2. Pastikan status saat ini `submitted`.
3. Update status jadi `approved`, isi `approved_by`, `approved_at`.
4. Simpan log approval.

Table terlibat:
- read/write: `hc_overtime_requests`
- write: `hc_approval_logs`

## 4.3 Fungsi: `overtime.reject`
Tujuan: reject lembur.

Langkah sistem:
1. Validasi status `submitted`.
2. Update status `rejected` + `rejection_reason`.
3. Simpan approval log `reject`.

Table terlibat:
- read/write: `hc_overtime_requests`
- write: `hc_approval_logs`

## 5. Simulasi Modul Permintaan Cuti

## 5.1 Fungsi: `leave.submit`
Contoh utama: user ajukan cuti, sistem cek tanggal dan kuota.

Input:
- `employeeId`
- `leaveType`
- `startDate`
- `endDate`
- `reason`

Langkah sistem:
1. Validasi employee aktif (`hc_employees`).
2. Validasi rentang tanggal (`endDate >= startDate`).
3. Hitung hari cuti efektif:
   - ambil kalender dari `hc_workdays`
   - hanya hitung `is_workday = true`
4. Cek konflik pengajuan cuti existing (`submitted/approved`) di rentang tanggal sama.
5. Cek kuota cuti:
   - Opsi sementara: kuota default (mis. 12 hari/tahun) - total approved annual leave di tahun berjalan (`hc_leave_requests`).
   - Jika sisa kuota < hari diminta, tolak.
6. Generate `request_no`, simpan status `submitted`.
7. Catat `hc_approval_logs` action `submit`.

Table terlibat:
- read: `hc_employees`, `hc_workdays`, `hc_leave_requests`
- write: `hc_leave_requests`, `hc_approval_logs`

## 5.2 Fungsi: `leave.approve`
Langkah sistem:
1. Validasi status request `submitted`.
2. Re-check kuota (hindari race condition).
3. Update status `approved`, isi approver.
4. Simpan log approval.
5. Sinkronkan absensi:
   - untuk tanggal dalam rentang cuti, tandai `hc_attendance.attendance_status = leave` (jika diperlukan by policy).

Table terlibat:
- read/write: `hc_leave_requests`
- write: `hc_approval_logs`, `hc_attendance`

## 5.3 Fungsi: `leave.reject`
Langkah sistem:
1. Validasi status `submitted`.
2. Update jadi `rejected` + alasan.
3. Catat log.

Table terlibat:
- read/write: `hc_leave_requests`
- write: `hc_approval_logs`

## 6. Simulasi Modul Hari Kerja

## 6.1 Fungsi: `workday.bulkUpsert`
Tujuan: isi kalender kerja 1 tahun.

Input:
- array tanggal + status kerja/libur + deskripsi

Langkah sistem:
1. Validasi tidak ada tanggal duplikat pada payload.
2. Upsert ke `hc_workdays` per tanggal.
3. Jika status tanggal berubah (workday menjadi holiday), tandai data terkait untuk re-sync (flag internal).

Table terlibat:
- write: `hc_workdays`

## 6.2 Fungsi: `workday.syncImpactedAttendance` (opsional)
Tujuan: update absensi jika kalender berubah.

Langkah sistem:
1. Cari tanggal yang berubah.
2. Update `hc_attendance` agar status selaras policy baru.
3. Jika periode payroll masih draft/processing, tandai butuh regenerate.

Table terlibat:
- read/write: `hc_attendance`, `hc_payroll_periods`

## 7. Simulasi Modul Bonus

## 7.1 Fungsi: `bonus.create`
Tujuan: input bonus usulan.

Input:
- `employeeId`
- `bonusType`
- `bonusDate`
- `amount`
- `description`

Langkah sistem:
1. Validasi amount > 0.
2. Validasi employee aktif.
3. Simpan `hc_bonus` status `proposed`.
4. Catat approval log `submit`.

Table terlibat:
- read: `hc_employees`
- write: `hc_bonus`, `hc_approval_logs`

## 7.2 Fungsi: `bonus.approve` / `bonus.reject`
Langkah sistem:
1. Validasi status saat ini `proposed`.
2. Approve: ubah status `approved`, isi approver.
3. Reject: ubah status `rejected`.
4. Simpan approval log.

Table terlibat:
- read/write: `hc_bonus`
- write: `hc_approval_logs`

## 8. Simulasi Modul Penggajian

## 8.1 Fungsi: `payroll.generatePeriod`
Tujuan: generate payroll per periode.

Input:
- `periodCode`
- `startDate`
- `endDate`
- `actorId`

Langkah sistem:
1. Upsert/ambil `hc_payroll_periods` status `draft` atau `processing`.
2. Ambil daftar employee aktif.
3. Untuk tiap employee, hitung komponen:
   - `basic_salary` (sumber master kompensasi; sementara bisa placeholder)
   - `attendance_deduction` dari `hc_attendance` (absent/late rule)
   - `overtime_amount` dari `hc_overtime_requests` status `approved`
   - `bonus_amount` dari `hc_bonus` status `approved` dalam periode
   - `tax_amount`, `bpjs_amount`, `other_deduction` sesuai formula
4. Hitung `gross_salary` dan `net_salary`.
5. Upsert `hc_payroll_items` per employee.
6. Update period status `processing` lalu `finalized` saat selesai (jika auto finalize tidak dipakai, tetap `processing`).

Table terlibat:
- read: `hc_employees`, `hc_attendance`, `hc_overtime_requests`, `hc_bonus`
- write: `hc_payroll_periods`, `hc_payroll_items`

## 8.2 Fungsi: `payroll.finalizePeriod`
Tujuan: kunci hasil payroll agar tidak berubah.

Langkah sistem:
1. Validasi period ada dan status `processing`/`draft`.
2. Validasi seluruh data mandatory payroll item lengkap.
3. Set status `finalized`, isi `processed_at`, `processed_by`.
4. Opsional simpan log approval untuk payroll.

Table terlibat:
- read/write: `hc_payroll_periods`, `hc_payroll_items`
- write opsional: `hc_approval_logs`

## 8.3 Fungsi: `payroll.markAsPaid`
Tujuan: tandai payroll sudah dibayar.

Langkah sistem:
1. Validasi period status `finalized`.
2. Update status period `paid`.
3. Update `hc_bonus` terkait menjadi `paid` jika bonus dibayarkan lewat payroll period.

Table terlibat:
- read/write: `hc_payroll_periods`, `hc_bonus`

## 9. Simulasi Modul Approval Log (Lintas Modul)

## 9.1 Fungsi internal: `approvalLog.record`
Tujuan: audit trail konsisten.

Input:
- `moduleName`
- `referenceId`
- `action`
- `actorId`
- `notes`

Langkah sistem:
1. Insert row ke `hc_approval_logs`.
2. Dipanggil setiap transisi status pada lembur/cuti/bonus/payroll.

Table terlibat:
- write: `hc_approval_logs`

## 10. Simulasi End-to-End Periode Gaji
Contoh skenario bulanan:
1. HR isi `hc_workdays` untuk bulan berjalan.
2. Employee melakukan absensi harian (`hc_attendance`).
3. Employee submit lembur/cuti.
4. Manager/HR approve atau reject.
5. Finance/Payroll Admin generate payroll period.
6. Sistem tarik data approved:
   - cuti approved mempengaruhi attendance status
   - lembur approved menambah overtime amount
   - bonus approved menambah bonus amount
7. Payroll finalize.
8. Payroll dibayar, status periode `paid`.

## 11. Aturan Validasi Penting (Cross-Module)
- Tidak boleh approve request yang bukan `submitted`.
- Tidak boleh ubah data transaksi jika payroll period sudah `finalized` (kecuali proses koreksi resmi).
- Semua kalkulasi uang menggunakan decimal (bukan float).
- Semua perubahan status wajib menulis `hc_approval_logs`.
- Semua proses generate payroll harus idempotent (upsert, bukan insert buta).

## 12. Daftar Fungsi Backend yang Disarankan
- `attendance.createCheckIn`
- `attendance.createCheckOut`
- `attendance.nightlyFinalizeStatus`
- `attendance.listByEmployeePeriod`
- `overtime.submit`
- `overtime.approve`
- `overtime.reject`
- `leave.submit`
- `leave.approve` -> konfirmasi izin
- `leave.reject`
- `workday.bulkUpsert`
- `workday.syncImpactedAttendance`
- `bonus.create`
- `bonus.approve`
- `bonus.reject`
- `payroll.generatePeriod`
- `payroll.finalizePeriod`
- `payroll.markAsPaid`
- `approvalLog.record`

## 13. Contoh Pseudocode Singkat: Cek Kuota Cuti
```ts
function validateLeaveQuota(employeeId, leaveType, startDate, endDate) {
  const requestedDays = countEffectiveWorkdays(startDate, endDate);
  if (leaveType !== "annual") return { ok: true, requestedDays };

  const yearlyQuota = 12;
  const usedDays = sumApprovedAnnualLeaveDays(employeeId, year(startDate));
  const remaining = yearlyQuota - usedDays;

  if (remaining < requestedDays) {
    throw new Error("Insufficient leave quota");
  }
  return { ok: true, requestedDays, remainingAfter: remaining - requestedDays };
}
```

---

Dokumen simulasi ini bisa langsung dijadikan dasar untuk implementasi:
- `schema.prisma`
- `router` tRPC per modul
- service layer dengan transaction boundaries.
