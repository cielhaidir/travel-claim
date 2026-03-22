-- Seed minimal HC (scope aktif)
-- Catatan:
-- - Employee master source adalah tabel public."User"
-- - Seed ini sengaja hanya mengisi tabel HC yang berdiri sendiri.
-- - Data transaksi HC yang butuh user_id sebaiknya diinsert setelah memilih user existing dari database target.

INSERT INTO hc_workdays (work_date, is_workday, work_type, description)
VALUES
  ('2026-03-16', true, 'regular', 'Regular Monday'),
  ('2026-03-17', true, 'regular', 'Regular Tuesday'),
  ('2026-03-22', false, 'weekend', 'Sunday')
ON CONFLICT (work_date) DO NOTHING;

-- Contoh referensi untuk seed transaksi HC berbasis user existing:
-- SELECT id, name, email, "employeeId" FROM "User" WHERE "deletedAt" IS NULL ORDER BY "createdAt" ASC LIMIT 10;
