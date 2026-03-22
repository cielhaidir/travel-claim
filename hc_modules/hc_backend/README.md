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

## Catatan Penting
- Employee master source adalah tabel existing `public."User"`
- Paket ini sengaja dibatasi di `hc_modules` dan belum di-wire ke app utama
- Semua kontrak internal HC aktif sudah diarahkan ke pola `userId/user_id`
- Approval metadata menggunakan `approvedByUserId/approved_by_user_id` dan `actorUserId/actor_user_id`
