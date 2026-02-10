# Frontend Setup Documentation

## Overview
This document describes the frontend implementation based on [`FRONTEND_DESIGN.md`](FRONTEND_DESIGN.md:1).

## Directory Structure

```
src/
├── app/
│   ├── (public)/              # Public routes (unauthenticated)
│   │   ├── page.tsx           # Landing page
│   │   └── login/
│   │       └── page.tsx       # Login page
│   ├── (app)/                 # Protected routes (authenticated)
│   │   ├── layout.tsx         # App shell with sidebar and header
│   │   ├── loading.tsx        # Loading skeleton
│   │   ├── page.tsx           # Dashboard
│   │   ├── travel/
│   │   │   └── page.tsx       # Travel requests list
│   │   ├── claims/
│   │   │   └── page.tsx       # Claims list
│   │   └── approvals/
│   │       └── page.tsx       # Approvals queue
│   ├── layout.tsx             # Root layout
│   ├── loading.tsx            # Root loading state
│   └── error.tsx              # Root error boundary
├── components/
│   ├── layouts/
│   │   └── AppShell.tsx       # Main app container with sidebar
│   ├── navigation/
│   │   ├── SidebarNav.tsx     # Sidebar navigation menu
│   │   ├── TopHeader.tsx      # Top header with search and user menu
│   │   └── Breadcrumbs.tsx    # Breadcrumb navigation
│   └── ui/
│       ├── Button.tsx         # Button component
│       └── Badge.tsx          # Badge component
├── lib/
│   ├── constants/
│   │   ├── roles.ts           # Role definitions and helpers
│   │   └── status.ts          # Status definitions and configurations
│   └── utils/
│       └── format.ts          # Formatting utilities
└── styles/
    └── globals.css            # Global styles and design tokens
```

## Implemented Features

### 1. Route Groups
- **`(public)`**: Unauthenticated routes
  - Landing page with feature overview
  - Login page with Microsoft authentication
  
- **`(app)`**: Protected routes requiring authentication
  - Dashboard with role-based content
  - Travel requests management
  - Claims management
  - Approvals queue (role-restricted)

### 2. Layout Components
- **[`AppShell`](../src/components/layouts/AppShell.tsx:1)**: Main container with responsive sidebar
- **[`SidebarNav`](../src/components/navigation/SidebarNav.tsx:1)**: Role-aware navigation menu
- **[`TopHeader`](../src/components/navigation/TopHeader.tsx:1)**: Header with search and user menu
- **[`Breadcrumbs`](../src/components/navigation/Breadcrumbs.tsx:1)**: Dynamic breadcrumb navigation

### 3. Loading and Error States
- Root level loading spinner
- Page-level loading skeletons
- Error boundaries with retry functionality

### 4. Design System
All design tokens from [`FRONTEND_DESIGN.md`](FRONTEND_DESIGN.md:201) are implemented in [`globals.css`](../src/styles/globals.css:1):

**Colors:**
- Primary: `#2563EB`
- Success: `#16A34A`
- Warning: `#D97706`
- Danger: `#DC2626`
- Info: `#0EA5E9`

**Typography:**
- Font: Geist (Google Fonts) with system fallbacks
- Scale: 12, 14, 16, 18, 20, 24, 30, 36px

**Spacing:**
- Scale: 4, 8, 12, 16, 24, 32, 40, 48px (Tailwind defaults)

**Responsive Breakpoints:**
- sm: 640px
- md: 768px
- lg: 1024px
- xl: 1280px

### 5. Utilities and Constants

**Role Management** ([`roles.ts`](../src/lib/constants/roles.ts:1)):
- Role definitions and type safety
- Helper functions: `isApprover()`, `hasFinanceAccess()`, `isAdmin()`

**Status Management** ([`status.ts`](../src/lib/constants/status.ts:1)):
- Travel request status flow
- Claim status flow
- Status configuration with labels and colors

**Format Utilities** ([`format.ts`](../src/lib/utils/format.ts:1)):
- Currency formatting
- Date and time formatting
- Relative time (e.g., "2 hours ago")
- File size formatting
- Text utilities

### 6. UI Components
- **[`Button`](../src/components/ui/Button.tsx:1)**: Variants (primary, secondary, ghost, destructive), sizes (sm, md, lg)
- **[`Badge`](../src/components/ui/Badge.tsx:1)**: Status badges with variants

## Authentication Flow
1. User visits landing page
2. Clicks "Sign In" to go to [`/login`](../src/app/(public)/login/page.tsx:1)
3. Signs in with Microsoft account
4. Redirected to role-based dashboard at [`/`](../src/app/(app)/page.tsx:1)
5. [`AppShell`](../src/components/layouts/AppShell.tsx:1) wraps all authenticated pages

## Role-Based Access Control
Navigation items in [`SidebarNav`](../src/components/navigation/SidebarNav.tsx:1) are filtered based on user role:
- **All users**: Dashboard, Travel, Claims, Profile
- **Approvers**: + Approvals
- **Finance**: + Finance
- **Admin**: + Admin

## Next Steps

### To be implemented:
1. **Detail Pages**:
   - `/travel/[id]` - Travel request details
   - `/travel/new` - Create travel request form
   - `/claims/[id]` - Claim details
   - `/claims/new` - Create claim form
   - `/approvals/[id]` - Approval detail view

2. **Feature Components**:
   - Travel request cards and forms
   - Claim cards and forms
   - File upload component
   - Data tables with sorting/filtering
   - Approval action modals

3. **Additional UI Components**:
   - Form inputs and validation
   - Modals and dialogs
   - Dropdown menus
   - Toast notifications
   - Date pickers

4. **State Management**:
   - tRPC query integration
   - Form state with React Hook Form
   - Optimistic updates

5. **Finance and Admin Routes**:
   - Finance dashboard and reports
   - Admin user management
   - System configuration
   - Audit logs

6. **PWA Features**:
   - Service worker setup
   - Manifest file
   - Offline support
   - Push notifications

## Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Run type checking
npm run type-check

# Run linting
npm run lint
```

## Dependencies

### Core:
- Next.js 14 (App Router)
- React 18
- TypeScript
- Tailwind CSS

### UI & Styling:
- Tailwind CSS v4 (via PostCSS)
- Geist font (Google Fonts)

### Authentication:
- NextAuth.js with Microsoft provider

### API & Data:
- tRPC for type-safe APIs
- Prisma for database

## Accessibility Features
- ARIA labels on interactive elements
- Keyboard navigation support
- Focus visible states (2px blue ring)
- Color contrast compliance (WCAG 2.1 AA)
- Screen reader friendly

## Mobile Responsiveness
- Mobile-first approach
- Responsive sidebar (drawer on mobile)
- Touch-friendly targets (min 44x44px)
- Bottom navigation on mobile (to be implemented)

## Performance Optimizations
- Server components by default
- Client components only where needed
- Route-level code splitting
- Loading skeletons for better perceived performance
- Optimized font loading with `next/font`

## Browser Support
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

---

**Last Updated**: 2026-02-09

**Related Documents**:
- [`FRONTEND_DESIGN.md`](FRONTEND_DESIGN.md:1) - Complete frontend specifications
- [`AUTH_DESIGN.md`](AUTH_DESIGN.md:1) - Authentication design
- [`API_DESIGN.md`](API_DESIGN.md:1) - API design