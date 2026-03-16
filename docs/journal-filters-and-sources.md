# Penjelasan Filter Status dan Filter Sumber pada Halaman Jurnal

Dokumen ini menjelaskan fungsi filter pada halaman **`/journal`**, khususnya:

- **Filter Status**
- **Filter Sumber**

Selain itu, dokumen ini juga menjelaskan pola **debit/kredit** untuk setiap sumber jurnal yang saat ini digunakan di sistem.

---

## 1. Filter Status

Filter status dipakai untuk melihat **kondisi jurnal** di dalam siklus pencatatan akuntansi.

### Opsi status

#### `DRAFT`
Jurnal masih berupa rancangan dan belum diposting secara resmi.

**Makna bisnis:**
- jurnal sudah dibuat
- masih menunggu review
- belum dianggap final dalam pembukuan

**Penggunaan:**
- pengecekan line debit/kredit
- validasi akun sebelum posting
- review internal finance/accounting

---

#### `POSTED`
Jurnal sudah diposting secara resmi dan dianggap final.

**Makna bisnis:**
- jurnal sah untuk pembukuan
- transaksi sudah masuk ledger
- siap dipakai untuk audit dan laporan

**Penggunaan:**
- laporan keuangan
- buku besar
- neraca saldo
- audit trail

---

#### `VOID`
Jurnal dibatalkan, tetapi tetap disimpan untuk histori.

**Makna bisnis:**
- jurnal pernah dibuat
- lalu dinyatakan tidak berlaku
- tetap disimpan untuk jejak audit

**Penggunaan:**
- melihat jurnal yang dibatalkan
- investigasi kesalahan posting
- kontrol audit internal

---

## 2. Filter Sumber

Filter sumber dipakai untuk melihat **asal jurnal dibuat dari proses bisnis apa**.

Jadi:
- **Status** menjawab: *jurnal ini kondisinya apa?*
- **Sumber** menjawab: *jurnal ini berasal dari transaksi apa?*

### Opsi sumber

#### `CLAIM`
Jurnal berasal dari **pembayaran claim**.

**Pola jurnal:**
- **Debit** → akun beban
- **Kredit** → kas/bank

**Contoh:**
- Debit `6130 Accommodation`
- Kredit `1120 Bank Operasional`

**Makna:**
Perusahaan mengakui biaya dan mengeluarkan dana dari kas/bank.

---

#### `BAILOUT`
Jurnal berasal dari **pencairan bailout**.

Di sistem ini, bailout dicatat sebagai **uang muka perjalanan**, bukan langsung beban.

**Pola jurnal:**
- **Debit** → `1130 Uang Muka Perjalanan`
- **Kredit** → kas/bank

**Contoh:**
- Debit `1130 Uang Muka Perjalanan`
- Kredit `1120 Bank Operasional`

**Makna:**
Dana sudah keluar, tetapi masih dianggap uang muka, belum beban final.

---

#### `SETTLEMENT`
Jurnal berasal dari **settlement bailout**.

Settlement berarti uang muka yang sebelumnya diberikan sekarang dipertanggungjawabkan dan diakui sebagai beban.

**Pola jurnal:**
- **Debit** → akun beban
- **Kredit** → `1130 Uang Muka Perjalanan`

**Contoh:**
- Debit `6130 Accommodation`
- Kredit `1130 Uang Muka Perjalanan`

**Makna:**
Beban aktual diakui dan saldo uang muka ditutup.

---

#### `FUNDING`
Jurnal berasal dari **pendanaan**, **saldo awal**, atau **transfer dana internal**.

**Contoh pola jurnal:**

**Saldo awal rekening operasional**
- Debit `1120 Bank Operasional`
- Kredit `3100 Saldo Awal`

**Pembentukan kas kecil**
- Debit `1110 Kas Kecil`
- Kredit `1120 Bank Operasional`

**Makna:**
Jurnal ini dipakai untuk membentuk saldo atau memindahkan dana, bukan untuk pengakuan beban.

---

#### `ADJUSTMENT`
Jurnal berasal dari **penyesuaian** atau **koreksi akuntansi**.

**Contoh penggunaan:**
- koreksi salah akun
- reklasifikasi beban
- penyesuaian saldo

**Contoh pola jurnal:**
- Debit akun yang benar
- Kredit akun yang sebelumnya salah

**Makna:**
Dipakai untuk pembetulan atau penyesuaian pencatatan.

---

#### `MANUAL`
Jurnal dibuat **secara manual** oleh user accounting.

**Contoh penggunaan:**
- jurnal umum manual
- pencatatan transaksi di luar flow otomatis
- koreksi manual

**Pola jurnal:**
- fleksibel
- tetap harus memenuhi aturan: **total debit = total kredit**

---

## 3. Ringkasan Tabel Debit/Kredit per Sumber

| Sumber | Makna | Debit | Kredit |
|---|---|---|---|
| `CLAIM` | Pembayaran claim | Beban | Kas/Bank |
| `BAILOUT` | Pencairan uang muka | Uang Muka Perjalanan | Kas/Bank |
| `SETTLEMENT` | Penyelesaian uang muka | Beban | Uang Muka Perjalanan |
| `FUNDING` | Saldo awal / transfer dana | Aset tujuan | Ekuitas / aset asal |
| `ADJUSTMENT` | Koreksi / penyesuaian | Tergantung kasus | Tergantung kasus |
| `MANUAL` | Jurnal manual | Fleksibel | Fleksibel |

---

## 4. Contoh Kombinasi Filter

### A. Melihat semua jurnal final pembayaran claim
- **Status:** `POSTED`
- **Sumber:** `CLAIM`

Hasil:
- hanya jurnal claim yang sudah final

---

### B. Melihat semua settlement bailout yang sudah sah
- **Status:** `POSTED`
- **Sumber:** `SETTLEMENT`

Hasil:
- hanya jurnal settlement bailout yang sudah diposting

---

### C. Melihat semua jurnal draft manual
- **Status:** `DRAFT`
- **Sumber:** `MANUAL`

Hasil:
- hanya jurnal manual yang belum diposting

---

### D. Melihat jurnal saldo awal atau pendanaan
- **Sumber:** `FUNDING`

Hasil:
- jurnal modal awal
- jurnal pembentukan kas kecil
- jurnal transfer dana internal

---

## 5. Hubungan dengan Flow Sistem Saat Ini

### Claim
Saat claim dibayar:
- **Debit** beban
- **Kredit** kas/bank
- **Sumber jurnal:** `CLAIM`

---

### Bailout
Saat bailout dicairkan:
- **Debit** uang muka perjalanan
- **Kredit** kas/bank
- **Sumber jurnal:** `BAILOUT`

---

### Settlement Bailout
Saat bailout disettle:
- **Debit** beban
- **Kredit** uang muka perjalanan
- **Sumber jurnal:** `SETTLEMENT`

---

## 6. Inti Sederhana

### Filter Status
Menjawab pertanyaan:
**“Jurnal ini sedang dalam kondisi apa?”**

- `DRAFT`
- `POSTED`
- `VOID`

### Filter Sumber
Menjawab pertanyaan:
**“Jurnal ini berasal dari proses bisnis apa?”**

- `CLAIM`
- `BAILOUT`
- `SETTLEMENT`
- `FUNDING`
- `ADJUSTMENT`
- `MANUAL`

---

## 7. Kesimpulan

Dengan dua filter ini, user dapat:
- membedakan jurnal final vs belum final
- membedakan jurnal berdasarkan asal transaksi
- mempermudah review finance
- mempermudah kontrol accounting
- mempermudah audit dan pelacakan transaksi
