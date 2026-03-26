DO $$
DECLARE
  found_count INTEGER;
BEGIN
  SELECT count(*)
  INTO found_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN (
      'workdays',
      'attendance',
      'overtime_requests',
      'leave_requests',
      'approval_logs'
    );

  IF found_count <> 5 THEN
    RAISE EXCEPTION 'Expected 5 HC tables, found %', found_count;
  END IF;
END $$;
