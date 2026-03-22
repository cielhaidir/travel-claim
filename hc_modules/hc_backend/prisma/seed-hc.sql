-- Seed minimal HC (scope aktif)
INSERT INTO hc_employees (employee_code, full_name, email, position, employment_status, join_date)
VALUES
  ('HC-EMP-0001', 'Demo Employee', 'demo.employee@example.com', 'Staff', 'permanent', '2026-01-02')
ON CONFLICT (employee_code) DO NOTHING;

INSERT INTO hc_workdays (work_date, is_workday, work_type, description)
VALUES
  ('2026-03-16', true, 'regular', 'Regular Monday'),
  ('2026-03-17', true, 'regular', 'Regular Tuesday'),
  ('2026-03-22', false, 'weekend', 'Sunday')
ON CONFLICT (work_date) DO NOTHING;
