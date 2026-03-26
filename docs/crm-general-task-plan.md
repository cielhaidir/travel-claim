# CRM General Task Plan

## Tujuan

Dokumen ini menjadi acuan task untuk membangun CRM yang bersifat umum dan lazim dipakai di perusahaan, bukan hanya sales CRM. Dokumen ini melengkapi `docs/crm-implementation-plan.md` yang masih berfokus pada sales pipeline.

Target akhirnya adalah satu modul CRM yang mencakup akuisisi lead, pengelolaan customer, komunikasi follow up, deal pipeline, support, order tracking, dan reporting dalam arsitektur multi-tenant yang sudah ada di project ini.

## Keputusan Scope Yang Sudah Dikunci

- Semua modul CRM umum masuk ke target scope produk, tetapi implementasi tetap dibagi per fase agar kompleksitas terkendali.
- `Leads` dan `Deals` memakai tampilan utama `kanban`.
- Modul lain memakai tampilan `list` atau `table` sebagai tampilan utama.
- Fitur `follow up` pada fase awal dibuat dalam bentuk `chat thread` saja.
- Tidak ada kebutuhan `call log`, `meeting scheduler`, `calendar sync`, `email automation`, atau `telephony integration` pada fase awal.
- Semua data CRM wajib `tenant-aware`, `permission-aware`, dan tercatat di audit log.
- Detail record tetap boleh memakai halaman detail per item walaupun daftar utamanya berbentuk kanban atau list.

## Prinsip Produk

- CRM harus terasa sederhana dipakai oleh sales, admin, dan customer service.
- Setiap record harus punya status yang jelas, owner yang jelas, dan next action yang jelas.
- Hubungan antar entitas harus mudah ditelusuri dari customer ke lead, deal, chat, order, dan ticket.
- Struktur modul harus mengikuti route CRM yang sudah mulai tersedia di codebase.
- Versi awal harus mengutamakan alur operasional harian, bukan automasi kompleks.

## Modul Target dan Mode Tampilan

| Modul | Fungsi Utama | Tampilan Utama | Catatan |
| --- | --- | --- | --- |
| CRM Dashboard | Ringkasan performa dan pekerjaan aktif | List cards + summary widgets | Bukan kanban |
| Customers | Master data akun/perusahaan/pelanggan | List | Detail customer tetap halaman detail |
| Contacts | PIC per customer | List di detail customer | Bukan menu utama terpisah jika belum perlu |
| Leads | Prospek awal sebelum jadi peluang aktif | Kanban | Wajib drag and drop stage |
| Deals | Peluang penjualan aktif | Kanban | Wajib drag and drop stage |
| Communication | Follow up dan percakapan | List thread chat | Chat manual, bukan integrasi channel nyata |
| Activities | Jejak aktivitas dan histori perubahan | List timeline | Bisa dihasilkan dari chat dan perubahan stage |
| Products / Services | Master produk atau layanan | List | Dipakai di deal dan sales order |
| Sales Orders | Order hasil deal yang menang | List | Fokus tracking order, bukan invoicing |
| Support Tickets | Masalah dan permintaan bantuan customer | List | Fokus ticketing dasar |
| Marketing Automation | Segmentasi dan campaign sederhana | List | Fase akhir, tanpa engine automasi kompleks dulu |
| Reports | KPI CRM dan ringkasan performa | List report + charts | Fokus insight operasional |
| CRM Settings | Stage, source, tags, priorities, templates | List | Direkomendasikan ditambah walau belum ada route |

## Flow CRM Umum Yang Akan Dipakai

1. Lead masuk dari form, referral, input manual, import, atau channel lain.
2. Lead masuk ke board `Leads` dengan stage awal `New`.
3. Tim melakukan follow up lewat `chat thread`.
4. Jika lead valid, lead dipindahkan ke status qualified dan dapat dikonversi menjadi `Deal`.
5. `Deal` dikelola di board kanban sampai `Won`, `Lost`, atau `On Hold`.
6. Saat `Deal` menjadi `Won`, sistem dapat membuat atau menghubungkan `Customer`, `Sales Order`, dan histori aktivitas.
7. Setelah customer aktif, komunikasi tetap dicatat di modul `Communication`.
8. Jika ada masalah layanan, dibuat `Support Ticket`.
9. Jika ada penawaran lanjutan atau repeat order, customer dapat menghasilkan deal baru.
10. Dashboard dan report membaca seluruh data di atas untuk kebutuhan monitoring.

## Entitas Data Utama

- `CrmCustomer`
- `CrmContact`
- `CrmLead`
- `CrmDeal`
- `CrmConversation`
- `CrmMessage`
- `CrmActivity`
- `CrmProductService`
- `CrmSalesOrder`
- `CrmSupportTicket`
- `CrmCampaign`
- `CrmTag`
- `CrmStageSetting`
- `CrmSourceSetting`

## Aturan UI dan UX

### Rule Tampilan

- `Leads` wajib tampil dalam board kanban dengan kolom berdasarkan stage.
- `Deals` wajib tampil dalam board kanban dengan kolom berdasarkan stage.
- `Customers`, `Communication`, `Activities`, `Products / Services`, `Sales Orders`, `Support Tickets`, `Marketing Automation`, `Reports`, dan `Settings` tampil dalam list atau table.
- Setiap list minimal punya search, filter, sorting, pagination, dan quick action.
- Detail record dibuka ke halaman detail atau side panel yang konsisten.

### Rule Follow Up

- Follow up direpresentasikan sebagai thread chat per lead, deal, atau customer.
- Pesan follow up dapat dibuat manual oleh user internal.
- Status pesan cukup sederhana: `draft`, `sent`, `received`, `note`.
- Sistem belum perlu mengirim chat ke WhatsApp, email, atau kanal eksternal lain.
- Chat wajib bisa ditautkan ke lead, deal, customer, atau ticket.
- Setiap pesan penting dapat menghasilkan activity log otomatis.

## Backlog Per Modul

### 1. CRM Dashboard

- [ ] Buat ringkasan KPI: total leads, open deals, won deals, active customers, open tickets, overdue follow up.
- [ ] Buat widget summary per owner, per source, dan per stage.
- [ ] Buat daftar pekerjaan terdekat: follow up overdue, deal hampir closing, ticket belum selesai.
- [ ] Buat filter periode, owner, dan tenant scope.
- [ ] Buat shortcut ke modul `Leads`, `Deals`, `Customers`, dan `Communication`.

### 2. Customers

- [ ] Buat halaman list customer dengan kolom utama: name, company, owner, status, segment, city, total value, last activity.
- [ ] Tambahkan search, filter status, filter owner, filter segment, dan pagination.
- [ ] Buat create, edit, archive, restore untuk customer.
- [ ] Tambahkan detail customer yang menampilkan summary, contacts, deals, conversation, orders, tickets, dan activity timeline.
- [ ] Tambahkan field umum: company, legal name, segment, industry, website, email, phone, address, notes.
- [ ] Tambahkan assignment owner dan status customer.

### 3. Contacts

- [ ] Kelola contact person dari halaman detail customer.
- [ ] Tambahkan field: name, title, email, phone, department, isPrimary, notes.
- [ ] Izinkan satu customer memiliki banyak contact.
- [ ] Tampilkan contact utama di list customer dan di deal detail.

### 4. Leads

- [ ] Buat board kanban `Leads`.
- [ ] Sediakan stage default: `New`, `Contacted`, `Qualified`, `Nurturing`, `Unqualified`.
- [ ] Tambahkan drag and drop untuk pindah stage.
- [ ] Buat quick create lead dari board.
- [ ] Buat detail lead berisi profil lead, sumber, owner, chat thread, activity log, dan histori perubahan stage.
- [ ] Tambahkan field umum: name, company, email, phone, source, priority, owner, estimated value, probability, expected close date, notes.
- [ ] Tambahkan aksi `convert to deal`.
- [ ] Tambahkan aksi `link to existing customer` bila lead ternyata sudah punya akun customer.
- [ ] Tampilkan badge overdue jika belum ada follow up dalam rentang waktu tertentu.

### 5. Deals

- [ ] Buat board kanban `Deals`.
- [ ] Sediakan stage default: `Discovery`, `Proposal`, `Negotiation`, `Verbal Won`, `Won`, `Lost`, `On Hold`.
- [ ] Tambahkan drag and drop untuk pindah stage.
- [ ] Buat detail deal berisi customer, contacts, products/services, chat thread, order reference, ticket summary, value, probability, target close date.
- [ ] Tambahkan field umum: title, customer, owner, value, probability, source, expected close date, next step, loss reason.
- [ ] Tambahkan aksi `mark won`, `mark lost`, dan `create sales order`.
- [ ] Tambahkan histori perpindahan stage untuk audit.

### 6. Communication

- [ ] Buat halaman list conversation thread.
- [ ] Sediakan filter berdasarkan entity type: lead, deal, customer, ticket.
- [ ] Buat tampilan thread chat sederhana dengan bubble message.
- [ ] Buat composer untuk menambahkan message manual.
- [ ] Tambahkan message type: `outbound`, `inbound`, `internal note`.
- [ ] Tambahkan status sederhana: `draft`, `sent`, `received`, `note`.
- [ ] Buat relasi conversation ke lead, deal, customer, atau ticket.
- [ ] Buat ringkasan last message, unread marker internal, dan next follow up date.

### 7. Activities

- [ ] Buat halaman list aktivitas CRM.
- [ ] Gabungkan aktivitas manual dan aktivitas otomatis dari perubahan stage, pembuatan order, pembuatan ticket, dan message penting.
- [ ] Tambahkan filter berdasarkan owner, entity type, date range, dan activity type.
- [ ] Buat timeline di setiap detail page yang mengambil activity lintas modul terkait.
- [ ] Tambahkan tipe minimal: `chat`, `stage_change`, `status_change`, `order_created`, `ticket_created`, `note`.

### 8. Products / Services

- [ ] Buat master list produk atau layanan.
- [ ] Tambahkan field: name, code, category, unit price, status, description.
- [ ] Tambahkan aksi create, edit, archive.
- [ ] Hubungkan produk atau layanan ke deal dan sales order.
- [ ] Tampilkan ringkasan penggunaan produk dalam deal yang aktif.

### 9. Sales Orders

- [ ] Buat halaman list sales order.
- [ ] Tambahkan field: order number, customer, deal, order date, total, status, owner.
- [ ] Tambahkan status default: `Draft`, `Confirmed`, `In Progress`, `Completed`, `Canceled`.
- [ ] Izinkan pembuatan sales order dari deal yang `Won`.
- [ ] Tampilkan detail order sederhana berisi item, qty, price, subtotal, notes.
- [ ] Pastikan modul ini fokus ke tracking order dan belum masuk invoicing.

### 10. Support Tickets

- [ ] Buat halaman list support ticket.
- [ ] Tambahkan field: ticket number, customer, subject, priority, status, assignee, created at.
- [ ] Tambahkan status default: `Open`, `In Progress`, `Waiting Customer`, `Resolved`, `Closed`.
- [ ] Buat detail ticket berisi deskripsi, chat thread, activity log, dan relasi ke customer atau deal.
- [ ] Izinkan ticket dibuat dari customer detail atau deal detail.
- [ ] Tambahkan prioritas: `Low`, `Medium`, `High`, `Urgent`.

### 11. Marketing Automation

- [ ] Buat versi sederhana berupa list campaign dan segment target.
- [ ] Tambahkan field campaign: name, type, target segment, start date, end date, status.
- [ ] Tambahkan status campaign: `Draft`, `Scheduled`, `Running`, `Completed`, `Canceled`.
- [ ] Tampilkan hasil sederhana: total target, total contacted, total converted.
- [ ] Belum perlu workflow engine, trigger otomatis, atau integrasi kanal eksternal.

### 12. Reports

- [ ] Buat report conversion lead ke deal.
- [ ] Buat report pipeline deals per stage.
- [ ] Buat report deal won vs lost.
- [ ] Buat report aktivitas follow up per owner.
- [ ] Buat report customer growth.
- [ ] Buat report support ticket backlog dan resolution status.
- [ ] Buat export sederhana ke CSV bila diperlukan.

### 13. CRM Settings

- [ ] Tambahkan master stage untuk lead dan deal.
- [ ] Tambahkan master source, priority, segment, dan tag.
- [ ] Tambahkan pengaturan numbering untuk deal, order, dan ticket.
- [ ] Tambahkan pengaturan template chat note sederhana.
- [ ] Tambahkan permission matrix per modul CRM.

## Fase Implementasi Yang Disarankan

### Fase 1 - Foundation

- [ ] Schema dan relasi dasar CRM
- [ ] CRM Dashboard
- [ ] Customers
- [ ] Contacts
- [ ] Leads kanban
- [ ] Deals kanban
- [ ] Communication chat thread
- [ ] Activities timeline
- [ ] Permissions dan audit log

### Fase 2 - Sales Ops

- [ ] Products / Services
- [ ] Sales Orders
- [ ] Integrasi customer-deal-order
- [ ] Report dasar sales

### Fase 3 - Customer Ops

- [ ] Support Tickets
- [ ] Integrasi customer-ticket-communication
- [ ] Report layanan dasar

### Fase 4 - Growth

- [ ] Marketing Automation sederhana
- [ ] Segment management
- [ ] Report campaign
- [ ] Re-engagement flow sederhana

### Fase 5 - Admin Hardening

- [ ] CRM Settings
- [ ] Advanced filter dan saved views
- [ ] Data import/export
- [ ] RBAC lebih detail
- [ ] Hardening UX dan empty states

## Dependensi Antar Modul

- `Customers` menjadi pusat relasi untuk `Contacts`, `Deals`, `Sales Orders`, dan `Support Tickets`.
- `Leads` dapat berdiri sendiri, tetapi idealnya dapat dikonversi ke `Deals` dan ditautkan ke `Customers`.
- `Communication` harus bisa dipakai lintas `Leads`, `Deals`, `Customers`, dan `Support Tickets`.
- `Activities` membaca event dari hampir semua modul lain.
- `Products / Services` dibutuhkan oleh `Deals` dan `Sales Orders`.
- `Reports` bergantung pada kualitas data seluruh modul.
- `Settings` harus disiapkan sebelum custom stage dan numbering dipakai penuh.

## Kriteria Selesai Minimum

- Semua halaman CRM utama dapat diakses dari sidebar dan tidak lagi hanya placeholder.
- `Leads` dan `Deals` sudah memakai kanban yang usable.
- `Communication` sudah berjalan sebagai thread chat manual.
- Semua modul selain `Leads` dan `Deals` tampil dalam list yang rapi dan bisa difilter.
- Setiap detail customer dapat menelusuri relasi ke leads, deals, chat, orders, tickets, dan activities.
- Semua query sudah tenant-scoped dan permission-scoped.
- Semua perubahan penting tercatat di audit log.

## Batasan Tahap Awal

- Belum ada integrasi WhatsApp, email, telephony, atau social inbox.
- Belum ada calendar meeting, reminder sinkron ke external calendar, atau task scheduler kompleks.
- Belum ada quotation builder, invoice builder, payment gateway, atau automation engine tingkat lanjut.
- Belum ada SLA engine otomatis untuk support ticket.

## Rekomendasi Implementasi Di Repo Ini

- Pertahankan route yang sudah ada: `/crm`, `/crm/customers`, `/crm/leads`, `/crm/deals`, `/crm/activities`, `/crm/communication`, `/crm/products-services`, `/crm/sales-orders`, `/crm/support-tickets`, `/crm/marketing-automation`, `/crm/reports`.
- Tambahkan route baru `/crm/settings` bila modul setting ingin dipisahkan.
- Pisahkan schema Prisma per entitas CRM utama agar router tidak terlalu gemuk.
- Pertahankan konsistensi pattern list page, detail page, badge status, dan filter bar dengan modul lain di aplikasi.
- Gunakan dokumen ini sebagai acuan backlog produk, lalu pecah lagi ke task teknis schema, router, UI, permissions, dan testing.
