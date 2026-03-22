# HC Backend Tests

Test di folder ini ditujukan untuk memvalidasi service layer modular HC tanpa wiring ke app utama.

## Cara menjalankan
Dari root project:

```bash
TSX_TSCONFIG_PATH=hc_modules/hc_backend/tsconfig.json node --import tsx --test hc_modules/hc_backend/tests/*.test.ts
```

## Cakupan awal
- `attendance.service.test.ts`
- `overtime.service.test.ts`
- `leave.service.test.ts`
- `workday.service.test.ts`

Semua test memakai mock repository/in-memory dan tidak menyentuh database ataupun app utama.
