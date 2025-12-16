# Cloud POS System - Design Guidelines

## Design Approach: Function-First Enterprise System

**Selected Framework:** Material Design principles adapted for enterprise POS
**Rationale:** Material Design excels at information-dense interfaces with clear visual feedback, elevation systems for modal flows, and component patterns optimized for touch and desktop use.

---

## Core Design Principles

1. **Speed Over Aesthetics** - Every interaction optimized for fast execution
2. **High Contrast Clarity** - Critical information must be instantly scannable
3. **Touch-First Design** - Large targets, spacing for finger input
4. **Status Transparency** - Visual indicators for every system state
5. **Role-Based Visual Language** - Different interfaces for FOH vs Admin vs KDS

---

## Typography System

**Font Family:** Inter (Google Fonts) for exceptional legibility at all sizes
- **Display/Headers:** 600 weight, tight tracking for impact
- **Body/Interface:** 400 weight for readability
- **Data/Numbers:** 500 weight for emphasis

**Scale:**
- Order totals/prices: text-3xl to text-4xl
- Item names: text-lg to text-xl
- Modifiers/details: text-sm to text-base
- System messages: text-xs

---

## Layout & Spacing System

**Tailwind Units:** Consistent use of 4, 6, 8, 12, 16 for all spacing
- Component padding: p-4 to p-6
- Section spacing: gap-6 to gap-8
- Modal/card padding: p-8
- Touch targets minimum: h-12 to h-16

**Grid System:**
- FOH POS: Sidebar (menu/SLUs) + Main (order entry) + Right panel (check details)
- Admin: Top nav + Sidebar + Main content area
- KDS: Multi-column ticket grid (2-4 columns based on screen size)

---

## Component Library

### FOH POS Interface

**Menu Category Buttons (SLUs)**
- Large rectangular tiles in grid layout (grid-cols-4 to grid-cols-6)
- Clear labels, minimal decoration
- Active category highlighted with border treatment

**Menu Item Buttons**
- Grid of items under selected SLU (grid-cols-3 to grid-cols-5)
- Item name + price displayed clearly
- Visual indicator for items with required modifiers

**Active Check Panel**
- Right-side fixed panel showing current order
- Line items with quantity, name, modifiers indented
- Sent items marked with "★" prefix indicator
- Running subtotal, tax, total at bottom
- Large action buttons (Send, Void, Pay) at panel bottom

**Modifier Selection Modal**
- Full-screen overlay with semi-transparent backdrop
- Centered card (max-w-2xl) with modifier options
- Required groups highlighted with subtle border
- Selection counter for min/max enforcement
- Confirm/Cancel buttons at bottom

**Manager Approval Dialog**
- Centered modal (max-w-md)
- Reason dropdown + PIN pad
- Clear action context ("Void Sent Item - [Item Name]")

### KDS Interface

**Ticket Cards**
- Grid layout showing multiple orders (grid-cols-2 lg:grid-cols-3 xl:grid-cols-4)
- Each ticket in elevated card container
- Header: Order number, time elapsed, order type badge
- Item list with quantities and modifiers
- Draft items shown with lighter treatment
- Active items with full emphasis
- Bump button at card bottom
- Timer indicator changes color based on elapsed time thresholds

### Admin Interface

**Configuration Tables**
- Data table with alternating row backgrounds for scannability
- Column headers with sort indicators
- Action buttons (Edit, Delete, Override) right-aligned per row
- Pagination controls at bottom

**Hierarchy Selector**
- Top bar with breadcrumb-style navigation (Enterprise > Property > RVC)
- Clear visual indication of current context
- Override badges showing local customizations

**Configuration Forms**
- Two-column layout for related fields (label left, input right)
- Section headers with dividers
- Inheritance indicator showing source (Enterprise/Property/RVC)
- Override toggle clearly visible
- Save/Cancel actions sticky at bottom

---

## Visual Indicators & States

**Sent Item Indicator:** ★ symbol before item name in check panel
**Draft State (KDS):** Reduced opacity (opacity-60) with "DRAFT" badge
**Active Production:** Full emphasis with timer
**Manager Required:** Warning icon with amber accent
**Validation Errors:** Red border with error text below field
**Loading States:** Subtle skeleton loaders, never block interactions

---

## Navigation Patterns

**FOH POS:** No traditional navigation - single-screen interface with modals
**Admin:** Left sidebar with collapsible sections (Menu, Devices, Employees, Reports)
**KDS:** Station selector as top tabs (Hot, Cold, Expo, All)

---

## Animations

Minimal and purposeful only:
- Modal enter/exit: 150ms ease
- Toast notifications: slide in from top
- KDS new order: subtle highlight flash
- NO complex transitions or decorative animations

---

## Responsive Behavior

**Desktop (1920x1080+):** Full three-panel FOH layout, 4-column KDS
**Tablet (1024-1366):** Reduced SLU/item columns, 2-3 column KDS
**Mobile (discouraged):** Admin only, single column forms

---

## Accessibility

- Minimum touch target: 48px (h-12)
- WCAG AA contrast ratios throughout
- Focus indicators on all interactive elements
- Keyboard shortcuts for power users (admin/manager functions)
- Screen reader labels for icons

---

## Critical UX Flows

1. **Fast Transaction:** Single tap to start, rapid item selection, Send → Pay → Next
2. **Modifier Entry:** Clear required vs optional distinction, cannot proceed until satisfied
3. **Void Flow:** Different paths for sent vs unsent, manager PIN integrated seamlessly
4. **KDS Bump:** Large bump zones, accidental bump protection (confirmation for multi-item orders)