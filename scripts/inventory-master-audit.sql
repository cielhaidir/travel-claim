-- Inventory / Purchase Master Audit
-- Usage:
--   psql "$DATABASE_URL" -f scripts/inventory-master-audit.sql

\echo '=== 1. Active item master with suspicious accounting / classification ==='
select
  i.sku,
  i.name,
  i."itemType",
  i."usageType",
  i."isStockTracked",
  coalesce(i."standardCost"::text, '-') as standard_cost,
  coalesce(inv.code, '-') as inventory_coa,
  coalesce(cogs.code, '-') as cogs_coa,
  case
    when i."itemType" in ('SERVICE', 'SOFTWARE_LICENSE', 'MANAGED_SERVICE') and i."isStockTracked" = true then 'NON_STOCK_TYPE_IS_TRACKED'
    when i."itemType" in ('SERVICE', 'SOFTWARE_LICENSE', 'MANAGED_SERVICE') and (i."inventoryCoaId" is not null or i."cogsCoaId" is not null or i."temporaryAssetCoaId" is not null) then 'NON_STOCK_TYPE_HAS_STOCK_COA'
    when i."itemType" in ('SERVICE', 'SOFTWARE_LICENSE', 'MANAGED_SERVICE') and i."usageType" <> 'SALE' then 'NON_STOCK_TYPE_USAGE_MISMATCH'
    when i."isStockTracked" = true and i."standardCost" is null then 'STOCK_TRACKED_WITHOUT_STANDARD_COST'
    when i."isStockTracked" = true and i."inventoryCoaId" is null then 'STOCK_TRACKED_WITHOUT_INVENTORY_COA'
    when i."isStockTracked" = true and i."cogsCoaId" is null then 'STOCK_TRACKED_WITHOUT_COGS_COA'
    else 'CHECK'
  end as finding
from "InventoryItem" i
left join "ChartOfAccount" inv on inv.id = i."inventoryCoaId"
left join "ChartOfAccount" cogs on cogs.id = i."cogsCoaId"
where i."deletedAt" is null
  and i."isActive" = true
  and (
    (i."itemType" in ('SERVICE', 'SOFTWARE_LICENSE', 'MANAGED_SERVICE') and i."isStockTracked" = true)
    or (i."itemType" in ('SERVICE', 'SOFTWARE_LICENSE', 'MANAGED_SERVICE') and (i."inventoryCoaId" is not null or i."cogsCoaId" is not null or i."temporaryAssetCoaId" is not null))
    or (i."itemType" in ('SERVICE', 'SOFTWARE_LICENSE', 'MANAGED_SERVICE') and i."usageType" <> 'SALE')
    or (i."isStockTracked" = true and i."standardCost" is null)
    or (i."isStockTracked" = true and i."inventoryCoaId" is null)
    or (i."isStockTracked" = true and i."cogsCoaId" is null)
  )
order by i.sku;

\echo ''
\echo '=== 2. Warehouse / item consistency: stock balances pointing to inactive or deleted master ==='
select
  i.sku,
  i.name,
  i."isActive",
  i."deletedAt",
  w.code as warehouse_code,
  w.name as warehouse_name,
  w."isActive" as warehouse_active,
  w."deletedAt" as warehouse_deleted_at,
  b."bucketType",
  b."qtyOnHand"::text,
  b."qtyReserved"::text
from "InventoryBalance" b
join "InventoryItem" i on i.id = b."itemId"
join "Warehouse" w on w.id = b."warehouseId"
where i."deletedAt" is not null
   or i."isActive" = false
   or w."deletedAt" is not null
   or w."isActive" = false
order by i.sku, w.code, b."bucketType";

\echo ''
\echo '=== 3. Legacy / unused active items with no docs, no balances, and no movement history ==='
select
  i.sku,
  i.name,
  i."itemType",
  i."usageType",
  i."isStockTracked",
  coalesce(i."standardCost"::text, '-') as standard_cost
from "InventoryItem" i
where i."deletedAt" is null
  and i."isActive" = true
  and not exists (select 1 from "PurchaseRequestLine" prl where prl."inventoryItemId" = i.id)
  and not exists (select 1 from "PurchaseOrderLine" pol where pol."inventoryItemId" = i.id)
  and not exists (select 1 from "GoodsReceiptLine" grl where grl."inventoryItemId" = i.id)
  and not exists (select 1 from "VendorInvoiceLine" vil where vil."inventoryItemId" = i.id)
  and not exists (select 1 from "SalesQuotationLine" sql where sql."inventoryItemId" = i.id)
  and not exists (select 1 from "SalesOrderLine" sol where sol."inventoryItemId" = i.id)
  and not exists (select 1 from "DeliveryOrderLine" dol where dol."inventoryItemId" = i.id)
  and not exists (select 1 from "SalesInvoiceLine" sil where sil."inventoryItemId" = i.id)
  and not exists (select 1 from "InventoryBalance" ib where ib."itemId" = i.id and (coalesce(ib."qtyOnHand", 0) <> 0 or coalesce(ib."qtyReserved", 0) <> 0))
  and not exists (select 1 from "InventoryLedgerEntry" ile where ile."itemId" = i.id)
  and not exists (select 1 from "InventoryItemUnit" iu where iu."inventoryItemId" = i.id)
  and not exists (select 1 from "InventoryReceiptBatch" irb where irb."inventoryItemId" = i.id)
order by i.sku;

\echo ''
\echo '=== 4. Item type vs usage type mismatch candidates ==='
select
  i.sku,
  i.name,
  i."itemType",
  i."usageType",
  i."isStockTracked",
  case
    when i."itemType" = 'HARDWARE' and i."usageType" = 'SALE' and i."temporaryAssetCoaId" is not null then 'SALE_ONLY_WITH_TEMP_ASSET_COA'
    when i."itemType" = 'HARDWARE' and i."usageType" = 'OPERATIONAL' and i."inventoryCoaId" is not null then 'OPERATIONAL_ONLY_WITH_SALES_INVENTORY_COA'
    when i."itemType" in ('SERVICE', 'SOFTWARE_LICENSE', 'MANAGED_SERVICE') and i."usageType" <> 'SALE' then 'NON_STOCK_TYPE_USAGE_MISMATCH'
    else 'REVIEW'
  end as finding
from "InventoryItem" i
where i."deletedAt" is null
  and i."isActive" = true
  and (
    (i."itemType" = 'HARDWARE' and i."usageType" = 'SALE' and i."temporaryAssetCoaId" is not null)
    or (i."itemType" = 'HARDWARE' and i."usageType" = 'OPERATIONAL' and i."inventoryCoaId" is not null)
    or (i."itemType" in ('SERVICE', 'SOFTWARE_LICENSE', 'MANAGED_SERVICE') and i."usageType" <> 'SALE')
  )
order by i.sku;

\echo ''
\echo '=== 5. Purchase / sales document lines referencing inactive inventory items ==='
select 'SalesQuotationLine' as source_table, i.sku, i.name, count(*)::int as rows
from "SalesQuotationLine" l
join "InventoryItem" i on i.id = l."inventoryItemId"
where i."deletedAt" is not null or i."isActive" = false
group by i.sku, i.name
union all
select 'PurchaseRequestLine' as source_table, i.sku, i.name, count(*)::int as rows
from "PurchaseRequestLine" l
join "InventoryItem" i on i.id = l."inventoryItemId"
where i."deletedAt" is not null or i."isActive" = false
group by i.sku, i.name
union all
select 'SalesOrderLine' as source_table, i.sku, i.name, count(*)::int as rows
from "SalesOrderLine" l
join "InventoryItem" i on i.id = l."inventoryItemId"
where i."deletedAt" is not null or i."isActive" = false
group by i.sku, i.name
union all
select 'PurchaseOrderLine' as source_table, i.sku, i.name, count(*)::int as rows
from "PurchaseOrderLine" l
join "InventoryItem" i on i.id = l."inventoryItemId"
where i."deletedAt" is not null or i."isActive" = false
group by i.sku, i.name
order by source_table, sku;
