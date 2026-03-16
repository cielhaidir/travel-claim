# Blueprint Akuntansi yang Benar

Dokumen ini menjelaskan arah desain akuntansi yang lebih benar untuk project travel-claim.

## Masalah desain saat ini

Model saat ini masih bertumpu pada `JournalTransaction` satu baris per transaksi. Ini cukup untuk pelacakan operasional, tetapi belum memenuhi prinsip akuntansi double-entry secara penuh.

Keterbatasan utama:
- satu transaksi belum memiliki pasangan debit dan kredit yang eksplisit
- belum ada validasi total debit = total kredit
- bailout masih cenderung diperlakukan sebagai beban langsung
- belum ada pemisahan header jurnal dan detail jurnal

## Desain target

### Entitas utama

1. `ChartOfAccount`
   - inti buku besar / klasifikasi akun
   - mencakup aset, liabilitas, ekuitas, pendapatan, beban

2. `BalanceAccount`
   - akun saldo operasional, misalnya kas kecil atau rekening bank
   - dipakai sebagai metadata sumber dana / kantong dana
   - bukan inti pembukuan formal

3. `JournalEntry`
   - header jurnal
   - satu dokumen jurnal per kejadian akuntansi

4. `JournalEntryLine`
   - detail jurnal
   - minimal 2 baris: debit dan kredit

## Model yang ditambahkan

### `JournalSourceType`
Jenis sumber transaksi:
- `CLAIM`
- `BAILOUT`
- `ADJUSTMENT`
- `FUNDING`
- `MANUAL`
- `SETTLEMENT`

### `JournalStatus`
Status jurnal:
- `DRAFT`
- `POSTED`
- `VOID`

### `JournalEntry`
Mewakili header jurnal, berisi:
- nomor jurnal
- tanggal transaksi
- deskripsi
- sumber dokumen
- status
- pembuat jurnal
- pemosting jurnal

### `JournalEntryLine`
Mewakili detail jurnal, berisi:
- referensi ke header jurnal
- bagan akun
- akun saldo opsional
- nilai debit
- nilai kredit
- nomor urut baris

## Aturan bisnis utama

### 1. Double-entry wajib
Setiap jurnal harus memiliki:
- minimal 2 baris
- total debit = total kredit

### 2. Hanya satu sisi per baris
Setiap `JournalEntryLine` harus memenuhi salah satu:
- debit > 0 dan credit = 0
- credit > 0 dan debit = 0

### 3. Bagan Akun adalah inti akuntansi
Semua pembukuan formal harus mengarah ke `ChartOfAccount`.

### 4. Akun Saldo adalah pelengkap operasional
`BalanceAccount` dipakai untuk menandai sumber atau dompet dana yang dipakai, terutama pada akun kas/bank.

## Contoh pencatatan yang benar

### Pembayaran klaim
Misal klaim Rp1.000.000 dibayar dari rekening operasional.

Header:
- sumber: `CLAIM`
- status: `POSTED`

Detail:
1. Debit `Beban Perjalanan` Rp1.000.000
2. Kredit `Bank Operasional` Rp1.000.000

### Pencairan bailout
Misal bailout adalah uang muka perjalanan Rp2.000.000.

Saat pencairan:
1. Debit `Uang Muka Perjalanan` Rp2.000.000
2. Kredit `Bank Operasional` Rp2.000.000

Saat settlement biaya:
1. Debit `Beban Perjalanan` Rp2.000.000
2. Kredit `Uang Muka Perjalanan` Rp2.000.000

## Strategi migrasi

### Tahap 1
Tambahkan model baru tanpa menghapus `JournalTransaction` lama.

### Tahap 2
Semua flow baru menggunakan:
- `JournalEntry`
- `JournalEntryLine`

### Tahap 3
`JournalTransaction` lama diposisikan sebagai legacy data.

### Tahap 4
Tambahkan laporan akuntansi:
- buku besar
- trial balance
- mutasi akun
- rekap jurnal

## Implementasi teknis berikutnya

Langkah yang direkomendasikan:
1. buat migration Prisma untuk model baru
2. generate Prisma client baru
3. buat service/helper validasi jurnal seimbang
4. buat router tRPC baru untuk posting jurnal
5. ubah flow claim dan bailout agar membuat jurnal double-entry
6. tambahkan UI jurnal detail (header + lines)

## Catatan penting

Model baru tidak langsung menghapus sistem lama. Ini sengaja agar migrasi aman dan bertahap.
