# Purchase & Sales Relational Schema

## Pembelian

Alur utama:

`CrmCustomer (vendor) -> PurchaseRequest -> PurchaseOrder -> GoodsReceipt -> VendorInvoice`

### Model
- `PurchaseRequest`
  - header permintaan pembelian
  - optional relasi ke vendor CRM dan department
- `PurchaseRequestLine`
  - item yang diminta
  - relasi ke `InventoryItem` dan `Warehouse`
- `PurchaseOrder`
  - hasil konversi PR ke vendor
- `PurchaseOrderLine`
  - detail PO
  - optional relasi ke `PurchaseRequestLine`
- `GoodsReceipt`
  - penerimaan barang berdasarkan PO
- `GoodsReceiptLine`
  - qty ordered / received / accepted / rejected
  - optional relasi ke `InventoryReceiptBatch`
- `VendorInvoice`
  - tagihan vendor untuk 2-way / 3-way matching
- `VendorInvoiceLine`
  - optional relasi ke `PurchaseOrderLine` dan `GoodsReceiptLine`

## Penjualan

Alur utama:

`CrmCustomer (customer) -> SalesQuotation -> SalesOrder -> DeliveryOrder -> SalesInvoice`

### Model
- `SalesQuotation`
  - header quotation ke customer
- `SalesQuotationLine`
  - item quotation
  - relasi ke `InventoryItem` dan `Warehouse`
- `SalesOrder`
  - hasil quotation approved
- `SalesOrderLine`
  - optional relasi ke `SalesQuotationLine`
- `DeliveryOrder`
  - pengiriman berdasarkan sales order
- `DeliveryOrderLine`
  - qty ordered / shipped / delivered
- `SalesInvoice`
  - invoice customer
- `SalesInvoiceLine`
  - optional relasi ke `SalesOrderLine` dan `DeliveryOrderLine`

## Master yang dipakai bersama
- `CrmCustomer`
  - dipakai sebagai vendor dan customer
- `InventoryItem`
  - dipakai oleh semua line transaksi pembelian dan penjualan
  - sekarang punya `itemType` untuk membedakan `HARDWARE`, `SOFTWARE_LICENSE`, `SERVICE`, dan `MANAGED_SERVICE`
- `Warehouse`
  - dipakai oleh line transaksi dan dokumen fulfillment/receipt
- `Department`
  - dipakai oleh `PurchaseRequest`

## Flow barang vs jasa
- `BusinessFlowType`
  - `GOODS`: seluruh line adalah barang / item fisik
  - `SERVICE`: seluruh line adalah jasa / non-fisik
  - `MIXED`: kombinasi barang dan jasa
- `PurchaseRequest.procurementMode`
  - menandai PR dominan barang / jasa / campuran
- `PurchaseOrder.procurementMode`
  - hasil turunan dari item inventory pada saat convert PR -> PO
- `PurchaseOrder.requiresReceipt`
  - `false` untuk PO jasa murni, sehingga tidak perlu goods receipt
- `SalesQuotation.fulfillmentMode`
  - menandai quotation barang / jasa / campuran
- `SalesOrder.fulfillmentMode`
  - hasil turunan dari item inventory pada saat convert quotation -> SO
- `SalesOrder.requiresDelivery`
  - `false` untuk order jasa murni, sehingga tidak wajib delivery order

## Status enum yang ditambahkan
- `PurchaseRequestStatus`
- `PurchaseOrderStatus`
- `GoodsReceiptStatus`
- `VendorInvoiceStatus`
- `VendorInvoiceMatchType`
- `SalesQuotationStatus`
- `SalesOrderStatus`
- `DeliveryOrderStatus`
- `SalesInvoiceStatus`
- `InventoryItemType`
- `BusinessFlowType`

## Catatan implementasi berikutnya
Tahap selanjutnya agar halaman benar-benar tidak dummy:
1. buat migration Prisma
2. generate Prisma client
3. buat router tRPC untuk purchase & sales
4. ganti page UI agar query data dari database
5. tambah create/edit workflow per dokumen
