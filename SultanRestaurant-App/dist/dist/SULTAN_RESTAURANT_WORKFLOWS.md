# 👑 SULTAN RESTAURANT & BASEMENT PLAYLAND
## Complete System Workflows, Operations & Architectural Blueprint

> **Document Classification:** Master Operational Manual & Technical Workflow Architecture  
> **Target Audience:** Restaurant Owners, General Managers, Cashiers, Floor Captains, Chefs, IT Administrators  
> **Platform Version:** 2.0.0 (Expo Managed / React Native Web, iOS & Android)  
> **Sync Architecture:** Dual-Engine (Local Wi-Fi LAN WebSocket Port `5050` + Cloud Firebase Realtime Database)

---

## Executive Summary & System Philosophy

**Sultan Restaurant & Basement Playland Management Suite** is an enterprise-grade, offline-capable, cross-platform restaurant operating system. It merges full-service dine-in hospitality, multi-station kitchen display routing, high-throughput cashier POS, amusement ride ticketing, inventory procurement, and double-entry vendor khata ledger into one unified real-time ecosystem.

```mermaid
flowchart TD
    subgraph Operations["Front-of-House (Guest Experience)"]
        G[Guest Arrives] -->|Seating| TP[Table Floor Blueprint]
        TP --> W[Waiter / Captain Tablet]
        W -->|Take Order| KOT[Digital KOT Generator]
        G -->|Basement Entrance| PL[Playland POS & Wristband Issuance]
    end

    subgraph Kitchen["Heart-of-House (Food Production)"]
        KOT -->|Food Routing| KKDS[Main Kitchen KDS]
        KOT -->|Beverages Routing| JKDS[Juice Bar & Shake KDS]
        KKDS -->|Bump Bar| RDY[Order Ready for Pickup]
        JKDS -->|Bump Bar| RDY
    end

    subgraph Settlement["Checkout & Financial Audit"]
        RDY --> POS[Cashier POS Billing]
        POS -->|Invoice Settlement| SHIFT[Live Shift & Cash Drawer]
        SHIFT --> EXP[Cash Expenses Outflow]
        POS --> REC[BOM Auto-Inventory Deduction]
    end

    subgraph BackOffice["Supply Chain & Management Control"]
        REC --> INV[Inventory & Stock Monitor]
        INV -->|Low Stock Alert| SUP[Supplier Procurement & PO]
        SUP --> LEDGER[Vendor Khata Ledger & Payments]
        LEDGER --> FIN[P&L Reports & Business Insights]
    end
```

---

## 1. User Roles & Permission Matrix

The application enforces role-based access control (RBAC) ensuring operational security and privacy:

| Role | Access Level | Primary Working Interfaces | Key Permissions & Constraints |
| :--- | :--- | :--- | :--- |
| **Executive Admin (Owner)** | Full Universal Access | All Admin Routes (`/admin/*`) | Full financial audit, employee salaries, vendor ledger settlements, role delegation, pricing overrides, cloud database resets. |
| **Branch Manager** | Operational Supervisor | Manager Portal (`/manager/*`) | Shift management, opening floats, kitchen handover approvals, voids & returns approvals, petty cash expenses, stock adjustments. |
| **Floor Captain / Waiter** | Order Taker (Mobile) | Waiter Portal (`/waiter/*`) | Visual table occupancy, round order firing, customer seating, bill print requests. *Cannot void bills or see restaurant net margins.* |
| **Head Chef / Kitchen** | Food Production | Kitchen KDS (`/kitchen/kds`), Handover | Order timers, bump bar clearing, ingredient availability (Chef 86), shift raw meat marination handover. |
| **Juice Bar Barista** | Beverage Production | Juice Bar KDS (`/juicebar/kds`) | Drinks, shakes, ice-creams, and dessert tickets expediting. |
| **Cashier / POS Operator** | Billing & Invoicing | POS Terminal (`/admin/pos`, `/manager/pos`) | Invoice generation, split payments (Cash, Card, Online Transfer), discount codes, thermal receipt printing. |
| **Playland Operator** | Amusement Admissions | Playland Hub (`/admin/playland`) | Ride tokens, wristband barcode issuance, single/unlimited passes, amusement ride gate puncher. |

---

## 2. Floor Plan & Table Management Workflow

### Multi-Floor Architecture
The restaurant features a 5-tier floor configuration:
1. **Basement (Playland & Family Dining):** Amusements, family booths, jhoolay queue seating.
2. **Ground Floor (Main Family Dining Hall):** High-traffic central hall, private curtains, large family tables.
3. **1st Floor (Executive Hall):** Banquet seating, corporate dinner setups, sound-isolated cabins.
4. **2nd Floor (Rooftop Open-Air Garden):** Bar B Q live pits, open-sky seating, evening rush tables.
5. **Private VIP Lounges:** Dedicated butler service, reservation-only dining.

```mermaid
stateDiagram-v2
    [*] --> Available : Floor Reset / Cleaning Done
    Available --> Reserved : Advance Booking Confirmed
    Available --> Occupied : Guest Seated & Captain Assigned
    Reserved --> Occupied : Guest Arrives & Check-in
    Occupied --> Occupied : Additional KOT Rounds Fired
    Occupied --> Billed : Bill Requested by Captain
    Billed --> Cleaning : Cashier Settles Invoice
    Cleaning --> Available : Housekeeping Clears Table
```

### Key Operational Rules:
- **Table Merge (جوائنٹ ٹیبل):** Two adjacent tables can be combined for large parties, unifying their KOT tickets and bills into a single invoice.
- **Table Transfer (ٹیبل منتقلی):** Guests changing floors or seating zones transfer their running bill seamlessly without canceling existing kitchen tickets.
- **Visual Status Color Codes:**
  - 🟢 **Available (Green):** Clean and ready for seating.
  - 🔴 **Occupied (Red):** Dining with active unpaid bill.
  - 🟡 **Reserved (Amber):** Reserved with guest arrival time countdown.
  - 🔵 **Billed (Blue):** Bill printed; waiting for cashier payment.
  - 🟣 **Dirty / Cleaning (Purple):** Awaiting housekeeping turnaround.

---

## 3. Waiter Digital Order-Taking Workflow

```mermaid
sequenceDiagram
    autonumber
    actor Guest
    actor Waiter as Captain / Waiter
    participant App as Waiter Mobile App
    participant Sync as Local LAN WebSocket Hub
    participant KDS as Kitchen & Juice Bar KDS
    participant POS as Cashier POS

    Guest->>Waiter: Calls Waiter to Place Order
    Waiter->>App: Taps Table on Blueprint Screen
    App->>Waiter: Opens Visual Menu with Variants & Add-ons
    Waiter->>App: Selects Dishes (e.g. 1kg Mutton Karahi, Garlic Naan, Mint Margarita)
    Waiter->>App: Inputs Special Instructions ("Less spicy", "No ice")
    Waiter->>App: Taps "FIRE ORDER TO KITCHEN"
    App->>Sync: Broadcasts New KOT Payload
    Sync->>KDS: Routes Food to Kitchen KDS & Drinks to Juice Bar KDS
    Sync->>POS: Updates Live Table Bill Accumulator
    KDS-->>Waiter: Chime Alert & Order Status: "Preparing"
```

### Edge-Case Handling:
- **Offline Resilience:** If Wi-Fi briefly drops, orders queue locally in device storage and auto-fire with retry backoff as soon as reconnection occurs.
- **Multi-Round Orders (راؤنڈ آرڈرز):** Starters, Main Course, and Desserts are tagged by round number (`Round 1`, `Round 2`) so the kitchen delivers food at the proper dining pace.

---

## 4. Kitchen & Juice Bar KDS (Expediting Workflow)

```mermaid
flowchart LR
    A[KOT Received via WebSocket] --> B{Category Filter}
    B -->|Karahi, BBQ, Rice, Breads| C[Kitchen KDS Display]
    B -->|Juices, Shakes, Tea, Desserts| D[Juice Bar KDS Display]
    
    C --> E[Ticket Urgency Timer]
    D --> E
    
    E -->|< 10 min| F[Normal Status - Green]
    E -->|10 - 20 min| G[Urgent Status - Amber Alert]
    E -->|> 20 min| H[Delayed Status - Red Flashing]
    
    F --> I[Chef Hits BUMP BAR]
    G --> I
    H --> I
    I --> J[Order Ready for Runner Pickup]
```

### KDS Capabilities:
- **Audio Chime:** Custom royal chime plays on incoming tickets to alert busy line chefs.
- **Urgency Highlights:** Tickets change colors dynamically as the elapsed preparation time increases.
- **Chef 86 (Out of Stock Switch):** If an ingredient finishes mid-service, the head chef toggles the dish off on the KDS console, instantly disabling it across all waiter tablets and customer QR menus.

---

## 5. Point of Sale (POS) & Billing Workflow

```mermaid
flowchart TD
    A[Table Requests Bill or Counter Customer Arrives] --> B{Order Channel}
    B -->|Dine-In| C[Fetch Table Open KOTs]
    B -->|Takeaway| D[Quick Counter Cart Selection]
    B -->|Home Delivery| E[Caller ID / Customer Phone Lookup]
    
    C --> F[Review Bill Items & Taxes]
    D --> F
    E --> F
    
    F --> G{Discount Requested?}
    G -->|Yes| H[Apply Promo Code / Percentage / Manager Override PIN]
    G -->|No| I[Calculate Net Payable]
    H --> I
    
    I --> J{Tender Payment Mode}
    J -->|Cash| K[Enter Cash Received -> Calculate Change Due]
    J -->|Card / POS Machine| L[Enter Terminal Approval Code]
    J -->|Online Bank Transfer| M[Verify Transaction Reference / IBAN]
    J -->|Split Tender| N[Divide between Cash + Card/Online]
    J -->|Customer Khata| O[Debit to Registered Customer Ledger]
    
    K --> P[Close Invoice & Print 80mm ESC/POS Thermal Receipt]
    L --> P
    M --> P
    N --> P
    O --> P
    
    P --> Q[Auto-Deduct Raw Inventory BOM]
    P --> R[Generate WhatsApp Digital Receipt & Feedback QR Code]
```

---

## 6. Basement Playland & Amusement Park Workflow

The Sultan Restaurant basement houses an indoor family amusement park with 6 signature rides:
1. **Royal Carousel (گھوڑوں والا جھولا)**
2. **Dragon Mini Roller Coaster**
3. **Bumper Cars Arena (ٹکراؤ گاڑیاں)**
4. **Soft Play Jungle Gym (بچوں کا پلے لینڈ)**
5. **9D VR Virtual Reality Simulator**
6. **Trampoline Bounce Park**

```mermaid
flowchart TD
    A[Family Arrives at Playland Gate] --> B[Playland POS Terminal]
    B --> C{Admission Selection}
    C -->|Single Ride Token| D[Select Specific Jhoola - Rs. 150 - Rs. 300]
    C -->|Unlimited All-Rides Pass| E[Select Wristband All-Day Pass - Rs. 1,200]
    C -->|Combo Meal + Playland| F[POS Bundle Discount Ticket]
    
    D --> G[Issue Thermal Barcode Ticket]
    E --> H[Print & Fasten Waterproof RFID/Barcode Wristband]
    F --> G
    F --> H
    
    G --> I[Gate Attendant Scans / Punches Ticket]
    H --> J[Wristband Scanner Allows Entry]
    I --> K[Live Playland Shift Margin & Revenue Logging]
    J --> K
```

---

## 7. Recipe BOM (Bill of Materials) & Inventory Auto-Burn

Every dish variant in the Sultan Restaurant menu is bound to an exact ingredient formulation (BOM):

```mermaid
flowchart LR
    A[POS Settles 1x Mutton Karahi Full] --> B[Recipe Engine Triggers]
    B --> C[1,000g Fresh Goat Meat Deducted from Cold Storage]
    B --> D[250g Tomatoes Deducted from Vegetable Bin]
    B --> E[60g Desi Ghee Deducted from Cooking Line]
    B --> F[30g Ginger/Garlic Paste Deducted]
    B --> G[15g Sultan Special Masala Blend Deducted]
    
    C --> H{Stock Threshold Check}
    D --> H
    E --> H
    F --> H
    G --> H
    
    H -->|Below Safety Minimum| I[Trigger Low-Stock Audio Warning & Supplier PO Requisition]
    H -->|Above Safety Minimum| J[Inventory Records Updated Silently]
```

---

## 8. Suppliers, Procurement & Double-Entry Khata Ledger

The newly architected **Supplier Ledger & Payments Engine** provides full transparency over procurement and accounts payable:

```mermaid
flowchart TD
    subgraph Procurement["1. Goods Inward & Bill Entry"]
        V[Vendor Delivers Raw Stock] --> PO[Create Purchase Bill in System]
        PO -->|Items, Rates, Freight, Supplier Invoice #| STOCK[Add Raw Stock to Inventory]
        PO -->|Total Bill Amount| DEBIT[Debit to Supplier Khata Ledger]
    end

    subgraph Ledger["2. Running Khata Balance Reconciliation"]
        DEBIT --> BAL[Update Vendor Running Balance]
        BAL --> AUDIT[Audit Trail: Date, Doc #, Items, Balance Due]
    end

    subgraph Settlement["3. Payment Disbursement & Voucher"]
        AUDIT --> PAY[Open Record Payment Modal]
        PAY -->|Amount, Cash/Bank/Cheque, Ref #| CREDIT[Credit Entry to Khata]
        CREDIT --> REDUCE[Deduct Balance from Supplier]
        REDUCE --> EXP[Auto-Log to Daily Operating Expenses]
        REDUCE --> VCH[Generate 80mm Official Payment Voucher]
        VCH --> WA[Instant WhatsApp Statement to Supplier]
    end
```

### Key Ledger Formulas:
$$\text{New Running Balance} = \text{Previous Balance} + \text{Procurement Bill (Debit)} - \text{Payment Voucher (Credit)}$$

---

## 9. Shift Management, Cash Drops & Handover Reconciliation

Every shift operates as an isolated financial audit container:

```mermaid
sequenceDiagram
    autonumber
    actor Mgr as Shift Manager
    participant Sys as Shift Engine
    participant Drawer as Cash Drawer Hardware
    actor Admin as Restaurant Owner

    Mgr->>Sys: Opens Shift with Float Cash (e.g. Rs. 25,000)
    Note over Sys: Live Shift Timer & Real-Time Tracking Starts
    Sys->>Sys: POS Live Inflow (Cash, Card, Online)
    Sys->>Sys: Cash Drawer Deductions (Vendor Payments, Petty Expenses)
    Mgr->>Sys: Records Mid-Shift Safe Drop (e.g. Rs. 100,000 to Safe)
    Note over Mgr,Sys: End of Day / Shift Closeout
    Mgr->>Sys: Counts Physical Cash in Drawer & Enters Actual Total
    Sys->>Sys: Computes Discrepancy: (Actual Cash - Expected Cash)
    alt Discrepancy == 0
        Sys->>Mgr: Balanced Shift (حساب برابر ہے)
    else Discrepancy > 0
        Sys->>Mgr: Cash Excess / Surplus Alert (+Rs. X)
    else Discrepancy < 0
        Sys->>Mgr: Cash Shortage Warning (-Rs. X)
    end
    Sys->>Admin: Auto-Generates Executive Shift Summary & WhatsApp P&L Report
```

---

## 10. Kitchen Handover, Wastage & Returns Control

To prevent food leakage, shrinkage, and theft between day and night brigades:
- **Raw Marination Handover (مارینیشن ہینڈ اوور):** Morning chef weighs and records prepared meats (e.g. 50kg Chicken Tikka, 30kg Malai Boti, 25kg Mutton Chops). The incoming evening chef must verify and digitally accept the weights.
- **Sales Returns (سیلز ریٹرنز):** If a customer rejects a dish due to spice level or delay, manager approval PIN is required to void the ticket.
- **Damage Control:** Spoiled, burnt, or dropped food is categorized by root cause and deducted from gross kitchen yield to analyze monthly wastage costs.

---

## 11. Dual-Engine Real-Time Sync Architecture

```mermaid
graph TD
    subgraph LAN["High-Speed In-House Local Wi-Fi Network"]
        SERVER["Node.js Local WebSocket Hub (Port 5050)"]
        W1[Captain Tablet 1] <-->|Zero Latency WS| SERVER
        W2[Captain Tablet 2] <-->|Zero Latency WS| SERVER
        K1[Kitchen KDS] <-->|Zero Latency WS| SERVER
        J1[Juice Bar KDS] <-->|Zero Latency WS| SERVER
        P1[Cashier POS Terminal] <-->|Zero Latency WS| SERVER
    end

    subgraph CLOUD["Remote Cloud Backup & Owner Live Telemetry"]
        FIREBASE["Firebase Realtime Database (Cloud DB)"]
        SERVER <-->|Bidirectional Sync| FIREBASE
        OWNER[Owner Mobile App / Remote Web] <-->|Cloud Sync| FIREBASE
    end

    style SERVER fill:#52141C,color:#fff,stroke:#B48214,stroke-width:3px
    style FIREBASE fill:#0284C7,color:#fff,stroke:#38BDF8,stroke-width:2px
```

### High Availability Features:
1. **Zero Internet Dependency:** The restaurant functions 100% locally on local Wi-Fi router. Even if PTCL/StormFiber internet goes down, orders, KDS tickets, and POS billing run without stutter.
2. **Instant Cloud Push:** Whenever the internet is alive, every completed invoice and shift summary syncs to Firebase within milliseconds.
3. **Loop Prevention:** The sync engine uses `isApplyingRemoteUpdate` flags and unique transaction IDs to guarantee zero infinite-broadcast ping-pong loops.

---

## 12. Quick Reference: System Routes & Screen Directory

| URL Route | Screen Component | Function & Role |
| :--- | :--- | :--- |
| `/` | `index.tsx` | Universal Portal Navigator (Direct one-click role jump) |
| `/login` | `login.tsx` | Secure PIN & biometric authentication |
| `/waiter` | `src/app/waiter/index.tsx` | Waiter Table Selection & Active Floor Map |
| `/waiter/order/[tableId]` | `order/[tableId].tsx` | Captain Order Taking, KOT firing & Modifiers |
| `/kitchen/kds` | `src/app/kitchen/kds.tsx` | Main Kitchen KDS Line Production Display |
| `/juicebar/kds` | `src/app/juicebar/kds.tsx` | Juice, Shake & Mocktail Expediting Display |
| `/admin/dashboard` | `dashboard.tsx` | Executive Command Center & Real-time Operations |
| `/admin/pos` | `POSTerminalScreen.tsx` | Point of Sale Counter, Invoicing & Thermal Printing |
| `/admin/suppliers` | `SuppliersScreen.tsx` | Vendor Registry, Categories & Contact Profiles |
| `/admin/supplier-ledger` | `SupplierLedgerScreen.tsx` | **Dedicated Double-Entry Khata, Bills & Payment Vouchers** |
| `/admin/shift` | `ShiftManagementScreen.tsx` | Cash Drawer Reconciliation, Safe Drops & Shifts |
| `/admin/inventory` | `InventoryScreen.tsx` | Raw Stock Levels, Inward/Outward Logs & Thresholds |
| `/admin/menu` | `menu.tsx` | Food Menu Catalog, Category Tree & Pricing |
| `/admin/recipes` | `RecipeManagerScreen.tsx` | Recipe BOM Formulations & Stock Depletion Ratios |
| `/admin/costing` | `CostingScreen.tsx` | Dish Ingredient Costing Engine & Food Cost Margins |
| `/admin/playland` | `playland.tsx` | Basement Amusement Jhoolay Admissions & Passes |
| `/admin/reports` | `reports.tsx` | Comprehensive Financial Audits, Sales & P&L |
| `/admin/customers` | `customers.tsx` | Customer CRM, Delivery Records & Caller ID |
| `/admin/staff` | `staff.tsx` | Employee Attendance, Duty Rosters & Payroll |

---

## Summary of Operations Flow
By connecting every station—from the basement playland gate to the top-floor executive suite—the Sultan Restaurant software provides a fully closed operational loop where:
- Orders never get lost.
- Recipes automatically deplete stock.
- Cash drawers always balance.
- Suppliers' khatas are accurate to the single rupee.
- The owner maintains complete visibility across local and cloud channels.
