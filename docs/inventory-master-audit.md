# Inventory Master Audit

Dokumen ini menjelaskan cara menjalankan audit cepat untuk memastikan master item inventory tetap bersih, konsisten, dan siap dipakai oleh modul inventory, pembelian, penjualan, serta finance.

## Tujuan Audit
Audit ini membantu mendeteksi:
- item aktif dengan aturan accounting / classification yang salah
- item non-stock yang masih dianggap stock-tracked
- item stock-tracked tanpa `standardCost`, COA persediaan, atau COA COGS
- item aktif yang sebenarnya legacy / tidak pernah dipakai
- item nonaktif yang masih direferensikan dokumen
- balance yang masih menunjuk ke item / warehouse nonaktif
- mismatch antara `itemType` dan `usageType`

## Cara Menjalankan

### Opsi 1 — CLI TypeScript
Jalankan:

```bash
npm run audit:inventory-master
```

Output akan ditampilkan dengan `console.table` agar lebih mudah dibaca.

### Opsi 2 — SQL langsung
Jalankan:

```bash
psql "$DATABASE_URL" -f scripts/inventory-master-audit.sql
```

SQL version cocok jika ingin audit langsung dari database tanpa runtime TypeScript.

## File Audit
- `scripts/audit-inventory-master.ts`
- `scripts/inventory-master-audit.sql`

## Interpretasi Hasil

### 1. Active item master with suspicious accounting / classification
Jika ada row di section ini, berarti ada item aktif yang melanggar aturan penting.

Contoh masalah:
- item `SERVICE` tetapi `isStockTracked = true`
- item service punya COA inventory / COGS
- item stock-tracked tanpa `standardCost`
- item stock-tracked tanpa `inventoryCoaId` atau `cogsCoaId`

### 2. Warehouse / item consistency
Jika ada row di sini, berarti masih ada balance yang menunjuk ke:
- item nonaktif / deleted
- warehouse nonaktif / deleted

Jika qty sudah `0`, biasanya ini tinggal residu historis dan bisa dijadwalkan untuk housekeeping.

### 3. Legacy / unused active items
Item aktif yang:
- tidak dipakai dokumen purchase / sales
- tidak punya balance
- tidak punya ledger
- tidak punya unit / batch history

Biasanya kandidat untuk diarsipkan.

### 4. Item type vs usage type mismatch
Contoh kandidat mismatch:
- `HARDWARE` dengan `usageType = OPERATIONAL` tetapi masih membawa COA / pola item penjualan
- non-stock item dengan usage type selain `SALE`

Section ini membantu review kebijakan master data.

### 5. Inactive inventory items still referenced by documents
Jika ada row di sini, item nonaktif masih dipakai dokumen historis.
Ini tidak selalu salah, tetapi perlu dipahami sebelum menghapus / membersihkan data lebih lanjut.

## Validasi yang Sudah Diterapkan di API
Inventory API sekarang sudah menolak kondisi berikut:

### Item non-stock
Untuk tipe:
- `SERVICE`
- `SOFTWARE_LICENSE`
- `MANAGED_SERVICE`

Aturan:
- tidak boleh `isStockTracked = true`
- tidak boleh punya `inventoryCoaId`
- tidak boleh punya `temporaryAssetCoaId`
- tidak boleh punya `cogsCoaId`
- harus memakai `usageType = SALE`

### Item stock-tracked
Aturan:
- wajib punya `standardCost > 0`
- wajib punya `inventoryCoaId`
- wajib punya `cogsCoaId`

### Validasi tipe COA
- COA inventory harus bertipe `ASSET`
- COA temporary asset harus bertipe `ASSET`
- COA COGS harus bertipe `EXPENSE`

## Saran Operasional
- jalankan audit setelah seed / bulk import item
- jalankan audit sebelum go-live perubahan besar master inventory
- jalankan audit setelah cleanup item nonaktif / legacy
- simpan hasil audit saat ditemukan anomaly agar ada jejak review

## Checklist Tindak Lanjut Jika Audit Menemukan Masalah
- cek apakah item masih dipakai dokumen aktif
- cek apakah item punya stock balance atau movement history
- jika item salah klasifikasi, perbaiki `itemType`, `usageType`, `isStockTracked`, dan COA
- jika item tidak dipakai sama sekali, pertimbangkan nonaktifkan / archive
- jika item nonaktif masih punya balance nol historis, jadwalkan housekeeping terpisah
