-- HC payroll blueprint migration
-- Scope: payroll reference/master data, employee component assignment, payroll periods, runs, slip lines
-- Source references:
-- - earnings: gaji pokok, tunjangan BPJS TK/Kes, tunjangan pajak, bonus, THR, natura
-- - deductions: potongan natura, potongan absen, JHT/JP/BPJS Kes employee, PPh21 employee
-- - employer cost: JHT/JKM/JKK/JP/BPJS Kes company, PPh21 company

CREATE TYPE hc_payroll_component_category AS ENUM ('earning', 'deduction', 'employer_cost', 'benefit');
CREATE TYPE hc_payroll_calculation_method AS ENUM ('fixed', 'percentage', 'manual', 'formula');
CREATE TYPE hc_payroll_paid_by AS ENUM ('employee', 'company', 'shared');
CREATE TYPE hc_payroll_tax_treatment AS ENUM ('taxable', 'non_taxable', 'tax_deduction', 'informational');
CREATE TYPE hc_payroll_period_status AS ENUM ('open', 'processing', 'finalized', 'cancelled');
CREATE TYPE hc_payroll_run_status AS ENUM ('draft', 'calculated', 'posted', 'cancelled');
CREATE TYPE hc_payroll_run_type AS ENUM ('regular', 'thr', 'bonus', 'correction');
CREATE TYPE hc_payroll_proration_method AS ENUM ('calendar_day', 'workday', 'none');

-- Master referensi komponen payroll seperti gaji pokok, tunjangan, potongan, benefit, dan beban perusahaan.
CREATE TABLE payroll_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- ID unik master komponen payroll
  code VARCHAR(50) NOT NULL UNIQUE, -- Kode unik komponen, misalnya GAJI_POKOK
  name VARCHAR(150) NOT NULL, -- Nama komponen yang tampil di sistem/slip gaji
  category hc_payroll_component_category NOT NULL, -- Kelompok komponen: pendapatan, potongan, beban perusahaan, atau benefit
  calculation_method hc_payroll_calculation_method NOT NULL, -- Cara hitung komponen: fixed, percentage, manual, atau formula
  paid_by hc_payroll_paid_by NOT NULL DEFAULT 'company', -- Pihak yang menanggung komponen: employee, company, atau shared
  tax_treatment hc_payroll_tax_treatment NOT NULL DEFAULT 'taxable', -- Perlakuan pajak untuk komponen ini
  default_rate NUMERIC(8,4) NULL, -- Persentase default jika komponen dihitung berdasarkan rate
  currency CHAR(3) NOT NULL DEFAULT 'IDR', -- Mata uang nominal komponen
  is_prorated BOOLEAN NOT NULL DEFAULT FALSE, -- Penanda apakah komponen dapat diprorata
  proration_method hc_payroll_proration_method NOT NULL DEFAULT 'none', -- Metode prorata yang dipakai
  is_taxable_benefit BOOLEAN NOT NULL DEFAULT FALSE, -- Penanda apakah benefit ini termasuk objek pajak
  show_on_slip BOOLEAN NOT NULL DEFAULT TRUE, -- Penanda apakah komponen ditampilkan di slip gaji
  sort_order INTEGER NOT NULL DEFAULT 0, -- Urutan tampil komponen pada slip/laporan
  formula_expression TEXT NULL, -- Rumus perhitungan bila metode formula digunakan
  notes TEXT NULL, -- Catatan tambahan untuk komponen
  is_active BOOLEAN NOT NULL DEFAULT TRUE, -- Status aktif/nonaktif komponen
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- Waktu data dibuat
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW() -- Waktu data terakhir diperbarui
);

-- Assignment komponen payroll ke masing-masing karyawan beserta nilai, rate, dan masa berlakunya.
CREATE TABLE employee_payroll_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- ID unik assignment komponen ke karyawan
  user_id TEXT NOT NULL REFERENCES "User"(id), -- ID karyawan yang menerima komponen
  component_id UUID NOT NULL REFERENCES payroll_components(id), -- Referensi ke master komponen payroll
  effective_start_date DATE NOT NULL, -- Tanggal mulai komponen berlaku
  effective_end_date DATE NULL, -- Tanggal akhir komponen berlaku, null jika masih aktif
  amount NUMERIC(18,2) NULL, -- Nilai nominal tetap untuk karyawan
  rate NUMERIC(8,4) NULL, -- Nilai persentase khusus untuk karyawan
  quantity NUMERIC(18,4) NULL, -- Jumlah/unit yang dipakai dalam perhitungan
  calculation_base VARCHAR(100) NULL, -- Basis hitung, misalnya base_salary atau gross_salary
  metadata JSONB NULL, -- Data tambahan fleksibel untuk kebutuhan perhitungan
  remarks TEXT NULL, -- Keterangan tambahan assignment komponen
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- Waktu data dibuat
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- Waktu data terakhir diperbarui
  CONSTRAINT ck_employee_payroll_component_date CHECK (
    effective_end_date IS NULL OR effective_end_date >= effective_start_date
  )
);

-- Master periode payroll per bulan/tahun yang menjadi dasar proses penggajian.
CREATE TABLE payroll_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- ID unik periode payroll
  period_year INTEGER NOT NULL, -- Tahun periode payroll
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12), -- Bulan periode payroll
  start_date DATE NOT NULL, -- Tanggal awal periode perhitungan gaji
  end_date DATE NOT NULL, -- Tanggal akhir periode perhitungan gaji
  payroll_date DATE NOT NULL, -- Tanggal pembayaran gaji
  status hc_payroll_period_status NOT NULL DEFAULT 'open', -- Status periode payroll
  notes TEXT NULL, -- Catatan tambahan periode payroll
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- Waktu data dibuat
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- Waktu data terakhir diperbarui
  CONSTRAINT uq_payroll_period UNIQUE(period_year, period_month),
  CONSTRAINT ck_payroll_period_date CHECK (end_date >= start_date)
);

-- Header proses generate payroll untuk satu periode, termasuk tipe run dan status prosesnya.
CREATE TABLE payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- ID unik proses payroll run
  period_id UUID NOT NULL REFERENCES payroll_periods(id), -- Referensi ke periode payroll
  run_type hc_payroll_run_type NOT NULL DEFAULT 'regular', -- Jenis payroll run: regular, THR, bonus, atau koreksi
  status hc_payroll_run_status NOT NULL DEFAULT 'draft', -- Status proses payroll run
  triggered_by_user_id TEXT NOT NULL REFERENCES "User"(id), -- User yang memulai generate payroll
  finalized_by_user_id TEXT NULL REFERENCES "User"(id), -- User yang melakukan finalisasi payroll
  finalized_at TIMESTAMPTZ NULL, -- Waktu payroll run difinalisasi
  notes TEXT NULL, -- Catatan tambahan payroll run
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- Waktu data dibuat
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW() -- Waktu data terakhir diperbarui
);

-- Rekap hasil payroll per karyawan dalam satu payroll run, termasuk gross, deduction, dan net salary.
CREATE TABLE payroll_run_employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- ID unik hasil payroll per karyawan
  run_id UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE, -- Referensi ke payroll run
  user_id TEXT NOT NULL REFERENCES "User"(id), -- ID karyawan yang dihitung payroll-nya
  base_salary NUMERIC(18,2) NOT NULL DEFAULT 0, -- Gaji pokok karyawan
  gross_salary NUMERIC(18,2) NOT NULL DEFAULT 0, -- Gaji bruto sebelum potongan
  total_earnings NUMERIC(18,2) NOT NULL DEFAULT 0, -- Total seluruh komponen pendapatan
  total_deductions NUMERIC(18,2) NOT NULL DEFAULT 0, -- Total seluruh potongan karyawan
  total_employer_cost NUMERIC(18,2) NOT NULL DEFAULT 0, -- Total beban tambahan yang ditanggung perusahaan
  total_benefits NUMERIC(18,2) NOT NULL DEFAULT 0, -- Total benefit/natura yang tercatat
  net_salary NUMERIC(18,2) NOT NULL DEFAULT 0, -- Gaji bersih yang diterima karyawan
  tax_allowance NUMERIC(18,2) NOT NULL DEFAULT 0, -- Nilai tunjangan pajak atau gross up
  metadata JSONB NULL, -- Snapshot data pendukung hasil kalkulasi payroll
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- Waktu data dibuat
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- Waktu data terakhir diperbarui
  CONSTRAINT uq_payroll_run_employee UNIQUE(run_id, user_id)
);

-- Detail baris slip gaji per karyawan hasil kalkulasi payroll run.
CREATE TABLE payroll_slip_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- ID unik baris detail slip gaji
  payroll_run_employee_id UUID NOT NULL REFERENCES payroll_run_employees(id) ON DELETE CASCADE, -- Referensi ke hasil payroll per karyawan
  component_id UUID NOT NULL REFERENCES payroll_components(id), -- Referensi ke master komponen payroll
  component_code VARCHAR(50) NOT NULL, -- Kode komponen saat slip dibuat
  component_name VARCHAR(150) NOT NULL, -- Nama komponen saat slip dibuat
  category hc_payroll_component_category NOT NULL, -- Kategori komponen pada slip
  paid_by hc_payroll_paid_by NOT NULL, -- Penanggung komponen pada slip
  amount NUMERIC(18,2) NOT NULL DEFAULT 0, -- Nilai nominal komponen
  rate NUMERIC(8,4) NULL, -- Persentase yang dipakai saat perhitungan
  quantity NUMERIC(18,4) NULL, -- Kuantitas yang dipakai saat perhitungan
  display_order INTEGER NOT NULL DEFAULT 0, -- Urutan tampil baris pada slip gaji
  calculation_snapshot JSONB NULL, -- Snapshot detail formula atau basis hitung komponen
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW() -- Waktu baris slip dibuat
);

CREATE INDEX idx_employee_payroll_components_user_dates
  ON employee_payroll_components(user_id, effective_start_date, effective_end_date);
CREATE INDEX idx_payroll_components_category_active
  ON payroll_components(category, is_active, sort_order);
CREATE INDEX idx_payroll_runs_period_status
  ON payroll_runs(period_id, status, run_type);
CREATE INDEX idx_payroll_run_employees_user
  ON payroll_run_employees(user_id, run_id);
CREATE INDEX idx_payroll_slip_lines_run_employee
  ON payroll_slip_lines(payroll_run_employee_id, display_order);

INSERT INTO payroll_components (
  code,
  name,
  category,
  calculation_method,
  paid_by,
  tax_treatment,
  default_rate,
  is_prorated,
  proration_method,
  is_taxable_benefit,
  show_on_slip,
  sort_order,
  notes
) VALUES
  ('GAJI_POKOK', 'Gaji Pokok', 'earning', 'fixed', 'company', 'taxable', NULL, TRUE, 'workday', FALSE, TRUE, 10, 'Komponen gaji pokok utama'),
  ('TUNJ_BPJS_TK', 'Tunjangan BPJS TK', 'earning', 'manual', 'company', 'taxable', NULL, FALSE, 'none', FALSE, TRUE, 20, 'Allowance untuk cover BPJS Ketenagakerjaan'),
  ('TUNJ_BPJS_KES', 'Tunjangan BPJS Kesehatan', 'earning', 'manual', 'company', 'taxable', NULL, FALSE, 'none', FALSE, TRUE, 21, 'Allowance untuk cover BPJS Kesehatan'),
  ('TUNJ_PAJAK', 'Tunjangan Pajak', 'earning', 'manual', 'company', 'taxable', NULL, FALSE, 'none', FALSE, TRUE, 22, 'Tax allowance atau gross up pajak'),
  ('JHT_COMPANY', 'JHT By Company', 'employer_cost', 'percentage', 'company', 'informational', 3.7000, FALSE, 'none', FALSE, TRUE, 30, 'JHT 3.7% ditanggung perusahaan'),
  ('JKM_COMPANY', 'JKM By Company', 'employer_cost', 'percentage', 'company', 'informational', 0.3000, FALSE, 'none', FALSE, TRUE, 31, 'JKM 0.3% ditanggung perusahaan'),
  ('JKK_COMPANY', 'JKK By Company', 'employer_cost', 'percentage', 'company', 'informational', 0.2400, FALSE, 'none', FALSE, TRUE, 32, 'JKK 0.24% ditanggung perusahaan'),
  ('JP_COMPANY', 'JP By Company', 'employer_cost', 'percentage', 'company', 'informational', 2.0000, FALSE, 'none', FALSE, TRUE, 33, 'JP 2% ditanggung perusahaan'),
  ('BPJS_KES_COMPANY', 'BPJS Kesehatan By Company', 'employer_cost', 'percentage', 'company', 'informational', 4.0000, FALSE, 'none', FALSE, TRUE, 34, 'BPJS Kesehatan 4% ditanggung perusahaan'),
  ('NATURA', 'Natura', 'benefit', 'manual', 'company', 'taxable', NULL, FALSE, 'none', TRUE, TRUE, 40, 'Benefit natura, misalnya mobil dinas'),
  ('BONUS', 'Bonus', 'earning', 'manual', 'company', 'taxable', NULL, FALSE, 'none', FALSE, TRUE, 50, 'Bonus insidental'),
  ('THR', 'THR', 'earning', 'manual', 'company', 'taxable', NULL, FALSE, 'none', FALSE, TRUE, 51, 'Tunjangan Hari Raya'),
  ('POT_NATURA', 'Potongan Natura', 'deduction', 'manual', 'employee', 'tax_deduction', NULL, FALSE, 'none', FALSE, TRUE, 60, 'Recovery natura dari karyawan'),
  ('POT_ABSEN', 'Potongan Absen', 'deduction', 'formula', 'employee', 'tax_deduction', NULL, TRUE, 'workday', FALSE, TRUE, 61, 'Potongan karena absensi'),
  ('JHT_EMPLOYEE', 'JHT By Employee', 'deduction', 'percentage', 'employee', 'tax_deduction', 2.0000, FALSE, 'none', FALSE, TRUE, 70, 'JHT 2% dipotong dari karyawan'),
  ('JP_EMPLOYEE', 'JP By Employee', 'deduction', 'percentage', 'employee', 'tax_deduction', 1.0000, FALSE, 'none', FALSE, TRUE, 71, 'JP 1% dipotong dari karyawan'),
  ('BPJS_KES_EMPLOYEE', 'BPJS Kesehatan By Employee', 'deduction', 'percentage', 'employee', 'tax_deduction', 1.0000, FALSE, 'none', FALSE, TRUE, 72, 'BPJS Kesehatan 1% dipotong dari karyawan'),
  ('PPH21_COMPANY', 'PPh 21 By Company', 'employer_cost', 'formula', 'company', 'informational', NULL, FALSE, 'none', FALSE, TRUE, 80, 'PPh21 ditanggung perusahaan'),
  ('PPH21_EMPLOYEE', 'PPh 21 By Employee', 'deduction', 'formula', 'employee', 'tax_deduction', NULL, FALSE, 'none', FALSE, TRUE, 81, 'PPh21 dipotong dari karyawan');
