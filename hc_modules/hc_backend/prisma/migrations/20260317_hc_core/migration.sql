-- HC core migration (modular scope only)
-- Scope: workdays, attendance, overtime_requests, leave_requests, approval_logs
-- Employee master source: public."User"
-- Skip: payroll, bonus

CREATE TYPE hc_work_type AS ENUM ('regular', 'weekend', 'holiday', 'collective_leave');
CREATE TYPE hc_attendance_status AS ENUM ('present', 'late', 'absent', 'leave', 'holiday', 'sick', 'remote');
CREATE TYPE hc_attendance_source AS ENUM ('mobile', 'web', 'machine', 'import');
CREATE TYPE hc_request_status AS ENUM ('draft', 'submitted', 'approved', 'rejected', 'cancelled');
CREATE TYPE hc_leave_type AS ENUM ('annual', 'sick', 'unpaid', 'maternity', 'paternity', 'special');
CREATE TYPE hc_approval_module AS ENUM ('overtime', 'leave');
CREATE TYPE hc_approval_action AS ENUM ('submit', 'approve', 'reject', 'cancel', 'revise');

CREATE TABLE hc_workdays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_date DATE NOT NULL UNIQUE,
  is_workday BOOLEAN NOT NULL,
  work_type hc_work_type NOT NULL,
  description VARCHAR(255) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE hc_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES "User"(id),
  attendance_date DATE NOT NULL,
  check_in_at TIMESTAMPTZ NULL,
  check_out_at TIMESTAMPTZ NULL,
  attendance_status hc_attendance_status NOT NULL,
  source hc_attendance_source NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_hc_attendance_user_date UNIQUE(user_id, attendance_date)
);

CREATE TABLE hc_overtime_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_no VARCHAR(50) NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES "User"(id),
  overtime_date DATE NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  reason TEXT NOT NULL,
  status hc_request_status NOT NULL DEFAULT 'draft',
  approved_by_user_id TEXT NULL REFERENCES "User"(id),
  approved_at TIMESTAMPTZ NULL,
  rejection_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_hc_overtime_end_after_start CHECK (end_time > start_time)
);

CREATE TABLE hc_leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_no VARCHAR(50) NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES "User"(id),
  leave_type hc_leave_type NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days NUMERIC(5,2) NOT NULL CHECK (total_days >= 0),
  reason TEXT NULL,
  status hc_request_status NOT NULL DEFAULT 'draft',
  approved_by_user_id TEXT NULL REFERENCES "User"(id),
  approved_at TIMESTAMPTZ NULL,
  rejection_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_hc_leave_start_end CHECK (end_date >= start_date)
);

CREATE TABLE hc_approval_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_name hc_approval_module NOT NULL,
  reference_id UUID NOT NULL,
  action hc_approval_action NOT NULL,
  actor_user_id TEXT NOT NULL REFERENCES "User"(id),
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hc_attendance_user_date ON hc_attendance(user_id, attendance_date);
CREATE INDEX idx_hc_attendance_date_status ON hc_attendance(attendance_date, attendance_status);
CREATE INDEX idx_hc_overtime_user_date ON hc_overtime_requests(user_id, overtime_date);
CREATE INDEX idx_hc_overtime_status_date ON hc_overtime_requests(status, overtime_date);
CREATE INDEX idx_hc_leave_user_date ON hc_leave_requests(user_id, start_date, end_date);
CREATE INDEX idx_hc_leave_status_start ON hc_leave_requests(status, start_date);
CREATE INDEX idx_hc_approval_module_ref ON hc_approval_logs(module_name, reference_id, created_at);
