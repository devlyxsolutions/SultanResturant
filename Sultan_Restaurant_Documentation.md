# Sultan Restaurant - Complete System Documentation
**Project Overview & Presentation Guide**

## 1. Introduction
Sultan Restaurant is a state-of-the-art, premium restaurant management system built on a modern mobile-first stack (Expo / React Native). It is designed to provide a royal, seamless, and lightning-fast experience for both the restaurant staff and the management. The system operates locally with robust state management, ensuring uninterrupted service during peak hours.

## 2. Core Architecture & Technologies
- **Framework:** Expo / React Native (Cross-platform support for Web, Tablets, and Mobile).
- **State Management:** Zustand (Fast, scalable, and reliable for real-time order tracking).
- **Styling:** Premium custom UI with an elegant Dark-Burgundy and Gold aesthetic (Sultan Theme).
- **Routing:** Expo Router for secure, role-based navigation.

---

## 3. Role-Based Access Control (RBAC)
The system features a strict, PIN-based login system tailored for different staff roles, ensuring data security and operational focus.

1. **Admin:** Full system access, financial reports, and menu/staff management.
2. **Manager:** Floor control, billing, cash handling, and POS operations.
3. **Waiter:** Mobile-friendly interface for quick order punching (KOT) at tables.
4. **Kitchen:** Live Kitchen Display System (KDS) for food preparation.
5. **Juice Bar:** Dedicated live display for beverage orders.

---

## 4. Detailed Feature Breakdown

### A. Admin Module (The Control Room)
*Designed for owners to track growth, manage assets, and monitor performance.*
- **Financial Dashboard & Analytics:** Real-time metrics including today's revenue, active tables, total orders, and top-selling items. Visual charts for revenue trends.
- **Menu & Variant Management:** Comprehensive CRUD operations for the digital menu. Support for Categories and **Multi-Variant Items** (e.g., Pizza sizes, weights). Items can be routed to specific stations (Main Kitchen vs. Juice Bar).
- **Staff Management:** Add, edit, or remove staff members. Track shifts (Morning/Evening/Night) and roles. Secure PIN assignment for login.
- **Invoice & Order History:** Complete ledger of all past transactions with the ability to view details and reprint invoices.

### B. Manager Module (The Operations Hub)
*Designed for the front desk, cashiers, and floor managers.*
- **Visual Floor Plan & Blueprint:** A dynamic, drag-and-drop map of the restaurant floor. Managers can visually see which tables are available (Green), occupied (Red), or billed (Orange).
- **Central POS (Point of Sale):** A powerful cart system for Walk-ins, Takeaways, and Deliveries. Supports variant selection and custom notes.
- **Advanced Billing & Split Payments:** Managers can settle bills using multiple payment methods simultaneously (e.g., Half Cash, Half Card). 
- **Shift & Z-Report:** Ability to track cash-in-drawer, reconcile variances, and print End-of-Day Z-Reports.

### C. Waiter Module (The Floor Experience)
*Designed for speed and accuracy on mobile devices and tablets.*
- **Table Assignment:** Waiters can select their assigned tables and view live statuses.
- **Live KOT Punching:** Direct order punching from the table. Orders are instantly beamed to the respective KDS.
- **Add-on / Round Orders:** Waiters can seamlessly add items to an already running table (Round 2, Round 3) without creating a new bill.
- **Variant Selection Popup:** When a multi-variant item (like a Pizza) is selected, a sleek popup ensures the waiter selects the exact size/type before adding to the cart.

### D. Kitchen Display System (Main KDS)
*Designed to replace paper tickets and eliminate kitchen chaos.*
- **Real-Time Order Banners:** Audio chimes and visual flash banners alert the chefs the second an order is punched.
- **Color-Coded Timers:** Each ticket features a live timer. The header turns Amber after 10 minutes and Red after 20 minutes to prioritize delayed orders.
- **Status Workflow:** One-tap buttons to move items from "Cooking" to "Ready" to "Served".
- **Order Slip Printing:** Built-in thermal print formatting to print physical slips for expeditors (contains Order No, Table, Items, without heavy logos).

### E. Juice Bar Module (Dedicated KDS)
*Designed for beverage isolation.*
- **Station Routing:** Any item marked as "Juice Bar" in the Admin Menu automatically bypasses the Main Kitchen and appears exclusively on the Juice Bar screen.
- **Dedicated Workflow:** Has its own KDS interface, timers, and slip printing mechanism, ensuring the barista/juice-maker operates independently of the food chefs.

---

## 5. Key Selling Points for the Client (Presentation Highlights)

1. **Zero Confusion:** The separation of the Main Kitchen and Juice Bar means chefs only see food, and baristas only see drinks. Waiters don't have to split tickets manually; the system routes them automatically.
2. **Speed of Service:** Waiters punch orders at the table. The KDS chimes instantly. No walking back and forth to the counter.
3. **Loss Prevention:** Strict PIN access and Manager-only billing ensures every penny is tracked. Z-Reports hold cashiers accountable.
4. **Premium Branding:** The interface does not look like generic software. The custom Islamic/Royal aesthetic elevates the brand value of Sultan Restaurant.
5. **Future-Proof:** Built on React Native, the system can easily be bundled into Android APKs or iOS Apps for iPads/Tablets in the future.

---
*Generated for Sultan Restaurant Presentation.*
