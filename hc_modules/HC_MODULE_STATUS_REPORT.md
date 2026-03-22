# HC Module Status Report

Tanggal audit: 2026-03-22
Lokasi scope: `hc_modules/`

## Ringkasan Eksekutif
Paket HC di `hc_modules` sudah berada pada status **modular draft yang konsisten** dengan arsitektur baru:
- employee master source menggunakan tabel existing `User`
- seluruh kontrak internal aktif diarahkan ke `userId/user_id`
- migration draft HC core sudah menargetkan FK ke `User.id`
- seed modular HC sudah menyesuaikan data existing `User`

Namun paket ini **belum runtime-ready penuh** karena masih dibatasi hanya di `hc_modules` dan belum di-wire ke app utama.

## Status Per Area

### 1. Dokumentasi
**Status:** siap

File:
- `HC_BACKEND_BLUEPRINT.md`
- `HC_MODULE_SIMULATION.md`
- `HC_API_BUILD_CHECKLIST.md`
- `hc_backend/README.md`

Kondisi:
- sudah selaras dengan model `User` sebagai employee master
- sudah mencatat perubahan naming utama
- sudah memisahkan batas scope `hc_modules` vs app utama

### 2. Migration Draft
**Status:** siap direview

File:
- `hc_backend/prisma/migrations/20260317_hc_core/migration.sql`

Kondisi:
- `hc_employees` sudah dihapus dari draft inti aktif
- FK HC aktif diarahkan ke `public."User"(id)`
- naming utama sudah konsisten: `user_id`, `approved_by_user_id`, `actor_user_id`

Catatan:
- belum dieksekusi ke database target
- belum divalidasi lewat migrate runtime

### 3. Seed Modular HC
**Status:** siap sebagai seed contoh modular

File:
- `hc_backend/prisma/seed-hc.sql`

Kondisi:
- menggunakan `User` existing sebagai sumber `user_id`
- memiliki seed contoh untuk:
  - `hc_workdays`
  - `hc_attendance`
  - `hc_overtime_requests`
  - `hc_leave_requests`
  - `hc_approval_logs`
- aman sebagai referensi seed di layer modular HC

Catatan:
- data sample masih demonstratif
- belum disesuaikan ke kebutuhan bisnis final

### 4. Attendance Module
**Status:** siap sebagai service contract draft

File:
- `attendance.schema.ts`
- `attendance.types.ts`
- `attendance.repository.ts`
- `attendance.service.ts`
- `attendance.router.ts`

Kondisi:
- sudah memakai `userId`
- service logic validasi dasar sudah ada
- router contract sudah dirapikan ke `listByPeriod`

Catatan:
- repository masih berupa contract/interface, belum implementasi query nyata

### 5. Overtime Module
**Status:** siap sebagai service contract draft

File:
- `overtime.schema.ts`
- `overtime.repository.ts`
- `overtime.service.ts`
- `overtime.router.ts`

Kondisi:
- sudah memakai `userId`
- approval metadata sudah memakai `approvedByUserId`
- approval log sudah memakai `actorUserId`

Catatan:
- belum ada repository implementation nyata

### 6. Leave Module
**Status:** siap sebagai service contract draft

File:
- `leave.schema.ts`
- `leave.repository.ts`
- `leave.service.ts`
- `leave.router.ts`

Kondisi:
- sudah memakai `userId`
- kuota cuti tahunan dan konflik request sudah ada di service layer
- sinkronisasi ke attendance sudah mengikuti model user-centric

Catatan:
- belum ada implementasi repository nyata

### 7. Workday Module
**Status:** siap sebagai service contract draft

File:
- `workday.schema.ts`
- `workday.repository.ts`
- `workday.service.ts`
- `workday.router.ts`

Kondisi:
- typing attendance sudah memakai `userId`
- logic bulk upsert, list, dan sync impacted attendance sudah tersedia

Catatan:
- belum ada repository implementation nyata

### 8. Shared Layer
**Status:** siap

File:
- `shared/hc.types.ts`
- `shared/date.util.ts`
- `shared/approval-log.helper.ts`
- `shared/role.util.ts`
- `hc.router.ts`

Kondisi:
- type dasar HC aktif tersedia
- approval log helper sudah memakai `actorUserId`
- router agregat HC tersedia

## Batasan Saat Ini
Paket HC di `hc_modules` **belum** mencakup:
- wiring ke router utama aplikasi
- implementasi repository Prisma nyata
- migrate ke database target
- integration test runtime
- frontend binding

## Kesimpulan
Jika dinilai **khusus dalam batas `hc_modules`**, maka status saat ini adalah:

- **arsitektur:** siap
- **kontrak modul:** siap
- **service layer draft:** siap
- **unit test modular (`hc_modules` only):** tersedia dan lulus
- **migration draft:** siap direview
- **seed modular:** siap sebagai contoh
- **runtime aktif di app utama:** belum

## Rekomendasi Lanjutan
Bila nanti scope dibuka keluar `hc_modules`, urutan terbaik:
1. implementasi repository nyata berbasis Prisma
2. sambungkan router HC ke app utama
3. jalankan migration ke database target
4. jalankan seed modular yang sudah disesuaikan
5. tambah test runtime & integration
