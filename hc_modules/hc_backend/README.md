# HC Backend Modular Package (Blueprint Scope)

Lokasi ini berisi implementasi modular HC yang mengikuti blueprint:
- attendance
- overtime
- leave
- workday
- shared



## Struktur
- `src/server/modules/hc/*`: layer modular (`schema`, `service`, `repository`, `types`, `router`)
- `prisma/migrations/20260317_hc_core/migration.sql`: draft migration SQL HC core
- `prisma/seed-hc.sql`: seed minimal HC

## Catatan
Package ini ditempatkan di `hc_modules` agar tracking implementasi bisa fokus ke modul HC sesuai workflow dokumen blueprint/checklist.
