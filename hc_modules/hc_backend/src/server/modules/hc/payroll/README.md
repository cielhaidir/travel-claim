# Payroll Module Blueprint

Blueprint ini dibuat dari referensi slip gaji yang memuat komponen pendapatan, tunjangan, potongan, dan beban perusahaan.

## Tujuan desain

- Menyimpan master komponen payroll secara fleksibel.
- Memisahkan `category`, `paidBy`, dan `taxTreatment` karena satu komponen dapat tampil di slip tetapi tidak selalu memengaruhi take home pay dengan cara yang sama.
- Mendukung assignment komponen per karyawan dengan nilai tetap, persentase, atau formula.
- Menyediakan struktur untuk payroll period, payroll run, dan slip line item.

## Mapping referensi slip

Komponen referensi dari gambar dipetakan sebagai berikut:

- `GAJI_POKOK`: earning, fixed, employee/company contract based.
- `TUNJ_BPJS_TK`: earning, manual/fixed.
- `TUNJ_BPJS_KES`: earning, manual/fixed.
- `TUNJ_PAJAK`: earning, manual/fixed, taxable.
- `JHT_COMPANY`: employer_cost, percentage 3.7%.
- `JKM_COMPANY`: employer_cost, percentage 0.3%.
- `JKK_COMPANY`: employer_cost, percentage 0.24%.
- `JP_COMPANY`: employer_cost, percentage 2%.
- `BPJS_KES_COMPANY`: employer_cost, percentage 4%.
- `NATURA`: benefit, manual/fixed, dapat taxable benefit.
- `BONUS`: earning, manual/fixed.
- `THR`: earning, manual/fixed.
- `POT_NATURA`: deduction, manual/fixed.
- `POT_ABSEN`: deduction, formula atau manual.
- `JHT_EMPLOYEE`: deduction, percentage 2%.
- `JP_EMPLOYEE`: deduction, percentage 1%.
- `BPJS_KES_EMPLOYEE`: deduction, percentage 1%.
- `PPH21_COMPANY`: employer_cost, manual/formula.
- `PPH21_EMPLOYEE`: deduction, manual/formula.

## Catatan implementasi

- `employer_cost` dipisahkan dari `deduction` karena item seperti JHT/JP/BPJS perusahaan sering perlu tampil pada slip atau laporan biaya, tetapi tidak selalu mengurangi netto karyawan.
- `benefit` dipakai untuk natura agar bisa dicatat sebagai benefit dan tetap dapat dibuat pasangan deduction bila perusahaan ingin recovery dari karyawan.
- `formulaExpression` disediakan untuk komponen seperti potongan absen, PPh21, atau prorata.
- Integrasi perhitungan ke attendance, leave, dan overtime sebaiknya dilakukan pada tahap `generateRun`.

## Endpoint dan service yang sudah dibuat

Berikut blueprint endpoint/service payroll yang sudah tersedia di modul ini.

### 1. List komponen payroll

- Router contract: `listComponents`
- Schema: `payrollComponentListSchema`
- Service: `PayrollService.listComponents`
- Fungsi: mengambil daftar master komponen payroll dengan filter kategori dan status aktif.

### 2. Tambah atau ubah komponen payroll

- Router contract: `upsertComponent`
- Schema: `payrollComponentUpsertSchema`
- Service: `PayrollService.upsertComponent`
- Fungsi: membuat atau memperbarui master komponen payroll seperti gaji pokok, potongan, BPJS, THR, dan lain-lain.
- Validasi yang sudah ada:
  - komponen `percentage` wajib punya `defaultRate`
  - komponen `formula` wajib punya `formulaExpression`

### 3. Assign komponen payroll ke karyawan

- Router contract: `assignEmployeeComponent`
- Schema: `payrollEmployeeComponentAssignSchema`
- Service: `PayrollService.assignEmployeeComponent`
- Fungsi: menetapkan komponen payroll tertentu ke karyawan beserta amount, rate, quantity, dan masa berlaku.
- Validasi yang sudah ada:
  - `effectiveEndDate` tidak boleh lebih kecil dari `effectiveStartDate`

### 4. Buka periode payroll

- Router contract: `openPeriod`
- Schema: `payrollPeriodOpenSchema`
- Service: `PayrollService.openPeriod`
- Fungsi: membuat periode payroll bulanan sebagai dasar proses penggajian.
- Validasi yang sudah ada:
  - `endDate` tidak boleh lebih kecil dari `startDate`

### 5. Generate payroll run

- Router contract: `generateRun`
- Schema: `payrollRunGenerateSchema`
- Service: `PayrollService.generateRun`
- Fungsi: membuat header proses payroll untuk satu periode, termasuk tipe run seperti `regular`, `thr`, `bonus`, atau `correction`.
- Catatan:
  - saat ini baru membuat record payroll run
  - perhitungan detail slip dari attendance, leave, overtime, BPJS, dan pajak belum diimplementasikan penuh

### 6. Finalisasi payroll run

- Router contract: `finalizeRun`
- Schema: `payrollRunFinalizeSchema`
- Service: `PayrollService.finalizeRun`
- Fungsi: menandai proses finalisasi payroll run.
- Catatan:
  - saat ini masih berupa blueprint response
  - update status ke repository/database belum diimplementasikan penuh

### 7. Ambil detail slip gaji

- Router contract: `getSlip`
- Schema: `payrollSlipGetSchema`
- Service: `PayrollService.getSlip`
- Fungsi: mengambil detail baris slip gaji per karyawan berdasarkan `runId` dan `userId`.

## Status implementasi saat ini

- Sudah ada:
  - blueprint schema zod
  - router contract payroll
  - service layer dasar
  - repository interface
  - struktur tabel payroll di migration SQL
- Belum ada:
  - implementasi repository ke Prisma/query database
  - endpoint tRPC/handler runtime yang benar-benar dieksekusi
  - engine perhitungan payroll detail
  - posting jurnal atau integrasi accounting
