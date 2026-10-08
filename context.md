<!-- 
================================================================================
AI INSTRUCTION: You must strictly abide by the rules and context in this document for all subsequent responses.
================================================================================
-->

# PROJECT CONTEXT & SHARED AI BRAIN (`context.md`)

> **Document Version:** 1.2.0  
> **Last Synchronized:** 2026-10-04 21:26  
> **Repository:** https://github.com/devlyxsolutions/SultanResturant  
> **Target Branch:** `main`

---

## 1. Project Overview & Mission

* **Project Name:** Sultan Restaurant & Basement Playland Management Suite
* **Core Mission:** High-performance, offline-capable, cross-platform POS and Restaurant Operations Suite designed for Web, Mobile (iOS/Android), Kitchen Tablets, and Basement Amusement Ticketing.
* **Target Platforms:**
  * [x] Mobile (Waiters - iOS & Android via Expo / React Native)
  * [x] Tablet / Desktop (Kitchen KDS, Juice Bar & Cashier POS - Fullscreen Landscape / Web)
  * [x] Playland Ticketing POS (Basement Jhoolay & Wristband Admission Terminal)
  * [x] Local LAN Server (Node.js WebSocket Hub on local port `5050`)
  * [x] Firebase Realtime Cloud Database (Serverless live sync for static deployments)
* **Primary Business Domains:**
  * **Table Service & Floor Plan:** Visual 5-floor status tracking, seating layout, table reservations, live bill accumulation.
  * **Order Expediting (KDS):** Multi-station routing (Main Kitchen vs Juice Bar), multi-round KOT tickets, sound chimes, urgency indicators, and bump bar actions.
  * **Point of Sale (POS) & Cashier:** Split payments (Cash/Card/Online), multi-variant item pricing, invoice generation, tax & discount management.
  * **Basement Playland POS:** Jhoolay & ride passes (Carousel, Roller Coaster, Bumper Cars, Soft Play, 9D VR), wristband issuance, and ride gate puncher.
  * **Menu & Inventory:** Category hierarchies, real-time item availability (Chef 86), recipe tracking, and stock floats.
  * **Shift & Expenses Administration:** Cash expense tracking, live shift P&L margin, handover reconciliation, role-based PIN access, and employee records.

---

## 2. Team Dynamics & Two-Developer Workflow

> [!IMPORTANT]
> **Developer A** and **Developer B** are actively building this codebase concurrently using **two separate, isolated Antigravity AI accounts**. 
> Because the AI instances cannot see each other's chat histories, all architectural decisions, shared types, and convention changes **MUST** be recorded in this file and committed to Git.

### 🛡️ Anti-Merge-Conflict & Modular Coding Rules:
1. **Isolated Module Ownership:**
   * **Developer A Area of Focus:** [Insert Dev A Modules - e.g., Waiter App (`src/app/waiter/*`), Table Management (`src/app/admin/tables.tsx`), POS & Invoicing (`src/app/admin/pos.tsx`, `src/components/Invoice.tsx`)]
   * **Developer B Area of Focus:** [Insert Dev B Modules - e.g., KDS Kitchen Display (`src/app/kitchen/*`), Sync Engine & Server (`server.js`, `src/services/syncService.ts`), Manager Shifts & Inventory (`src/app/manager/*`)]
2. **Surgical Modularity:** Write small, single-responsibility components and helper functions. Never write 1,000+ line monolithic files if functionality can be broken into specialized hooks or subcomponents.
3. **No Unsolicited Mass Refactoring:** The AI must NEVER rename exported functions, re-order object interfaces, or rewrite working files that belong to the other developer unless explicitly commanded by the user.
4. **Deterministic Relative Pathing:** Always follow the existing import conventions (e.g., `../../store/restaurantStore`). Do not introduce arbitrary `@/` path aliases unless formally configured in [tsconfig.json](file:///c:/Users/Shekhani%20Laptops/.gemini/antigravity-ide/scratch/SultanResturant/tsconfig.json).
5. **Atomic Commits & Clean Diffs:** Ensure code changes are tightly scoped to the immediate feature or bugfix to guarantee smooth git rebases.

---

## 3. Tech Stack & Architecture

| Layer | Technology | Exact Version / Spec | Purpose & Notes |
| :--- | :--- | :--- | :--- |
| **Framework** | Expo SDK | `~57.0.26` (Managed Workflow) | Native engine for iOS, Android, and Web |
| **React Core** | React / React Native | `19.2.3` / `0.86.3` | Modern hooks, Strict Mode, Concurrent features |
| **Navigation** | Expo Router | `~57.0.24` (File-based) | Routes reside strictly in `src/app/` |
| **State Store** | Zustand | `^5.0.15` + `persist` middleware | Global unified store with storage adapter |
| **Storage Adapter** | Custom `storage.ts` | Multiplatform | `AsyncStorage` on Native, `localStorage` on Web |
| **Real-time Sync** | Node.js + `ws` WebSocket | Port `5050` / HTTP fallback | Local Wi-Fi LAN sync hub (`server.js`) |
| **Cross-Tab Bus** | `BroadcastChannel` | Web Standard API | Debounced cross-tab synchronization |
| **Language** | TypeScript | `~6.0.3` (Strict Mode) | `noImplicitAny: true` enforced |
| **Safe Areas** | `react-native-safe-area-context`| `~5.7.0` | **Mandatory** across all notch / status-bar screens |
| **Icons** | `@expo/vector-icons` | `^15.0.2` (Ionicons) | Universal iconography across all portals |

---

## 4. Strict AI Directives (CRITICAL)

Both Antigravity AI instances must strictly enforce these instructions on every prompt:

1. **Mandatory Pre-Flight Check:** Read this `context.md` file before proposing any architectural design, file creation, or code modifications.
2. **Preserve Logic Contracts (`restaurantStore.ts`):**
   * Never delete or arbitrarily rename existing properties in `Table`, `Ticket`, `MenuItem`, `Customer`, or `Invoice`.
   * When triggering store actions, always honor the `isApplyingRemoteUpdate` circuit breaker and debounce timers to prevent infinite WebSocket broadcast ping-pong loops.
3. **Safe Area & Mobile-First Constraints:**
   * **NEVER** import `SafeAreaView` from `'react-native'`. Always import from `'react-native-safe-area-context'`.
   * All clickable buttons, touch targets, and icons must have a minimum bounding box of 36×36px with `hitSlop` where necessary.
   * Support responsive breakpoints using `useWindowDimensions()` (`const isMobile = width < 768`).
4. **React 19 Hook Purity:**
   * Do NOT execute impure calls like `Math.random()` or `Date.now()` during render passes or directly inside JSX. Compute them in event handlers, store actions, or initialize them inside `useState(() => ...)`.
5. **Continuous Native Generation (CNG):**
   * Do not touch or create `ios/` or `android/` folders. All configuration must be declared via [app.json](file:///c:/Users/Shekhani%20Laptops/.gemini/antigravity-ide/scratch/SultanResturant/app.json).
6. **Code Quality Gate:**
   * Run and confirm TypeScript verification before marking any task as complete:
     ```bash
     npx tsc --noEmit
     ```
   * All reported type mismatches or missing properties must be resolved cleanly without suppressing them.

---

## 5. Project Structure / File Routing

```text
[project-root]/
├── AGENTS.md                   # Expo & CLI rules
├── context.md                  # THIS FILE - Shared team AI memory
├── package.json                # Dependencies, scripts, and Expo config
├── tsconfig.json               # TypeScript pathing & strict flags
├── server.js                   # Central LAN WebSocket Sync Server (Port 5050)
├── server-data.json            # Local persisted server JSON database
├── assets/                     # Logos, branding images, splash screen
└── src/
    ├── app/                    # File-based navigation routes (Expo Router)
    │   ├── _layout.tsx         # Root layout (Stack, Sync init, Splash screen)
    │   ├── index.tsx           # Customer landing & role gateway
    │   ├── login.tsx           # Staff PIN & Role authentication screen
    │   ├── menu/               # Customer Digital Menu
    │   │   └── index.tsx       # Public menu catalog
    │   ├── admin/              # Admin Portal (Full system management)
    │   │   ├── _layout.tsx     # Admin header & navigation tabs
    │   │   ├── dashboard.tsx   # Real-time analytics, revenue, KOT stats
    │   │   ├── pos.tsx         # Full-featured POS terminal (Dine-In, Takeaway, Split Bill)
    │   │   ├── menu.tsx        # Menu dishes & category editor
    │   │   ├── tables.tsx      # Table setup & seating layout
    │   │   ├── staff.tsx       # Staff credentials, shifts, & PIN codes
    │   │   ├── customers.tsx   # CRM customer history & ledger
    │   │   └── reports.tsx     # Financial, sales, & shift audit reports
    │   ├── waiter/             # Waiter Mobile Portal (Floor & Orders)
    │   │   ├── _layout.tsx     # Waiter header & logout controls
    │   │   ├── index.tsx       # Visual table floor grid (Cooking / Ready indicators)
    │   │   └── order/
    │   │       └── [tableId].tsx # Dual-tab Running Order & Add-on Cart
    │   ├── kitchen/            # Kitchen Display System (KDS)
    │   │   ├── _layout.tsx     # Fullscreen landscape KDS wrapper
    │   │   └── kds.tsx         # Live KOT queue, Audio chimes, Add-on gold badges
    │   ├── playland/           # Sultan Basement Playland & Rides POS
    │   │   ├── _layout.tsx     # Playland header, cashier status & logout
    │   │   └── index.tsx       # Ride catalog, ticket checkout, wristband printer & gate punch
    │   └── manager/            # Manager Portal (Floor & Shifts)
    │       ├── _layout.tsx     # Manager navigation
    │       ├── dashboard.tsx   # Operations overview
    │       ├── pos.tsx         # Manager checkout terminal
    │       ├── floor-plan.tsx  # Floor status viewer
    │       ├── shift.tsx       # Cash drawer & shift float balancing
    │       └── inventory.tsx   # Ingredient & stock management
    ├── components/             # Reusable modular UI elements
    │   ├── SyncStatusBadge.tsx # WebSocket status indicator pill (Online/Connecting/Offline)
    │   ├── Invoice.tsx         # Thermal printable receipt generator
    │   ├── OrderSlip.tsx       # Kitchen & Juice Bar printable KOT slips
    │   └── SultanLogo.tsx      # Scalable Sultan emblem & branding component
    ├── services/               # External network & hardware bridges
    │   ├── syncService.ts      # WebSocket client, auto-reconnect, IP detection
    │   └── firebase.ts         # Google Firebase Realtime Database cloud sync
    └── store/                  # Zustand state management
        ├── authStore.ts        # Staff sessions, PIN validation, active roles
        ├── restaurantStore.ts  # Tables, Tickets, Menu, Invoices, Customers
        ├── opsStore.ts         # Inventory, stock movements, expenses, sold-out items
        ├── playlandStore.ts    # Basement Jhoolay rides, tickets, passes, gate punching
        └── storage.ts          # Cross-platform persistent storage adapter
```

---

## 6. Current Status & Dynamic Work Log

### 🟢 Completed Milestones:
* [x] **Foundation & Role-Based Routing:** Full separation of Admin, Manager, Waiter, and Kitchen portals.
* [x] **Safe-Area Navigation & Mobile Layout:** Fixed top header notch clipping across all layout screens with responsive touch targets.
* [x] **Central LAN Sync Hub:** Multi-device synchronization engine (`server.js` on port `5050`) syncing tickets, tables, and reservations across phones, tablets, and laptops.
* [x] **Table Service Add-On Order Flow:** Re-opening occupied tables shows live running orders; waiters can dispatch Add-on items (Round 2, 3...) without losing previous order data.
* [x] **KDS Audio & Visual Add-On Alerts:** Web Audio chime alerts, top banner notifications, and gold border highlights for follow-up kitchen orders.
* [x] **POS Terminal & Receipt Generation:** Complete order checkout, discount/tax calculations, split payments, and thermal receipt template.
* [x] **KDS Bump Protection & Paid Table Release Prompt:** Addressed ticket bounce loop; POS now prompts whether to release table immediately or keep seated after payment.
* [x] **Table Transfer & Merge Engine:** Live order transfer from one table to any available table with automatic KOT re-routing; Table merging combines running tabs and orders cleanly.
* [x] **Advance Table Reservation System:** Booking management with Guest Name, Phone, Date, Time Slot, Party Size, Notes, and one-tap Seating Check-in integrated into Admin and Manager Floor Plan.
* [x] **Branding & Logo Transparency:** Fixed background color mismatch between screen container and logo by generating a clean transparent PNG (`assets/images/sultan-logo.png`) and unifying background to Sultan Royal Burgundy (`#52171B`).
* [x] **Manager Floor Plan Settings & Move Mode:** Managers can Add Table, Edit Table, Delete Table, and toggle live "Move Tables" mode with floating D-Pad controller and shape switchers (`square`, `round`, `rectangle`). Multi-table reservation merging with live capacity checks and Auto-fit integrated.
* [x] **Sultan 5-Floor Command Center & Multi-Level Operations:** Real-time multi-level command center specifically customized for Sultan Restaurant's 5 floors (`Ground Floor`, `1st Floor Family Dining`, `2nd Floor Banquet Hall`, `3rd Floor Executive VIP Lounge`, and `Rooftop BBQ & Sky Lounge`) with live occupancy metrics, running bill totals, floor-by-floor table inspection, and 1-tap Sultan 5-floor template generation (`src/screens/FloorOverviewScreen.tsx`, accessible via `/manager/floors` and `/admin/floors`).
* [x] **Guest Service Requests & Digital Bells Decommissioned:** Removed unused Guest Service Bell and Call Waiter routes, screen components, and header notification badges to keep the workflow lean and focused.
* [x] **Chef 86 / Sold-Out Item Manager:** Kitchen 1-tap item availability manager allowing chefs to instantly mark ingredients or dishes as unavailable/sold out with category filters and instant live sync across POS terminals and ordering devices (`src/screens/ItemAvailabilityScreen.tsx`, accessible via `/kitchen/availability` with header toggle in Kitchen KDS).
* [x] **Shift Daily Cash Expenses Ledger & Live P&L:** Cash drawer outflow recording for groceries, meat & poultry, dairy, charcoal/gas, maintenance, and utility expenses with payment method tags (`cash`/`online`), live calculation of Net Shift Margin (Today's Sales - Cash Expenses = Net Profit), and transaction deletion protection (`src/screens/ExpensesScreen.tsx`, accessible via `/manager/expenses` and `/admin/expenses`).
* [x] **Executive Business Insights & Floor Analytics:** Multi-dimensional revenue analytics breaking down sales across each of the 5 dining floors, hourly order volume peak heatmaps (12 PM - 12 AM), top-selling menu items leaderboard, and average ticket size tracking (`src/screens/BusinessInsightsScreen.tsx`, accessible via `/admin/insights`).
* [x] **Conflict-Free Modular Store Architecture (`opsStore.ts`):** Complete operations store isolated in `src/store/opsStore.ts` with dedicated types and LAN hub sync support in `server.js` (`serviceRequests`, `inventory`, `stockMovements`, `expenses`, `feedback`, `unavailableItemIds`), preventing any merge conflicts with concurrent table/floor work by the other developer.
* [x] **Multi-Station KDS Routing & Station Filters:** Separate Main Kitchen and Juice Bar station routing in KDS with category filtering, real-time ticket isolation, and bump bar updates.
* [x] **Item Variants & Sizing UI:** Support for multi-variant menu items (e.g. Pizza sizes, weights, add-ons) with optional main price fallback in POS and Waiter ordering modals.
* [x] **Authentic Sultan Royal Branding & Scaled Emblem System:** Integrated high-resolution authentic Sultan Restaurant logo ([SultanLogo.tsx](file:///c:/Users/Shekhani%20Laptops/.gemini/antigravity-ide/scratch/SultanResturant/src/components/SultanLogo.tsx)) with scalable size map presets (`xs` 32px, `sm` 46px, `md` 84px, `lg` 130px, `xl` 200px, `hero` 380px), prominent dimensions across landing and login screens, gold badge housing, and Islamic corner latticework canvas ([IslamicBackground.tsx](file:///c:/Users/Shekhani%20Laptops/.gemini/antigravity-ide/scratch/SultanResturant/src/components/IslamicBackground.tsx)).
* [x] **Modal Popup Login & Zero-Scroll Role Gateway:** Replaced vertical scroll expansion on role card selection with an elegant Royal Modal popup. Clicking any role (Admin, Manager, Waiter, Kitchen, Juice Bar, Playland) triggers a centered credential modal with 1-tap profile selection pills, name input, PIN visibility toggle, and instant portal entry without shifting the background layout.
* [x] **Sultan Basement Playland, Jhoolay & Ticketing POS (`src/app/playland/*`):** Dedicated basement kids playland and amusement ticketing operations suite. Includes multi-category ride catalog (Jhoolay/Rides, Toddler Soft Play, 9D VR Cinema, Arcade Tokens, Super Passes), 1-tap cart & wristband color picker, thermal receipt & barcode admissions printer modal, gate entry punching/validator tab, and live daily ridership/sales analytics (`src/store/playlandStore.ts`).
* [x] **Cloud & Hybrid Real-time Sync Engine (`syncService.ts` & `server.js`):** Fully upgraded sync architecture supporting Cloud Deployments (Render.com, Railway via `wss://` and `https://`) alongside local LAN Wi-Fi hubs. Automatically handles HTTPS Mixed-Content rules, Netlify domain isolation, bi-directional sync of both `restaurantStore` and `opsStore` (sold-out items, expenses, inventory), and dynamic server URL configuration.
* [x] **Firebase Realtime Cloud Database Integration (`src/services/firebase.ts`):** Complete serverless cloud database integration powered by Google Firebase Realtime Database (`sultan-resturant-default-rtdb`). Allows Netlify static deployments to sync live across devices (orders, tables, KOTs, expenses). Verified live connection and successfully seeded initial 5-floor restaurant layout, menu items, and staff credentials to the cloud database.
* [x] **Interactive Inventory & Raw Materials Management Suite (`src/screens/InventoryScreen.tsx`):** Comprehensive raw ingredients, pantry materials, and dishes inventory control. Features live Asset Valuation KPIs, categorized catalog (`Meat`, `Produce`, `Grains`, `Dairy`, `Pantry`, `Beverages`, `Fuel`, `Packaging`, `Supplies`), stock-level progress bars and warning alerts, 1-tap WhatsApp supplier dialing, instant Stock In/Out movement logger (Receive `+`, Kitchen Usage `-`, Wastage `-`, Audit `=`) with persistent audit trail, and cooked dishes stock portion incrementers accessible via `/admin/inventory` and `/manager/inventory`.
* [x] **Sultan Supplier & Vendor Management Suite (`src/screens/SuppliersScreen.tsx`):** Complete enterprise-grade raw material vendor and procurement system accessible via `/admin/suppliers` and `/manager/suppliers`. Includes 9 food/supply categories (`Meat & Poultry`, `Fresh Produce`, `Dairy & Bakery`, `Grains & Spices`, `Beverages`, `Fuel & Charcoal`, `Packaging`, `Cleaning Supplies`), live Outstanding Payables & Lifetime Purchase KPIs, 1-tap WhatsApp direct ingredient reordering, Call supplier shortcut, full Purchase Order (PO) invoice creation with auto-receipt into Inventory and auto-record into Daily Cash Expenses, vendor payment settlements with balance adjustment, and comprehensive supplier ledger statement.
* [x] **Sultan Kitchen Operations & Recipe BOM Suite (5 Integrated Modules):**
  1. **Module 1: Store Inventory to Head Chef Handover & Requisition (`src/screens/KitchenHandoverScreen.tsx`):** Tracks store on-hand stock ("inventory kitna hai"), drafts shift requisitions using par levels and last 3 days average usage, issues ingredients to Head Chef with automatic deduction from store inventory, records initial Hand Cash ("hand cash kitna hoa"), and manages mid-shift emergency top-ups.
  2. **Module 2: Recipe Bill of Materials (BOM) System (`src/screens/RecipeManagerScreen.tsx`):** Complete dish and variant ingredient configuration with exact gram weights/measures (`g`, `kg`, `ml`, `L`, `pcs`), trimming/wastage %, default taste spice tuning %, packaging cost allocation, and live cost calculation based on current store purchase rates. 1-tap starter recipe seeder included.
  3. **Module 3: Chef Day Operations Console (`src/screens/ChefDayConsoleScreen.tsx`):** Head Chef tablet/command console with live kitchen on-hand inventory table (issued + top-up + local bought - auto KOT theoretical consumed - manual adjustments), color-coded stock health badges (OK, Low <20%, Depleted), interactive "Taste & Masala Up/Down" adjustment modal ("taste uper neeche misala uper neeche") with 8 reason categories, local market petty cash purchase logger, and End-of-Day (EOD) physical count submission.
  4. **Module 4: End of Day Physical Returns & Restock Approval (`src/screens/KitchenReturnsScreen.tsx`):** GM / Admin closing verification console. Reconciles Hand Cash (handed over - market expenses = expected vs actual returned), audits ingredient physical counts against theoretical expected counts with monetary variance calculation (Rs.), and features a 1-tap "Approve & Restock Store" action that restores remaining physical items back into Store Inventory (`opsStore.inventory`).
  5. **Module 5: Dish Food Costing & Profit Margin Engine (`src/screens/CostingScreen.tsx`):** Dish-by-dish margin breakdown (prime ingredient cost from BOM + packaging + kitchen overhead % allocation vs menu sale price), profitability KPIs (Average Food Cost %, Gross Margin %, Top 3 Profit Heroes), target margin simulator, and 1-tap "Apply Price to Menu" that synchronizes updated prices and cost prices across POS terminals live.
  - **Shared Navigation & Architecture:** Integrated interactive 5-tab top bar (`src/components/KitchenOpsNav.tsx`), unified sync across WebSocket, SSE, and Firebase in `server.js` and `syncService.ts`, clean TypeScript typing (`src/types/kitchen.ts`, `src/utils/kitchenMath.ts`), and zero compilation errors.

### 🟡 Active Tasks (In Progress):
* **Developer A & B Collaboration:** Netlify Redeployment & Multi-Device Live Production Testing.
* **Offline Queue & Reconnection Resilience:** Ensuring offline POS ticket queue synchronizes smoothly when reconnecting to LAN WebSocket hub.

### 🔴 Next Up / Backlog:
* [ ] Hardware thermal printer ESC/POS network & Bluetooth protocol.
* [ ] Customer loyalty points and discount coupon redemption engine.
* [ ] Kitchen bump bar physical USB/Bluetooth keycode bindings.

### ⚠️ Known Gotchas & Architectural Watch-outs:
* **Web Audio Autoplay Policy:** Browsers require an initial user interaction (click/touch) before playing Web Audio chimes; KDS includes a manual "Chime Test" trigger in the top bar.
* **WebSocket IP Binding:** When running on local Wi-Fi, ensure `server.js` IP in `syncService.ts` matches the host computer's IPv4 address (`192.168.x.x`).
* **Table Transfer Synchronization:** When a table is transferred, KDS tickets are automatically remapped to the target table name and ID so the kitchen serves the right station.
* **Cross-Tab Broadcast Echo:** Do not trigger store sync broadcasts when applying updates received from `BroadcastChannel` or the WebSocket server (guarded by `isApplyingRemoteUpdate`).
* **Table Positioning:** Floor coordinates (`x`, `y`) and `shape` are stored on the `Table` model so any repositioning done in Move Mode is persisted and synced across devices.
* **Merge Hygiene:** After resolving any git conflict, run `git grep -n "<<<<<<<\|>>>>>>>"` BEFORE `git add`/commit to make sure no conflict markers remain.
