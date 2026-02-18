# Chart of Accounts (COA) UI Implementation

## Overview
This document summarizes the comprehensive frontend UI implementation for Chart of Accounts (COA) management in the travel claim system.

## Implementation Date
February 11, 2026

## Components Created

### 1. Main Page
**File:** [`travel-claim/src/app/(authenticated)/chart-of-accounts/page.tsx`](../src/app/(authenticated)/chart-of-accounts/page.tsx)

A full-featured COA management page with:
- **View Modes:** Table view and hierarchical tree view
- **Filters:** Account type, active/inactive status, search by code/name
- **CRUD Operations:** Create, edit, delete, and toggle active status (admin only)
- **Real-time Updates:** Using tRPC mutations with optimistic updates
- **Statistics Dashboard:** Total accounts, active/inactive counts, accounts with claims
- **Modal Form:** Create and edit accounts with validation
- **Responsive Design:** Mobile-friendly layout

### 2. Component Library

#### [`COATable.tsx`](../src/components/features/coa/COATable.tsx)
- **Purpose:** Displays COA accounts in a sortable data table
- **Features:**
  - Sortable columns (code, name, type)
  - Indented display for parent-child relationships
  - Color-coded account types (Asset, Liability, Equity, Revenue, Expense)
  - Status badges (Active/Inactive)
  - Usage statistics (claims count, children count)
  - Action buttons: Edit, Toggle Active, Delete (admin only)
  - Loading states with skeleton loaders

#### [`COAForm.tsx`](../src/components/features/coa/COAForm.tsx)
- **Purpose:** Form for creating and editing COA accounts
- **Features:**
  - All required fields: Code, Name, Account Type, Category
  - Optional fields: Subcategory, Parent Account, Description
  - Real-time validation
  - Hierarchical parent selection (filtered by account type)
  - Active status toggle
  - Loading states during submission
  - Error handling and display

#### [`COAFilters.tsx`](../src/components/features/coa/COAFilters.tsx)
- **Purpose:** Filter controls for COA list
- **Features:**
  - Search input (code/name)
  - Account type dropdown (Asset, Liability, Equity, Revenue, Expense)
  - Active/Inactive status filter
  - Responsive layout

#### [`COAHierarchyView.tsx`](../src/components/features/coa/COAHierarchyView.tsx)
- **Purpose:** Tree view displaying hierarchical account structure
- **Features:**
  - Expandable/collapsible nodes
  - Visual indentation showing parent-child relationships
  - Color-coded account types
  - Status badges
  - Quick actions: Edit, Toggle Active
  - Recursive rendering for multi-level hierarchies

#### [`COASelector.tsx`](../src/components/features/coa/COASelector.tsx)
- **Purpose:** Reusable dropdown component for selecting COA accounts
- **Features:**
  - Filterable by account type
  - Grouped by account type when showing all types
  - Hierarchical display of account codes
  - Support for required/optional fields
  - Error state handling
  - Can be used in Claims forms and other parts of the application

## Navigation Update

**File:** [`travel-claim/src/components/navigation/SidebarNav.tsx`](../src/components/navigation/SidebarNav.tsx)

Added "Chart of Accounts" menu item:
- **Icon:** 📋 (document icon)
- **Path:** `/chart-of-accounts`
- **Access:** Finance Manager and Admin roles only
- **Position:** Between "Approvals" and "Finance" in the navigation

## tRPC Integration

The UI integrates with existing tRPC endpoints from [`chartOfAccount.ts`](../src/server/api/routers/chartOfAccount.ts):

### Queries Used
- `chartOfAccount.getAll` - Fetch all accounts with filters
- `chartOfAccount.getHierarchy` - Fetch hierarchical tree structure
- `chartOfAccount.getActiveAccounts` - Fetch active accounts for dropdowns

### Mutations Used
- `chartOfAccount.create` - Create new account (admin only)
- `chartOfAccount.update` - Update existing account (admin only)
- `chartOfAccount.delete` - Delete/deactivate account (admin only)
- `chartOfAccount.toggleActive` - Toggle active status (admin only)

## Features Implemented

### 1. List View (Table Mode)
- ✅ Sortable data table with all account information
- ✅ Visual hierarchy indication (indentation, tree connectors)
- ✅ Color-coded account types
- ✅ Status badges (Active/Inactive)
- ✅ Usage statistics (claims, children)
- ✅ Admin actions (Edit, Delete, Toggle Active)

### 2. Hierarchy View (Tree Mode)
- ✅ Expandable/collapsible tree structure
- ✅ Multi-level parent-child relationships
- ✅ Visual indentation
- ✅ Quick actions on each node

### 3. Filters
- ✅ Search by code or name
- ✅ Filter by account type
- ✅ Filter by active/inactive status
- ✅ Real-time filtering

### 4. Create/Edit Form
- ✅ Modal overlay design
- ✅ All required and optional fields
- ✅ Parent account selection (hierarchical)
- ✅ Validation (code format, required fields, unique constraints)
- ✅ Loading states
- ✅ Error handling

### 5. Admin Operations
- ✅ Role-based access control (admin only)
- ✅ Create new accounts
- ✅ Edit existing accounts
- ✅ Delete accounts (with dependency checks)
- ✅ Toggle active/inactive status
- ✅ Confirmation dialogs for destructive actions

### 6. User Experience
- ✅ Responsive design (mobile, tablet, desktop)
- ✅ Loading states and skeleton loaders
- ✅ Empty states with helpful messages
- ✅ Success/error notifications (alerts)
- ✅ Statistics dashboard
- ✅ Optimistic updates for better perceived performance

## Design Patterns Used

### UI Patterns
- **Consistent styling** with existing components (Button, Badge, EmptyState, PageHeader)
- **Tailwind CSS** for styling
- **Modal overlay** for forms
- **Two-column responsive grid** for form fields
- **Card layout** for statistics

### React Patterns
- **Custom hooks** from tRPC for data fetching
- **useState** for local state management
- **useMemo** for computed values and filtering
- **Controlled components** for forms
- **Type-safe** TypeScript throughout

### Data Patterns
- **Optimistic updates** via tRPC utilities
- **Automatic refetching** after mutations
- **Hierarchical data** handling for parent-child relationships
- **Client-side filtering** for search

## TypeScript Types

All components use proper TypeScript typing:
- `COAType` enum from Prisma (ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE)
- `COAAccount` interface for table data
- `COAFormData` interface for form submissions
- `HierarchyAccount` interface for tree view
- Proper type inference from tRPC queries

## Accessibility Considerations

- Semantic HTML elements
- Button elements with proper titles
- Form labels with required indicators
- Keyboard navigation support
- Color contrast for text and badges
- Loading indicators for screen readers

## Future Enhancements

Potential improvements for future iterations:
1. **Bulk operations** - Multi-select and bulk activate/deactivate
2. **Export functionality** - Export COA to CSV/Excel
3. **Import functionality** - Bulk import from file
4. **Advanced search** - Filter by multiple criteria simultaneously
5. **Audit trail view** - Show change history for each account
6. **Drag-and-drop** - Reorder or reassign parent relationships
7. **Toast notifications** - Replace browser alerts with toast UI
8. **Deep linking** - URL parameters for filters and search
9. **Keyboard shortcuts** - Quick actions for power users
10. **Print view** - Printer-friendly hierarchy view

## Testing Recommendations

### Manual Testing Checklist
- ✅ Create new account (all fields)
- ✅ Edit existing account
- ✅ Delete account (with/without dependencies)
- ✅ Toggle active status
- ✅ Search and filter functionality
- ✅ View mode switching (table/hierarchy)
- ✅ Parent account selection
- ✅ Form validation
- ✅ Role-based access (admin vs non-admin)
- ✅ Responsive layout (mobile/tablet/desktop)

### Automated Testing
Consider adding:
- Unit tests for components
- Integration tests for tRPC mutations
- E2E tests for critical workflows
- Accessibility tests

## Related Documentation

- [Chart of Accounts Design](./CHART_OF_ACCOUNTS_DESIGN.md)
- [Database Schema](./DATABASE_SCHEMA.md)
- [tRPC Router Implementation](../src/server/api/routers/chartOfAccount.ts)
- [Frontend Design System](./FRONTEND_DESIGN.md)

## Conclusion

The COA UI implementation provides a complete, professional interface for managing the chart of accounts structure. It follows the project's design patterns, integrates seamlessly with the tRPC backend, and offers an intuitive user experience for both viewing and managing financial account hierarchies.
