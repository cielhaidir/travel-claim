# CRM Implementation Plan

## Goal

Implement CRM secara bertahap dengan scope yang kecil dan terkendali.

Target implementasi sekarang:

- sederhanakan modul CRM
- hilangkan chat / communication module dari fase aktif
- jadikan follow up sebagai bagian dari detail deal
- gunakan kanban yang stabil dan card yang bisa dikustomisasi

## Keputusan Teknis Yang Dikunci

### 1. Scope Aktif

Hanya area berikut yang dikerjakan:

- `CRM Dashboard`
- `Customers`
- `Leads`
- `Deals`
- `Deal Follow Up` di detail deal

### 2. Scope Yang Ditunda

Ditunda ke fase berikutnya:

- communication module
- conversation / message models
- activities module sebagai menu terpisah
- products / services
- orders
- support
- marketing automation
- reports lanjutan

### 3. Engine Kanban

Primary choice:

- `@syncfusion/ej2-react-kanban`

Fallback:

- board manual jika ada blocker yang nyata

### 4. Prinsip Penting

- business flow tetap sederhana
- route CRM aktif harus sedikit
- schema minimum lebih penting daripada schema yang terlalu lengkap
- custom card adalah requirement utama

## Route Scope

Route yang dipertahankan:

- `/crm`
- `/crm/customers`
- `/crm/customers/[id]`
- `/crm/leads`
- `/crm/leads/[id]`
- `/crm/deals`
- `/crm/deals/[id]`

Route yang sebaiknya dihapus dari scope aktif:

- `/crm/communication`
- `/crm/activities`
- `/crm/products-services`
- `/crm/sales-orders`
- `/crm/support-tickets`
- `/crm/marketing-automation`
- `/crm/reports`

Catatan:

Kalau sebagian route sudah sempat ada di codebase, target akhirnya tetap harus kembali ke route minimum di atas.

## Target Data Model Minimum

### `CrmCustomer`

Minimum fields:

- `id`
- `tenantId`
- `name`
- `company`
- `email`
- `phone`
- `segment`
- `city`
- `ownerName`
- `status`
- `notes`
- `createdAt`
- `updatedAt`

### `CrmContact`

Minimum fields:

- `id`
- `tenantId`
- `customerId`
- `name`
- `title`
- `email`
- `phone`
- `department`
- `isPrimary`
- `notes`

### `CrmLead`

Minimum fields:

- `id`
- `tenantId`
- `customerId`
- `name`
- `company`
- `email`
- `phone`
- `stage`
- `value`
- `probability`
- `source`
- `priority`
- `ownerName`
- `expectedCloseDate`
- `convertedToDealAt`
- `notes`

### `CrmDeal`

Minimum fields:

- `id`
- `tenantId`
- `customerId`
- `leadId`
- `title`
- `company`
- `ownerName`
- `stage`
- `value`
- `probability`
- `source`
- `expectedCloseDate`
- `closedAt`
- `lostReason`
- `notes`

### `CrmDealNote`

Untuk follow up sederhana di detail deal.

Minimum fields:

- `id`
- `tenantId`
- `dealId`
- `type`
- `body`
- `nextFollowUpAt`
- `ownerName`
- `createdAt`
- `updatedAt`

## Enums Yang Direkomendasikan

### Lead Stage

- `NEW`
- `QUALIFIED`

### Deal Stage

- `DISCOVERY`
- `PROPOSAL`
- `NEGOTIATION`
- `VERBAL_WON`
- `WON`
- `LOST`
- `ON_HOLD`

### Deal Note Type

- `NOTE`
- `FOLLOW_UP`
- `INTERNAL_UPDATE`

## Kanban Strategy

Strategi default:

- pakai `@syncfusion/ej2-react-kanban` sebagai engine board
- bungkus lewat component internal agar card dan perilaku board tetap dikendalikan aplikasi
- siapkan fallback manual hanya jika ada blocker teknis yang nyata

## Syncfusion POC Checklist

Sebelum dipakai penuh, lakukan validasi berikut:

1. install dependency `@syncfusion/ej2-react-kanban`
2. pastikan stylesheet bisa diload tanpa merusak tema aplikasi
3. pastikan board dapat render di halaman authenticated
4. pastikan drag and drop bisa memicu mutation stage
5. pastikan custom card bisa dirender dari component internal
6. pastikan empty column dan long card tetap rapi

## Custom Card Rules

Card harus dirender dari component internal project.

Contoh struktur abstraction:

- `CrmKanbanBoard`
- `LeadKanbanCard`
- `DealKanbanCard`

Field minimum card:

- company / title
- owner
- value
- probability
- source
- target close date
- badge priority atau badge stage

Engine board boleh dari Syncfusion, tetapi isi visual card tidak boleh terkunci ke template bawaan library.

## Fase Implementasi Teknis

### Phase 0 - Preflight

Deliverables:

- [ ] Finalisasi dokumen scope
- [ ] Finalisasi route aktif
- [ ] Finalisasi keputusan no-chat
- [ ] Finalisasi target schema minimum
- [ ] Finalisasi keputusan Syncfusion sebagai primary kanban engine

Done jika:

- tim setuju bahwa CRM V1 hanya terdiri dari customer, lead, deal, dan follow up per deal

### Phase 1 - Cleanup dan Isolation

Backend:

- [ ] rapikan router CRM agar hanya menyisakan prosedur yang relevan
- [ ] keluarkan endpoint communication global
- [ ] keluarkan endpoint activity global bila memang tidak dipakai

Frontend:

- [ ] rapikan sidebar CRM
- [ ] hapus route placeholder CRM yang di luar scope
- [ ] hapus page yang tidak lagi dipakai

Done jika:

- area `/app/(authenticated)/crm/` hanya berisi route aktif

### Phase 2 - Schema Minimum

Backend:

- [ ] evaluasi ulang schema CRM yang sekarang
- [ ] pertahankan hanya model minimum
- [ ] hapus model chat bila memang belum dibutuhkan
- [ ] tambahkan `CrmDealNote` bila follow up deal akan disimpan terpisah
- [ ] update migration plan

Done jika:

- schema CRM sesuai scope kecil dan tidak memuat entity yang belum dipakai

### Phase 3 - Customer Module

Backend:

- [ ] query customer list
- [ ] query customer detail
- [ ] embedded contact CRUD

Frontend:

- [ ] customer list page
- [ ] customer detail page
- [ ] contacts section di detail customer

Done jika:

- customer dan contacts bisa dipakai tanpa bergantung ke modul lain

### Phase 4 - Syncfusion Kanban Foundation

Backend:

- [ ] siapkan mutation change stage untuk lead
- [ ] siapkan mutation change stage untuk deal

Frontend:

- [ ] install dan setup Syncfusion kanban
- [ ] buat wrapper `CrmKanbanBoard`
- [ ] buat custom card API internal
- [ ] pastikan drag and drop stabil

Done jika:

- board reusable bisa dipakai untuk lead dan deal dengan custom card

### Phase 5 - Leads Kanban

Backend:

- [ ] query lead board
- [ ] mutation update lead stage
- [ ] mutation convert lead to deal

Frontend:

- [ ] page lead kanban
- [ ] lead detail page
- [ ] action convert to deal

Done jika:

- lead board berjalan penuh dengan dua stage sederhana

### Phase 6 - Deals Kanban

Backend:

- [ ] query deal board
- [ ] mutation update deal stage

Frontend:

- [ ] page deal kanban
- [ ] deal detail page

Done jika:

- deal board berjalan penuh dengan stage pipeline aktif

### Phase 7 - Deal Follow Up

Backend:

- [ ] tambah model dan router untuk deal note / follow up
- [ ] query timeline note per deal
- [ ] create note / follow up

Frontend:

- [ ] section follow up di detail deal
- [ ] tampilkan timeline note
- [ ] form tambah note
- [ ] tampilkan next follow up date

Done jika:

- deal detail sudah cukup untuk mencatat tindak lanjut tanpa chat module

### Phase 8 - Dashboard dan Hardening

Backend:

- [ ] dashboard summary query
- [ ] reminder query untuk deal yang perlu follow up
- [ ] audit log untuk perubahan penting

Frontend:

- [ ] dashboard summary cards
- [ ] list deal yang perlu follow up
- [ ] loading, empty state, dan error state

Done jika:

- dashboard ringkas sudah usable dan seluruh flow inti bisa dipantau

## Acceptance Criteria

Implementasi dianggap siap bila:

- route CRM aktif sudah kecil dan rapi
- kanban leads dan deals berjalan stabil
- Syncfusion board sudah lolos validasi atau diganti fallback yang setara
- card kanban bisa dikustomisasi dari component internal
- follow up ada di detail deal, bukan chat module
- schema CRM tidak memuat banyak entity yang belum dipakai
- permission dan tenant scoping tetap aman

## Urutan Kerja Yang Direkomendasikan

Urutan paling aman:

1. update dokumen dan lock scope
2. cleanup route dan router
3. rapikan schema minimum
4. setup Syncfusion kanban foundation
5. selesaikan lead board
6. selesaikan deal board
7. tambahkan deal follow up
8. selesaikan dashboard
9. lakukan hardening dan regression check

## Catatan Akhir

Untuk repo ini, bahaya terbesar bukan kurang fitur, tetapi terlalu banyak scope aktif sekaligus.

Karena itu:

- communication diparkir dulu
- activities global diparkir dulu
- follow up dipusatkan di detail deal
- kanban dibuat reusable tetapi tetap sederhana

Pendekatan ini membuat CRM lebih realistis untuk diselesaikan dan lebih mudah dibersihkan bila nanti scope berubah lagi.
