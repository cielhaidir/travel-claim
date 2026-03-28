# Mapping COA Sales-Finance & Rencana Auto Journal

## Tujuan
Dokumen ini menjelaskan:
- akun COA yang diperlukan agar flow penjualan terhubung ke finance/accounting
- aturan jurnal otomatis untuk `Delivery Order` dan `Sales Invoice`
- tahapan implementasi yang aman dan bertahap

---

## Kondisi Saat Ini

### Sudah ada
Flow penjualan sudah terhubung ke inventory:
- `SalesQuotation` memvalidasi stok tersedia
- `DeliveryOrder` mengurangi stok inventory
- `DeliveryOrder RETURNED/CANCELED` mengembalikan stok
- `InventoryLedgerEntry` sudah tercatat

COA yang sudah tersedia dan relevan:
- `1150` — Persediaan Barang Dagang
- `1151` — Aset Sementara Inventory
- `5100` — Beban Pokok Penjualan

Sebagian `InventoryItem` juga sudah punya mapping:
- `inventoryCoaId`
- `cogsCoaId`

### Belum ada / belum lengkap
Flow sales standar belum membuat `JournalEntry` otomatis untuk:
- pengakuan COGS saat barang dikirim
- pengakuan piutang usaha saat invoice diterbitkan
- pengakuan pendapatan penjualan / jasa

COA yang belum tersedia secara eksplisit:
- Piutang Usaha
- Pendapatan Penjualan Barang
- Pendapatan Jasa
- opsional: PPN Keluaran

---

## Prinsip Akuntansi yang Dipakai

### Barang
1. Saat barang dikirim (`Delivery Order` status `DELIVERED`):
   - Dr Beban Pokok Penjualan
   - Cr Persediaan Barang Dagang

2. Saat invoice diterbitkan (`Sales Invoice` dibuat / status `SENT`):
   - Dr Piutang Usaha
   - Cr Pendapatan Penjualan Barang

### Jasa
Saat invoice diterbitkan:
- Dr Piutang Usaha
- Cr Pendapatan Jasa

### Mixed
- line barang ikut jurnal COGS saat delivery
- line jasa tidak mempengaruhi inventory
- saat invoice, revenue dipisah per line sesuai tipe item

---

## Usulan COA Minimum

### Aset
- `1150` — Persediaan Barang Dagang
- `1151` — Aset Sementara Inventory
- `1160` — Piutang Usaha

### Pendapatan
- `4100` — Pendapatan Penjualan Barang
- `4200` — Pendapatan Jasa

### Beban
- `5100` — Beban Pokok Penjualan

### Pajak (opsional tahap berikutnya)
- `2230` — Hutang PPN / PPN Keluaran

> Catatan: kode `1160`, `4100`, dan `4200` diusulkan agar konsisten dan mudah dibaca. Bila tim ingin struktur kode berbeda, implementasi tetap bisa mengikuti kode final dari finance.

---

## Mapping COA yang Disarankan

### Mapping level item
#### Untuk item barang / stock-tracked
Gunakan field yang sudah ada di `InventoryItem`:
- `inventoryCoaId` -> `1150` Persediaan Barang Dagang
- `cogsCoaId` -> `5100` Beban Pokok Penjualan

#### Untuk item jasa
Tidak perlu `inventoryCoaId` dan `cogsCoaId`.
Revenue akan ditentukan dari tipe item saat invoice.

### Mapping revenue
Ada 2 opsi:

#### Opsi A — Global mapping per tipe item
Tanpa ubah schema item:
- `HARDWARE` -> `4100` Pendapatan Penjualan Barang
- `SOFTWARE_LICENSE` -> `4200` Pendapatan Jasa
- `SERVICE` -> `4200` Pendapatan Jasa
- `MANAGED_SERVICE` -> `4200` Pendapatan Jasa

**Kelebihan:**
- implementasi paling cepat
- tidak perlu migrasi schema baru

**Kekurangan:**
- kurang fleksibel bila nanti ingin revenue account berbeda per kategori produk

#### Opsi B — Tambah field revenue COA di item
Tambahkan field baru di `InventoryItem`, misalnya:
- `salesRevenueCoaId`

**Kelebihan:**
- fleksibel per item / kategori
- siap untuk skala lebih besar

**Kekurangan:**
- perlu migration schema
- perlu update UI master inventory

### Rekomendasi
Mulai dengan **Opsi A** dulu agar implementasi cepat dan aman.
Nanti kalau dibutuhkan, upgrade ke Opsi B.

---

## Aturan Auto Journal

## 1. Auto Journal saat Delivery Order Delivered

### Trigger
Saat:
- `createDeliveryOrderFromSalesOrder` selesai membuat DO delivered
- atau `changeDeliveryOrderStatus` mengubah status ke `DELIVERED`

### Syarat posting
Hanya untuk line yang:
- punya `inventoryItemId`
- item `isStockTracked = true`
- item punya `inventoryCoaId`
- item punya `cogsCoaId`
- qty delivered > 0

### Nilai jurnal
Nilai menggunakan cost inventory:
- `standardCost`
- atau, bila nanti dikembangkan, cost dari batch/FIFO layer

### Jurnal
Header:
- `sourceType`: `MANUAL` sementara, atau tambah source type baru `SALES_DELIVERY`
- `sourceId`: `deliveryOrder.id`
- `description`: `COGS posting for DO-XXXX`
- `status`: `POSTED`

Lines:
- Dr `cogsCoaId`
- Cr `inventoryCoaId`

### Grup posting
Untuk efisiensi, line bisa digrup per kombinasi:
- `cogsCoaId`
- `inventoryCoaId`

### Idempotency
Harus dicek agar jurnal tidak dibuat dua kali.
Contoh guard:
- cari `JournalEntry` dengan `sourceId = deliveryOrder.id`
- deskripsi / metadata menandai `sales-cogs`

### Reversal
Jika DO:
- `RETURNED`
- `CANCELED`
- dihapus

maka buat reversal journal:
- Dr Persediaan Barang Dagang
- Cr Beban Pokok Penjualan

Atau minimum tahap awal:
- batasi reversal hanya jika jurnal belum dipakai proses lanjutan lain

---

## 2. Auto Journal saat Sales Invoice dibuat / dikirim

### Trigger
Saat:
- `createSalesInvoiceFromOrder`
- atau saat invoice berpindah ke status `SENT`

### Syarat posting
- invoice belum pernah punya jurnal revenue/AR
- total invoice > 0
- customer valid

### Mapping revenue per line
- `HARDWARE` -> `4100`
- `SERVICE` -> `4200`
- `SOFTWARE_LICENSE` -> `4200`
- `MANAGED_SERVICE` -> `4200`

### Jurnal
Header:
- `sourceType`: `MANUAL` sementara, atau tambah source type baru `SALES_INVOICE`
- `sourceId`: `salesInvoice.id`
- `description`: `AR posting for SINV-XXXX`
- `status`: `POSTED`

Lines:
- Dr `1160` Piutang Usaha = total invoice
- Cr akun revenue sesuai line item

### Mixed invoice
Jika invoice berisi campuran barang dan jasa:
- satu debit ke `1160`
- beberapa credit line:
  - `4100` untuk barang
  - `4200` untuk jasa

### Pajak
Saat ini `taxAmount` di flow sales masih `0`.
Jadi tahap awal jurnal cukup:
- Dr Piutang Usaha
- Cr Pendapatan

Jika nanti pajak sales diaktifkan:
- Dr Piutang Usaha = total termasuk pajak
- Cr Pendapatan = subtotal
- Cr PPN Keluaran = tax

### Idempotency
Harus dicek agar invoice yang sama tidak membuat jurnal ganda.
Guard:
- cek `JournalEntry` existing dengan `sourceId = salesInvoice.id`
- tandai jenis posting `sales-ar`

---

## 3. Pembayaran Customer (Tahap Berikutnya)
Belum termasuk implementasi awal, tapi target akhirnya:
- Dr Kas/Bank
- Cr Piutang Usaha

Ini butuh:
- model penerimaan pembayaran customer
- relasi ke `SalesInvoice`
- dukungan partial payment

---

## Rencana Implementasi Teknis

## Tahap 1 — Siapkan COA
1. Tambah COA berikut ke bootstrap accounting:
   - `1160` Piutang Usaha
   - `4100` Pendapatan Penjualan Barang
   - `4200` Pendapatan Jasa
2. Update seed / bootstrap agar akun tersedia di semua environment

## Tahap 2 — Helper mapping sales accounting
Tambahkan helper, misalnya di:
- `src/lib/accounting/sales.ts`

Isi helper:
- `getSalesReceivableCoa(tx)`
- `getRevenueCoaByItemType(tx, itemType)`
- `buildSalesCogsJournalLines(...)`
- `buildSalesInvoiceJournalLines(...)`

## Tahap 3 — Auto COGS journal untuk Delivery Order
Di `src/server/api/routers/business.ts`:
- setelah `applyDeliveryInventoryIssue(...)`
- buat helper `postDeliveryCogsJournal(...)`

Dipanggil dari:
- `createDeliveryOrderFromSalesOrder`
- `changeDeliveryOrderStatus` saat `DELIVERED`

## Tahap 4 — Auto AR/Revenue journal untuk Sales Invoice
Di `src/server/api/routers/business.ts`:
- setelah `salesInvoice.create(...)`
- buat helper `postSalesInvoiceJournal(...)`

Dipanggil dari:
- `createSalesInvoiceFromOrder`
- opsional guard tambahan di `changeSalesInvoiceStatus` saat `SENT`

## Tahap 5 — Reversal handling
Tambahkan reversal journal saat:
- DO `RETURNED`
- DO `CANCELED`
- DO dihapus

Tahap awal bisa fokus dulu ke:
- create posting saat DO delivered
- create posting saat invoice dibuat

Reversal bisa jadi fase kedua bila ingin rollout lebih aman.

---

## Rencana Perubahan File

### Akan diubah
- `src/lib/accounting/bootstrap.ts`
  - tambah COA sales-finance minimum

- `src/server/api/routers/business.ts`
  - tambah helper posting jurnal COGS sales
  - tambah helper posting jurnal AR/revenue sales
  - panggil helper dari flow DO + Sales Invoice

### Opsional file baru
- `src/lib/accounting/sales.ts`
  - helper mapping akun dan builder journal lines sales

---

## Guardrails Implementasi

### 1. Jangan buat jurnal ganda
Setiap source dokumen hanya boleh punya 1 jurnal untuk tipe posting yang sama.

### 2. Jangan posting jika mapping akun belum lengkap
Jika item barang belum punya:
- `inventoryCoaId`
- `cogsCoaId`

maka transaksi harus gagal dengan pesan jelas, atau diskip secara eksplisit sesuai kebijakan.

### 3. Jurnal harus balanced
Total debit = total kredit.
Gunakan helper validasi yang sudah dipakai pada modul finance.

### 4. Gunakan transaction yang sama
Posting jurnal harus terjadi dalam transaction yang sama dengan dokumen bisnis agar konsisten.

---

## Keputusan yang Direkomendasikan
Untuk implementasi awal yang paling aman:
- tambah COA `1160`, `4100`, `4200`
- pakai mapping revenue global berdasarkan `InventoryItemType`
- auto post:
  - COGS saat `Delivery Order DELIVERED`
  - AR + Revenue saat `Sales Invoice` dibuat
- tunda dulu:
  - payment receipt customer
  - tax output posting
  - revenue mapping per item
  - reversal journal kompleks

---

## Output yang Diharapkan Setelah Implementasi

### Saat barang dikirim
- stok berkurang
- inventory ledger tercatat
- jurnal COGS tercatat

### Saat invoice dibuat
- invoice customer tercatat
- jurnal AR + Revenue tercatat

Dengan begitu flow sales menjadi benar-benar terhubung ke:
- inventory
- accounting / finance
- laporan keuangan
