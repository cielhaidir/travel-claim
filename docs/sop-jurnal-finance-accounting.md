# SOP Penggunaan Halaman Jurnal untuk Tim Finance dan Accounting

## 1. Tujuan

Dokumen ini menjadi panduan operasional bagi tim **Finance** dan **Accounting** dalam menggunakan halaman **`/journal`** untuk:

- meninjau jurnal transaksi
- memfilter jurnal berdasarkan status dan sumber
- memahami makna jurnal yang tampil
- memastikan pencatatan transaksi sesuai flow akuntansi perusahaan

---

## 2. Ruang Lingkup

SOP ini berlaku untuk aktivitas berikut:

- review jurnal hasil transaksi claim
- review jurnal hasil pencairan bailout
- review jurnal hasil settlement bailout
- review jurnal funding / saldo awal
- review jurnal penyesuaian dan jurnal manual

---

## 3. Pengguna yang Terkait

### Tim Finance
Berfokus pada transaksi operasional:
- pembayaran claim
- pencairan bailout
- settlement bailout
- pengecekan referensi pembayaran

### Tim Accounting
Berfokus pada kontrol pembukuan:
- validasi akun debit/kredit
- review jurnal posted
- analisis histori jurnal
- kebutuhan audit dan pelaporan

---

## 4. Akses Halaman

Buka menu:
- **Jurnal**

Atau akses langsung:
- **`/journal`**

Di halaman ini user dapat melihat daftar jurnal beserta:
- nomor jurnal
- tanggal transaksi
- deskripsi
- sumber jurnal
- status jurnal
- rincian line debit dan kredit

---

## 5. Definisi Filter pada Halaman Jurnal

### 5.1 Filter Status

Filter status digunakan untuk menyaring jurnal berdasarkan **kondisi pencatatannya**.

#### A. `DRAFT`
**Definisi:**
Jurnal masih berupa rancangan dan belum diposting secara resmi.

**Makna operasional:**
- masih dalam tahap review
- belum final
- belum menjadi dasar pembukuan resmi

**Tindakan user:**
- cek kelengkapan line jurnal
- cek akun debit dan kredit
- pastikan nominal seimbang
- lakukan posting jika sudah valid

---

#### B. `POSTED`
**Definisi:**
Jurnal sudah diposting dan dianggap final.

**Makna operasional:**
- sah untuk pembukuan
- masuk ke ledger/laporan
- menjadi referensi audit

**Tindakan user:**
- gunakan untuk review transaksi final
- gunakan untuk rekonsiliasi
- gunakan untuk kebutuhan laporan akuntansi

---

#### C. `VOID`
**Definisi:**
Jurnal dibatalkan tetapi tetap disimpan dalam sistem.

**Makna operasional:**
- jurnal tidak lagi berlaku sebagai transaksi aktif
- histori tetap tersedia untuk audit

**Tindakan user:**
- cek alasan pembatalan
- gunakan saat investigasi kesalahan posting
- jangan jadikan dasar transaksi aktif

---

### 5.2 Filter Sumber

Filter sumber digunakan untuk menyaring jurnal berdasarkan **asal proses bisnis**.

#### A. `CLAIM`
**Definisi:**
Jurnal berasal dari pembayaran claim karyawan.

**Pola jurnal standar:**
- Debit → akun beban
- Kredit → kas/bank

**Contoh:**
- Debit `Accommodation`
- Kredit `Bank Operasional`

**Tujuan review:**
- memastikan biaya masuk ke akun beban yang benar
- memastikan sumber pembayaran berasal dari akun kas/bank yang sesuai

---

#### B. `BAILOUT`
**Definisi:**
Jurnal berasal dari pencairan bailout.

**Pola jurnal standar:**
- Debit → `Uang Muka Perjalanan`
- Kredit → kas/bank

**Makna penting:**
Bailout **bukan langsung beban**, tetapi dicatat sebagai uang muka sampai dilakukan settlement.

**Tujuan review:**
- memastikan bailout tidak salah dibebankan langsung ke expense
- memastikan lawan akun kas/bank sesuai

---

#### C. `SETTLEMENT`
**Definisi:**
Jurnal berasal dari penyelesaian bailout.

**Pola jurnal standar:**
- Debit → akun beban
- Kredit → `Uang Muka Perjalanan`

**Tujuan review:**
- memastikan uang muka ditutup dengan benar
- memastikan biaya aktual masuk ke akun expense yang tepat

---

#### D. `FUNDING`
**Definisi:**
Jurnal berasal dari pembentukan saldo, modal awal, atau transfer dana internal.

**Contoh pola jurnal:**
- Debit `Bank Operasional` / Kredit `Saldo Awal`
- Debit `Kas Kecil` / Kredit `Bank Operasional`

**Tujuan review:**
- memastikan saldo awal sesuai
- memastikan perpindahan dana internal tercatat benar

---

#### E. `ADJUSTMENT`
**Definisi:**
Jurnal berasal dari penyesuaian atau koreksi akuntansi.

**Tujuan review:**
- memastikan dasar koreksi jelas
- memastikan akun asal dan akun tujuan sudah benar
- memastikan adjustment memiliki dokumentasi yang memadai

---

#### F. `MANUAL`
**Definisi:**
Jurnal dibuat manual oleh user accounting.

**Tujuan review:**
- memastikan jurnal manual memang diperlukan
- memastikan total debit = total kredit
- memastikan ada dasar dan keterangan yang memadai

---

## 6. Prosedur Penggunaan Halaman Jurnal

### 6.1 Review Jurnal Berdasarkan Status

#### Untuk melihat jurnal final
1. Buka halaman **Jurnal**
2. Pilih **Filter Status = `POSTED`**
3. Tinjau nomor jurnal, tanggal, deskripsi, dan line debit/kredit
4. Gunakan hasil ini untuk pembukuan dan audit internal

#### Untuk melihat jurnal yang belum final
1. Buka halaman **Jurnal**
2. Pilih **Filter Status = `DRAFT`**
3. Review line jurnal satu per satu
4. Pastikan akun, nominal, dan deskripsi sudah benar sebelum diposting

#### Untuk melihat jurnal yang dibatalkan
1. Buka halaman **Jurnal**
2. Pilih **Filter Status = `VOID`**
3. Tinjau histori jurnal dan alasan pembatalannya

---

### 6.2 Review Jurnal Berdasarkan Sumber

#### Review jurnal claim
1. Pilih **Filter Sumber = `CLAIM`**
2. Pastikan:
   - debit ke akun beban
   - kredit ke kas/bank
   - referensi pembayaran sesuai

#### Review jurnal bailout
1. Pilih **Filter Sumber = `BAILOUT`**
2. Pastikan:
   - debit ke `Uang Muka Perjalanan`
   - kredit ke kas/bank
   - tidak langsung masuk beban

#### Review jurnal settlement
1. Pilih **Filter Sumber = `SETTLEMENT`**
2. Pastikan:
   - debit ke akun beban
   - kredit ke `Uang Muka Perjalanan`
   - nominal sesuai dengan pertanggungjawaban biaya

#### Review jurnal funding
1. Pilih **Filter Sumber = `FUNDING`**
2. Pastikan:
   - akun saldo awal/transaksi internal sesuai
   - perpindahan saldo tercatat benar

---

## 7. Kombinasi Filter yang Disarankan

### A. Untuk Finance
#### Melihat semua transaksi operasional yang sudah final
- **Status:** `POSTED`
- **Sumber:** `CLAIM`, `BAILOUT`, atau `SETTLEMENT`

#### Tujuan:
- memastikan transaksi telah berhasil diposting
- mencocokkan transaksi dengan bukti pembayaran

---

### B. Untuk Accounting
#### Melihat seluruh jurnal resmi
- **Status:** `POSTED`
- **Sumber:** semua / sesuai kebutuhan

#### Tujuan:
- review pembukuan final
- rekonsiliasi internal
- dasar laporan akuntansi

---

### C. Untuk Audit Internal
#### Melihat jurnal yang dibatalkan
- **Status:** `VOID`

#### Tujuan:
- investigasi kesalahan
- kontrol kepatuhan proses

---

## 8. Standar Validasi Jurnal

Saat meninjau jurnal, user wajib memastikan:

1. **Nomor jurnal tersedia dan jelas**
2. **Tanggal transaksi sesuai kejadian bisnis**
3. **Deskripsi jurnal mudah dipahami**
4. **Sumber jurnal sesuai proses bisnis**
5. **Total debit = total kredit**
6. **Akun yang digunakan sesuai klasifikasi akuntansi**
7. **Referensi pembayaran/dokumen pendukung tersedia bila diperlukan**

---

## 9. Aturan Khusus dalam Sistem Saat Ini

### Claim
- harus menggunakan akun beban sebagai akun utama
- akun lawan harus kas/bank

### Bailout
- dicatat sebagai uang muka perjalanan
- tidak boleh langsung dibebankan saat pencairan

### Settlement Bailout
- digunakan untuk memindahkan uang muka menjadi beban aktual

### Funding
- digunakan untuk saldo awal atau perpindahan dana internal

---

## 10. Contoh Pembacaan Jurnal

### Contoh 1 — Claim
**Sumber:** `CLAIM`

Jika jurnal menunjukkan:
- Debit `Accommodation` Rp1.250.000
- Kredit `Bank Operasional` Rp1.250.000

Maka artinya:
- perusahaan mengakui biaya hotel
- pembayaran dilakukan dari rekening operasional

---

### Contoh 2 — Bailout
**Sumber:** `BAILOUT`

Jika jurnal menunjukkan:
- Debit `Uang Muka Perjalanan` Rp2.500.000
- Kredit `Bank Operasional` Rp2.500.000

Maka artinya:
- perusahaan mencairkan uang muka perjalanan
- biaya belum diakui sebagai beban

---

### Contoh 3 — Settlement
**Sumber:** `SETTLEMENT`

Jika jurnal menunjukkan:
- Debit `Accommodation` Rp2.500.000
- Kredit `Uang Muka Perjalanan` Rp2.500.000

Maka artinya:
- biaya aktual diakui
- uang muka perjalanan ditutup

---

## 11. Tanggung Jawab

### Tim Finance
Bertanggung jawab untuk:
- memastikan transaksi operasional diproses dengan benar
- memastikan referensi pembayaran tersedia
- memastikan source transaksi sesuai flow bisnis

### Tim Accounting
Bertanggung jawab untuk:
- memastikan struktur debit/kredit benar
- memastikan akun yang dipakai sesuai COA
- memastikan jurnal final layak menjadi dasar laporan

---

## 12. Kesimpulan

Halaman **`/journal`** berfungsi sebagai pusat review jurnal akuntansi.

Dua filter utamanya memiliki fungsi berikut:
- **Filter Status** → melihat kondisi jurnal (`DRAFT`, `POSTED`, `VOID`)
- **Filter Sumber** → melihat asal jurnal (`CLAIM`, `BAILOUT`, `SETTLEMENT`, `FUNDING`, `ADJUSTMENT`, `MANUAL`)

Dengan memahami kedua filter ini, tim Finance dan Accounting dapat:
- mempercepat review transaksi
- mengurangi salah baca jurnal
- memastikan akuntansi operasional berjalan lebih tertib
- mempermudah audit dan pelaporan
