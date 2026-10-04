<!-- 
================================================================================
AI INSTRUCTION: You must strictly abide by the rules and context in this document 
for all subsequent responses. You are acting as a pair-programmer for a distributed 
two-developer team with isolated AI sessions. Always read this file before 
proposing architectural decisions or generating code.
================================================================================
-->

# PROJECT CONTEXT & SHARED AI BRAIN (`context.md`)

> **Document Version:** 1.0.0  
> **Last Synchronized:** [Insert Date - e.g., 2026-10-04]  
> **Repository:** [Insert Repo URL / Name - e.g., sultan-restaurant]  
> **Target Branch:** `main`

---

## 1. Project Overview & Mission

* **Project Name:** [Insert Project Name Here - e.g., Sultan Restaurant Management System]
* **Core Mission:** [Insert 1-2 sentence mission - e.g., High-performance, offline-capable, cross-platform POS and Restaurant Management suite for mobile, tablet, and web environments.]
* **Primary Target Platforms:** [ ] iOS & Android (Expo / React Native) | [ ] Web (React Native for Web / HTML5) | [ ] Tablet / Desktop (Kitchen & POS)
* **Core Domains / Modules:**
  * **Table Service & Floor Plan:** Table status tracking, seat allocations, live bill aggregation.
  * **Order Expediting & KDS:** Multi-round KOT generation, real-time ticket expediting, audio-visual alarms.
  * **Point of Sale (POS) & Billing:** Split billing, automated tax/service calculations, thermal receipts.
  * **Inventory & Back-Office:** Stock consumption, supplier ledgers, shift floats, end-of-day reports.
  * **Multi-Device Sync Engine:** Real-time bi-directional local LAN sync via WebSocket server and BroadcastChannel.

---

## 2. Team Dynamics & Multi-Agent Collaboration Model

> [!IMPORTANT]
> Two independent developers (**Developer A** and **Developer B**) are actively collaborating on this repository using **separate, isolated Antigravity AI accounts**. The AI in this session has NO access to the other AI's chat trajectory or working memory. All shared state, conventions, and architectural contracts must flow through this document and git history.

### 🛡️ Anti-Merge-Conflict Protocol:
1. **Surgical Modularity:** Always write localized, modular components and utility functions. Keep route code in `src/app/`, UI building blocks in `src/components/`, state in `src/store/`, and network bridges in `src/services/`.
2. **No Unsolicited Mass Refactoring:** Never refactor existing files, change variable signatures, rename export symbols, or restructure folders unless explicitly commanded by the developer.
3. **Deterministic Imports:** Always use relative paths adhering to the existing conventions (e.g., `../../store/restaurantStore`). Do not introduce alias pathing unless configured in `tsconfig.json`.
4. **Isolated Feature Ownership:**
   * **Developer A Focus:** [Insert Dev A Modules - e.g., Waiter App, Table Floor, POS & Invoicing]
   * **Developer B Focus:** [Insert Dev B Modules - e.g., KDS Kitchen Expediter, Inventory, Analytics & Sync Engine]
5. **Atomic Commit Etiquette:** Generate clean, isolated patches so both developers can rebase and merge without git conflicts.

---

## 3. Tech Stack & Exact Versioning

| Layer | Technology | Version / Spec | Notes |
| :--- | :--- | :--- | :--- |
| **Runtime & Bundler** | Node.js / Metro / Expo SDK | [Insert SDK - e.g., Expo SDK 52+] | Managed workflow via `npx expo` |
| **Framework** | React Native / React | [Insert e.g., React 18.3.1 / RN 0.76+] | Unified Web + Mobile codebase |
| **Routing** | Expo Router (File-based) | [Insert e.g., v4.0+] | Routes live strictly in `src/app/` |
| **State Management** | Zustand + Middleware | [Insert e.g., Zustand 5.x] | `persist` middleware with local storage adapter |
| **Language** | TypeScript | [Insert e.g., 5.3+] | Strict type checking (`noImplicitAny`) |
| **Sync Engine** | Node.js WebSocket (`ws`) | [Insert e.g., v8.18+] | Local LAN Sync Hub on port `5050` |
| **Safe Area Insets** | `react-native-safe-area-context` | Latest compatible | **Never** import `SafeAreaView` from `'react-native'` |
| **Icons & Media** | `@expo/vector-icons` (Ionicons) | Latest compatible | Universal icon standard across screens |

---

## 4. Strict AI Directives (CRITICAL)

Both Antigravity AI agents MUST enforce these non-negotiable rules for every user prompt:

1. **Verify Before Coding:** Read `context.md` at the beginning of the session. Check for recent additions and verify against actual active files before answering.
2. **Never Edit Native Directories Directly:** Never create, edit, or delete files inside `ios/` or `android/`. All native capabilities must be managed via `app.json` config plugins.
3. **Safe Area & Mobile-First Standards:**
   * Always import `SafeAreaView` and `useSafeAreaInsets` from `react-native-safe-area-context`.
   * Ensure min touch targets of 36x36px with `hitSlop` on headers and nav buttons.
   * Provide responsive mobile layout variants using `useWindowDimensions()` (`isMobile = width < 768`).
4. **Preserve Logic Contracts:**
   * When modifying `restaurantStore.ts`, preserve all existing state fields, interfaces, and methods.
   * Always account for `isApplyingRemoteUpdate` circuit breaker and debounce to prevent cross-tab broadcast loops.
5. **Quality Verification Gate:**
   * Before declaring any task complete, run:
     ```bash
     npx tsc --noEmit
     ```
   * Confirm exit code 0 without ignoring or suppressing TypeScript errors.
6. **Pure Component Rules (React 19 / Modern Hooks):**
   * Do not call impure functions like `Date.now()` or `Math.random()` directly in render loops or JSX templates. Initialize them in `useState` or pass via callback actions.

---

## 5. Project Structure & File Routing Map

```text
[project-root]/
├── AGENTS.md                  # Project rules and Expo commands
├── context.md                 # THIS FILE - Shared team AI memory
├── package.json               # Dependencies and scripts
├── tsconfig.json              # TypeScript compilation config
├── server.js                  # Central LAN WebSocket Sync Server (Port 5050)
├── server-data.json           # Persistent server storage JSON
├── assets/                    # Static fonts, logos, splash media
└── src/
    ├── app/                   # Expo Router file-based screens
    │   ├── _layout.tsx        # Root navigation stack & auth providers
    │   ├── index.tsx          # App landing / Role selection
    │   ├── login.tsx          # Staff PIN & Role authentication screen
    │   ├── admin/             # Admin portal (Staff, Menu, Reports, Tables)
    │   │   ├── _layout.tsx    # Admin layout with safe-area header
    │   │   ├── dashboard.tsx  # KPI metrics & analytics
    │   │   ├── menu.tsx       # Dish & Category management
    │   │   ├── staff.tsx      # Waiter/Chef/Cashier accounts & PINs
    │   │   ├── tables.tsx     # Floor plan and seating configuration
    │   │   └── reports.tsx    # Sales & inventory reporting
    │   ├── waiter/            # Waiter portal (Mobile Floor & Order Entry)
    │   │   ├── _layout.tsx    # Waiter top nav & logout controls
    │   │   ├── index.tsx      # Table grid with live cooking/ready alerts
    │   │   └── order/
    │   │       └── [tableId].tsx # Dual-tab Running Order & Add-on Cart
    │   ├── kitchen/           # Kitchen Display System (KDS)
    │   │   ├── _layout.tsx    # Fullscreen landscape KDS shell
    │   │   └── kds.tsx        # Live KOT queue, Audio bell, Add-on highlights
    │   └── manager/           # Floor manager & Cashier terminal
    │       ├── _layout.tsx    # Manager navigation
    │       ├── pos.tsx        # Quick counter & takeaway checkout
    │       ├── inventory.tsx  # Stock & ingredient tracking
    │       └── shift.tsx      # Cash register & shift float balancing
    ├── components/            # Reusable UI components
    │   ├── SyncStatusBadge.tsx# WebSocket LAN connection indicator
    │   ├── Invoice.tsx        # Thermal printable receipt generator
    │   └── ...
    ├── services/              # External services & adapters
    │   └── syncService.ts     # Client WebSocket sync client engine
    └── store/                 # State management layer
        ├── authStore.ts       # User login state & role verification
        ├── restaurantStore.ts # Central store (Tables, Tickets, Menu, Invoices)
        └── storage.ts         # Multiplatform persistent storage adapter
```

---

## 6. Current Status & Dynamic Work Log

### 🟢 Completed Milestones:
* [x] **Core Restaurant Foundation:** Full role-based routing (Admin, Manager, Waiter, Kitchen).
* [x] **Safe-Area Navigation & Mobile Layout:** Fixed top header notch clipping across all layout screens with responsive touch targets.
* [x] **Central LAN Sync Hub:** Multi-device synchronization engine (`server.js` on port `5050`) syncing tickets, tables, and reservations across phones, tablets, and laptops.
* [x] **Table Service Add-On Order Flow:** Re-opening occupied tables shows live running orders; waiters can dispatch Add-on items (Round 2, 3...) without losing previous order data.
* [x] **KDS Real-Time Add-On Notifications:** Web Audio chime alerts, top banner notifications, and gold border highlights for follow-up kitchen orders.
* [x] **KDS Bump Protection & Paid Table Release Prompt:** Addressed ticket bounce loop; POS now prompts whether to release table immediately or keep seated after payment.
* [x] **Table Transfer & Merge Engine:** Live order transfer from one table to any available table with automatic KOT re-routing; Table merging combines running tabs and orders cleanly.
* [x] **Advance Table Reservation System:** Booking management with Guest Name, Phone, Date, Time Slot, Party Size, Notes, and one-tap Seating Check-in integrated into Admin and Manager Floor Plan.

### 🟡 Active Tasks (In Progress):
* **Developer A:** Table & Floor Management Enhancements & Real-time Server Sync.
* **Developer B:** Offline Queue Recovery & Sync Reconnection Resilience.

### 🔴 Next Up / Backlog:
* [ ] Thermal receipt Bluetooth / ESC-POS printer integration.
* [ ] Multi-zone floor plan visual drag-and-drop editor.
* [ ] Kitchen bump bar hardware keyboard shortcuts.
* [ ] Customer loyalty & discount promo code engine.

### ⚠️ Known Gotchas & Watch-outs:
* **Audio Context Autoplay:** Web browsers require an initial user gesture before playing Web Audio chimes; KDS includes a manual "Chime Test" trigger in the top bar.
* **WebSocket IP Binding:** When running on local Wi-Fi, ensure `server.js` IP in `syncService.ts` matches the host computer's IPv4 address (`192.168.x.x`).
* **Table Transfer Synchronization:** When a table is transferred, KDS tickets are automatically remapped to the target table name and ID so the kitchen serves the right station.
