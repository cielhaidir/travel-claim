# HC Module Simulation (Functional Flow)

## 1. Tujuan Dokumen
Dokumen ini berisi simulasi proses bisnis dan fungsi backend pada modul HC dengan asumsi bahwa **master employee existing adalah `User`**.

Fokus:
- Absensi
- Lembur
- Permintaan Cuti
- Hari Kerja
- Penggajian
- Bonus
- Approval Log

## 2. Daftar Tabel yang Dipakai
- `User` (master employee existing)
- `hc_workdays`
- `hc_attendance`
- `hc_overtime_requests`
- `hc_leave_requests`
- `hc_payroll_periods`
- `hc_payroll_items`
- `hc_bonus`
- `hc_approval_logs`

## 3. Simulasi Modul Absensi

### 3.1 Fungsi: `attendance.createCheckIn`
Input:
- `userId`
- `attendanceDate`
- `checkInAt`
- `source`

Langkah sistem:
1. Validasi user aktif di `User` (`deletedAt IS NULL`).
2. Ambil `hc_workdays` berdasarkan `attendanceDate`.
3. Jika tanggal tidak ada di `hc_workdays`, fallback rule: weekend = non-workday.
4. Cek record `hc_attendance` berdasarkan (`user_id`, `attendance_date`).
5. Jika belum ada, insert record baru dengan `check_in_at`.
6. Jika sudah ada dan `check_in_at` terisi, tolak request.
7. Tentukan `attendance_status` awal (`present`/`late`).

### 3.2 Fungsi: `attendance.createCheckOut`
Input:
- `userId`
- `attendanceDate`
- `checkOutAt`

Langkah sistem:
1. Cari record `hc_attendance` hari tersebut.
2. Jika tidak ada check-in, tolak request.
3. Validasi `checkOutAt >= checkInAt`.
4. Update `check_out_at`.

### 3.3 Fungsi: `attendance.nightlyFinalizeStatus`
Langkah sistem:
1. Ambil seluruh user aktif dari `User`.
2. Cek tanggal di `hc_workdays`.
3. Untuk user tanpa record `hc_attendance` di hari kerja, insert status `absent`.
4. Jika ada cuti approved di tanggal tersebut, update status jadi `leave`.
5. Jika tanggal hari libur, status bisa `holiday`.

## 4. Simulasi Modul Lembur

### 4.1 Fungsi: `overtime.submit`
Input:
- `userId`
- `overtimeDate`
- `startTime`
- `endTime`
- `reason`

Langkah sistem:
1. Validasi user aktif di `User`.
2. Validasi `endTime > startTime`.
3. Cek konflik dengan approved leave pada tanggal sama.
4. Hitung `duration_minutes`.
5. Generate `request_no`.
6. Simpan ke `hc_overtime_requests` dengan status `submitted`.
7. Catat `hc_approval_logs` action `submit` dengan `actor_user_id = userId`.

### 4.2 Fungsi: `overtime.approve`
Langkah sistem:
1. Validasi status saat ini `submitted`.
2. Update status jadi `approved`, isi `approved_by_user_id`, `approved_at`.
3. Simpan log approval.

### 4.3 Fungsi: `overtime.reject`
Langkah sistem:
1. Validasi status `submitted`.
2. Update status `rejected` + `rejection_reason`.
3. Simpan approval log `reject`.

## 5. Simulasi Modul Cuti

### 5.1 Fungsi: `leave.submit`
Input:
- `userId`
- `leaveType`
- `startDate`
- `endDate`
- `reason`

Langkah sistem:
1. Validasi user aktif di `User`.
2. Validasi rentang tanggal.
3. Hitung hari cuti efektif dari `hc_workdays`.
4. Cek konflik pengajuan existing.
5. Cek kuota cuti tahunan.
6. Generate `request_no`, simpan status `submitted`.
7. Catat approval log `submit`.

### 5.2 Fungsi: `leave.approve`
Langkah sistem:
1. Validasi status request `submitted`.
2. Re-check kuota.
3. Update status `approved`, isi `approved_by_user_id`.
4. Simpan log approval.
5. Sinkronkan absensi: tandai `hc_attendance.attendance_status = leave` untuk rentang cuti.

### 5.3 Fungsi: `leave.reject`
Langkah sistem:
1. Validasi status `submitted`.
2. Update jadi `rejected` + alasan.
3. Catat log.

## 6. Simulasi Modul Hari Kerja

### 6.1 Fungsi: `workday.bulkUpsert`
Input:
- array tanggal + status kerja/libur + deskripsi

Langkah sistem:
1. Validasi tidak ada tanggal duplikat pada payload.
2. Upsert ke `hc_workdays` per tanggal.

### 6.2 Fungsi: `workday.syncImpactedAttendance`
Langkah sistem:
1. Cari tanggal yang berubah.
2. Update `hc_attendance` agar status selaras policy baru.
3. Jika periode payroll masih draft/processing, tandai butuh regenerate.

## 7. Simulasi Modul Bonus
- Jika diaktifkan, relasi bonus harus pakai `user_id` dan `approved_by_user_id`.

## 8. Simulasi Modul Penggajian
- Jika diaktifkan, payroll item harus pakai `user_id`.
- Perhitungan payroll tetap menarik data dari absensi, lembur, bonus, dan cuti approved milik user.

## 9. Approval Log
Input:
- `moduleName`
- `referenceId`
- `action`
- `actorUserId`
- `notes`

Langkah sistem:
1. Insert row ke `hc_approval_logs`.
2. Dipanggil setiap transisi status pada lembur/cuti/bonus/payroll.

## 10. Aturan Validasi Penting
- Tidak boleh approve request yang bukan `submitted`.
- Semua perubahan status wajib menulis `hc_approval_logs`.
- Semua relasi karyawan harus memakai `User.id`.
- Tidak ada lagi dependensi ke `hc_employees`.

## 11. Catatan Revisi
Seluruh kontrak lama yang masih memakai:
- `employeeId`
- `employee_id`
- `approved_by`
- `actor_id`

harus diperbarui menjadi:
- `userId`
- `user_id`
- `approved_by_user_id`
- `actor_user_id`
