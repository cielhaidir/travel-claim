-- Seed HC (scope aktif, user-centric)
-- Catatan:
-- - Employee master source adalah tabel public."User"
-- - Script ini aman dipakai sebagai referensi seed modular HC di luar app utama
-- - Semua transaksi HC memakai user_id dari data existing di tabel "User"

BEGIN;

-- 1) Workday baseline
INSERT INTO workdays (work_date, is_workday, work_type, description)
VALUES
  ('2026-03-16', true, 'regular', 'Regular Monday'),
  ('2026-03-17', true, 'regular', 'Regular Tuesday'),
  ('2026-03-18', true, 'regular', 'Regular Wednesday'),
  ('2026-03-19', true, 'regular', 'Regular Thursday'),
  ('2026-03-20', true, 'regular', 'Regular Friday'),
  ('2026-03-21', false, 'weekend', 'Saturday'),
  ('2026-03-22', false, 'weekend', 'Sunday')
ON CONFLICT (work_date) DO NOTHING;

-- 2) Ambil maksimal 2 user aktif untuk demo modular HC
WITH selected_users AS (
  SELECT id, name, email, "employeeId"
  FROM "User"
  WHERE "deletedAt" IS NULL
  ORDER BY "createdAt" ASC
  LIMIT 2
),
primary_user AS (
  SELECT id FROM selected_users ORDER BY id ASC LIMIT 1
),
secondary_user AS (
  SELECT id FROM selected_users ORDER BY id ASC OFFSET 1 LIMIT 1
)

-- 3) Attendance sample untuk user pertama
INSERT INTO attendance (
  id,
  user_id,
  attendance_date,
  check_in_at,
  check_out_at,
  attendance_status,
  source,
  notes
)
SELECT
  gen_random_uuid(),
  primary_user.id,
  DATE '2026-03-17',
  TIMESTAMPTZ '2026-03-17 08:55:00+08',
  TIMESTAMPTZ '2026-03-17 17:05:00+08',
  'present',
  'web',
  'Seeded attendance sample'
FROM primary_user
ON CONFLICT (user_id, attendance_date) DO NOTHING;

-- 4) Overtime sample untuk user pertama
WITH primary_user AS (
  SELECT id
  FROM "User"
  WHERE "deletedAt" IS NULL
  ORDER BY "createdAt" ASC
  LIMIT 1
)
INSERT INTO overtime_requests (
  id,
  request_no,
  user_id,
  overtime_date,
  start_time,
  end_time,
  duration_minutes,
  reason,
  status,
  approved_by_user_id,
  approved_at,
  rejection_reason
)
SELECT
  gen_random_uuid(),
  'OT-SEED-20260317-01',
  primary_user.id,
  DATE '2026-03-17',
  TIMESTAMPTZ '2026-03-17 18:00:00+08',
  TIMESTAMPTZ '2026-03-17 20:00:00+08',
  120,
  'Seeded overtime sample',
  'submitted',
  NULL,
  NULL,
  NULL
FROM primary_user
ON CONFLICT (request_no) DO NOTHING;

-- 5) Leave sample untuk user kedua bila tersedia
WITH secondary_user AS (
  SELECT id
  FROM "User"
  WHERE "deletedAt" IS NULL
  ORDER BY "createdAt" ASC
  OFFSET 1 LIMIT 1
)
INSERT INTO leave_requests (
  id,
  request_no,
  user_id,
  leave_type,
  start_date,
  end_date,
  total_days,
  reason,
  status,
  approved_by_user_id,
  approved_at,
  rejection_reason
)
SELECT
  gen_random_uuid(),
  'LV-SEED-20260318-01',
  secondary_user.id,
  'annual',
  DATE '2026-03-18',
  DATE '2026-03-18',
  1,
  'Seeded leave sample',
  'submitted',
  NULL,
  NULL,
  NULL
FROM secondary_user
ON CONFLICT (request_no) DO NOTHING;

-- 6) Approval log sample untuk record submit yang sudah diseed
WITH primary_user AS (
  SELECT id
  FROM "User"
  WHERE "deletedAt" IS NULL
  ORDER BY "createdAt" ASC
  LIMIT 1
), overtime_request AS (
  SELECT id
  FROM overtime_requests
  WHERE request_no = 'OT-SEED-20260317-01'
  LIMIT 1
)
INSERT INTO approval_logs (
  id,
  module_name,
  reference_id,
  action,
  actor_user_id,
  notes
)
SELECT
  gen_random_uuid(),
  'overtime',
  overtime_request.id,
  'submit',
  primary_user.id,
  'Seeded overtime submit log'
FROM primary_user, overtime_request
WHERE NOT EXISTS (
  SELECT 1
  FROM approval_logs l
  WHERE l.module_name = 'overtime'
    AND l.reference_id = overtime_request.id
    AND l.action = 'submit'
    AND l.actor_user_id = primary_user.id
);

COMMIT;

-- Query bantu verifikasi:
-- SELECT * FROM workdays ORDER BY work_date;
-- SELECT * FROM attendance ORDER BY attendance_date, user_id;
-- SELECT * FROM overtime_requests ORDER BY created_at DESC;
-- SELECT * FROM leave_requests ORDER BY created_at DESC;
-- SELECT * FROM approval_logs ORDER BY created_at DESC;
