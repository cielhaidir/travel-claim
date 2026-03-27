# CRM General Task Plan

## Tujuan

Dokumen ini mengganti scope CRM sebelumnya menjadi lebih kecil, lebih sederhana, dan lebih mudah dieksekusi bertahap.

Fokus CRM V1 bukan lagi "semua modul CRM umum", tetapi hanya alur inti yang paling sering dipakai:

- customer master
- lead funnel
- deal pipeline
- follow up sederhana di dalam detail deal
- dashboard ringkas

Dokumen ini menjadi acuan produk dan backlog tingkat tinggi. Detail teknis implementasi ada di `docs/crm-implementation-plan.md`.

## Scope V1 Yang Dikunci

- Modul aktif V1 hanya:
  - `CRM Dashboard`
  - `Customers`
  - `Leads`
  - `Deals`
- `Contacts` tetap ada, tetapi hanya sebagai sub-section di detail customer.
- Tidak ada modul `Communication` sebagai menu terpisah.
- Tidak ada fitur `chat thread`.
- Follow up dicatat langsung di dalam detail deal sebagai note / timeline item sederhana.
- `Leads` dan `Deals` tetap memakai `kanban`.
- Modul lain tampil `list` atau `detail section` bila memang dibutuhkan.
- Semua data tetap `permission-aware`, konsisten lintas modul, dan tercatat di audit log.

## Scope Yang Dikeluarkan Dari V1

Hal-hal di bawah ini tidak dikerjakan di fase sekarang:

- chat / conversation / message module
- global activities module sebagai menu utama
- products / services
- sales orders
- support tickets
- marketing automation
- reports lanjutan
- CRM settings yang kompleks
- email / WhatsApp / telephony integration
- calendar sync
- quotation builder
- invoice / payment flow

## Route Target Yang Dipertahankan

Route CRM untuk V1 dipersempit menjadi:

- `/crm`
- `/crm/customers`
- `/crm/customers/[id]`
- `/crm/leads`
- `/crm/leads/[id]`
- `/crm/deals`
- `/crm/deals/[id]`

Route lain di area CRM dianggap di luar scope aktif dan sebaiknya tidak dipertahankan sebagai placeholder.

## Keputusan UI Utama

| Area | Tampilan Utama | Catatan |
| --- | --- | --- |
| Dashboard | Summary cards + short lists | Bukan kanban |
| Customers | List / table | Detail customer punya contacts, leads, deals |
| Leads | Kanban | Fokus funnel awal |
| Deals | Kanban | Fokus pipeline closing |
| Deal Detail | Detail page + note timeline | Tempat follow up sederhana |

## Keputusan Kanban

### Primary Direction

Kanban V1 direncanakan memakai `@syncfusion/ej2-react-kanban`.

Alasan memilih ini:

- sudah punya struktur board yang matang
- drag and drop stage lebih cepat dibangun
- kolom dan event bisa dikontrol
- card bisa dibuat custom melalui template / wrapper component
- lebih cocok untuk kebutuhan board operasional daripada membangun dari nol terlalu cepat

### Requirement Sebelum Dipakai

Sebelum implementasi final, harus ada validasi kecil untuk:

- kompatibilitas dengan Next.js di project ini
- cara load stylesheet Syncfusion
- event drag/drop untuk update stage via mutation
- kemampuan render custom card penuh
- perilaku saat data kosong dan saat board banyak item

### Fallback Bila Ada Blocker

Kalau ternyata ada blocker nyata seperti:

- masalah styling global
- beban bundle tidak masuk akal
- lisensi / dependency policy tidak cocok
- SSR / hydration issue yang sulit dibersihkan

maka board diganti ke implementasi manual yang tetap mendukung:

- custom card component penuh
- drag and drop
- column config terpusat
- mutation stage yang tetap bersih

## Requirement Custom Card Kanban

Card di board wajib bisa dikustomisasi.

Artinya:

- card tidak boleh bergantung ke template default yang kaku
- tampilan card untuk `Lead` dan `Deal` harus dibuat dari component React milik project
- field yang bisa tampil minimal:
  - title / company
  - PIC / owner
  - value
  - probability
  - source
  - target close date
  - badge priority atau badge stage tambahan
- harus bisa ditambah quick action ringan bila nanti perlu

Secara implementasi, card sebaiknya dibungkus oleh abstraction internal, misalnya:

- `CrmKanbanBoard`
- `LeadKanbanCard`
- `DealKanbanCard`

Jadi walaupun engine board memakai Syncfusion, isi card tetap 100% dikontrol dari codebase sendiri.

## Entitas Data Minimum V1

V1 cukup memakai entitas minimum berikut:

- `CrmCustomer`
- `CrmContact`
- `CrmLead`
- `CrmDeal`
- `CrmDealNote` atau `CrmDealFollowUp`

Catatan:

- `CrmConversation`
- `CrmMessage`
- modul communication global

tidak lagi menjadi kebutuhan V1.

## Flow Bisnis V1

Flow yang dipakai dipersempit menjadi:

1. User membuat atau memilih `Customer`.
2. User menambahkan `Lead`.
3. `Lead` dikelola di board kanban awal.
4. Jika lead cukup matang, lead dikonversi menjadi `Deal`.
5. `Deal` dikelola di board kanban sampai `Won`, `Lost`, atau `On Hold`.
6. Follow up sederhana dicatat di detail deal dalam bentuk note / timeline item, bukan chat.
7. Dashboard membaca summary customer, lead, deal, dan follow up penting.

## Stage Yang Dipakai

### Lead Stages

- `NEW`
- `QUALIFIED`

Lead board sengaja dibuat sangat pendek agar operasional awal sederhana.

### Deal Stages

- `DISCOVERY`
- `PROPOSAL`
- `NEGOTIATION`
- `VERBAL_WON`
- `WON`
- `LOST`
- `ON_HOLD`

## Modul dan Backlog Ringkas

### 1. CRM Dashboard

- [ ] Tampilkan total customer
- [ ] Tampilkan total open leads
- [ ] Tampilkan total active deals
- [ ] Tampilkan pipeline value
- [ ] Tampilkan daftar deal yang butuh follow up
- [ ] Tampilkan shortcut ke Customers, Leads, dan Deals

### 2. Customers

- [ ] Buat list customer dengan search, filter, sort, dan pagination
- [ ] Detail customer menampilkan:
  - profil customer
  - contacts
  - related leads
  - related deals
- [ ] Contacts dikelola hanya dari detail customer

### 3. Leads

- [ ] Buat board kanban `Leads`
- [ ] Kolom hanya `New` dan `Qualified`
- [ ] Drag and drop harus mengubah stage
- [ ] Lead qualified bisa dikonversi menjadi deal
- [ ] Detail lead menampilkan profil, relasi customer, dan deal hasil konversi

### 4. Deals

- [ ] Buat board kanban `Deals`
- [ ] Pakai stage default deal yang sudah dikunci
- [ ] Drag and drop harus mengubah stage
- [ ] Detail deal menampilkan informasi utama deal
- [ ] Detail deal menjadi pusat follow up sederhana

### 5. Deal Follow Up

- [ ] Tidak dibuat sebagai modul terpisah
- [ ] Disimpan di detail deal
- [ ] Bentuk awal cukup:
  - note
  - next follow up date
  - owner
  - created at
- [ ] Tampil sebagai timeline sederhana, bukan chat bubble
- [ ] Bisa dipakai untuk reminder dashboard

## Fase Produk Yang Disarankan

### Fase 0 - Scope Lock

- [ ] Kunci route aktif CRM
- [ ] Kunci modul yang keluar dari V1
- [ ] Kunci keputusan no-chat
- [ ] Kunci keputusan kanban engine

### Fase 1 - Foundation

- [ ] Rapikan schema minimum
- [ ] Rapikan router minimum
- [ ] Rapikan sidebar CRM
- [ ] Hapus placeholder route CRM yang tidak dipakai

### Fase 2 - Customers

- [ ] Customer list
- [ ] Customer detail
- [ ] Embedded contacts

### Fase 3 - Leads

- [ ] Lead kanban
- [ ] Lead detail
- [ ] Convert lead to deal

### Fase 4 - Deals

- [ ] Deal kanban
- [ ] Deal detail
- [ ] Deal stage transition

### Fase 5 - Deal Follow Up

- [ ] Note timeline di detail deal
- [ ] Next follow up date
- [ ] Dashboard reminder sederhana

### Fase 6 - Hardening

- [ ] Permission validation
- [ ] Audit log
- [ ] Empty states
- [ ] Loading states
- [ ] Regression check

## Acceptance Criteria V1

CRM V1 dianggap selesai bila:

- route CRM aktif hanya route yang memang dipakai
- `Leads` dan `Deals` sudah berjalan di kanban
- board bisa drag and drop stage dengan baik
- card kanban bisa dikustomisasi dari component internal
- customer, lead, dan deal punya detail page yang jelas
- follow up sederhana ada di detail deal, bukan chat
- tidak ada placeholder CRM yang tersisa untuk modul di luar scope
- scoping data dan permission check tetap aman

## Catatan Penting

- V1 harus terasa ringan dan operasional.
- Jangan membuka modul tambahan sebelum board lead dan board deal benar-benar stabil.
- Detail deal adalah pusat tindak lanjut, jadi follow up tidak perlu dipisah sebagai modul besar dulu.
- Engine kanban boleh memakai Syncfusion, tetapi tampilan card tetap harus dikendalikan dari component internal agar mudah diubah nanti.
