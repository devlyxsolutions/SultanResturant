# Sultan Restaurant - Advanced System & Operational Documentation
**Complete Guide for Management, Staff, and Technical Teams**

---

## 1. Executive Summary & Vision
Sultan Restaurant is not just an eatery; it is an experience rooted in premium service and operational excellence. To support this vision, we have developed a bespoke, enterprise-grade Restaurant Management System. This system replaces archaic paper-based workflows with a lightning-fast, digital-first infrastructure. Built on modern technologies (React Native & Zustand), the system provides seamless synchronization between the front-of-house (Waiters, Managers) and back-of-house (Main Kitchen, Juice Bar). The ultimate goal is to reduce wait times, eliminate order errors, and provide deep financial insights to the owners.

---

## 2. Technical Architecture
### 2.1. Mobile-First & Cross-Platform
The application is built using **Expo and React Native**. This means the exact same application can run on:
- Waiters' Android or iOS Smartphones (for mobile order punching).
- Managers' iPads or Android Tablets (for POS and Floor Management).
- Kitchen TVs or Large Touch Displays (for the Kitchen Display System).

### 2.2. State Management & Real-Time Sync (Zustand)
At the core of the application lies **Zustand**, a blazing fast state-management engine. Instead of waiting for slow cloud servers, the app operates heavily on localized state, ensuring that:
- UI updates are instantaneous (e.g., adding an item to the cart happens in 0ms).
- Order Tickets (KOT) are immediately beamed from the Waiter's device to the Kitchen Display System without page reloads.

### 2.3. Design System & Theming
The UI/UX is heavily customized to reflect the brand's identity:
- **Color Palette:** Deep Royal Burgundy (`#52171B`), Sultan Gold (`#D5A943`), and Charcoal Blacks.
- **Micro-interactions:** Smooth animations, swipe gestures, and tactile feedback (haptics) make the app feel premium.

---

## 3. Comprehensive Role-Based Access Control (RBAC)
Security and accountability are paramount. The system uses a strict **PIN-based authentication mechanism** for all staff. Each action is logged against the active user's session.

### Roles Available:
1. **Admin (Owner):** Unrestricted access to financial ledgers, system settings, staff management, and menu configuration.
2. **Manager (Floor Lead):** Access to the Point of Sale (POS), Floor Plan, Table Merging, Split Billing, and Shift Z-Reports.
3. **Waiter (Service Staff):** Restricted to Table Selection and KOT (Kitchen Order Ticket) punching. Cannot generate bills or view revenue.
4. **Kitchen (Head Chef):** Restricted to the Main Kitchen Display System (KDS).
5. **Juice Bar (Barista):** Restricted to the Beverage & Desserts KDS.

---

## 4. Deep-Dive: Module Functionalities

### 4.1. Admin Control Center (Dashboard)
The Admin module acts as the brain of the restaurant. 
- **Financial Analytics Engine:** Real-time calculation of Gross Sales, Tax (GST), and Net Revenue. Displays graphical trends of daily and weekly sales. Identifies the "Top 5 Selling Items" automatically.
- **Dynamic Menu Manager:** Admins can add categories (e.g., Starters, BarBQ) and Items. 
- **Multi-Variant Architecture:** Items can have variants (e.g., Pizza: Small, Medium, Large) or weights (e.g., Mutton Karahi: Half Kg, Full Kg). The Admin sets prices for each variant, ensuring accurate billing.
- **Station Routing Config:** Every menu item is assigned a destination: "Main Kitchen" or "Juice Bar". This ensures that when a waiter orders a Steak and a Mango Shake, the system automatically splits the ticket and sends the Steak to the Kitchen and the Shake to the Juice Bar.
- **HR & Staff Management:** Create profiles for employees, assign roles (Waiter, Manager), and set their 4-digit secure PINs. Track employee statuses (Active, On Leave, Inactive).
- **Historical Ledger:** A complete, searchable database of every invoice ever generated, allowing Admins to audit past transactions.

### 4.2. Manager Hub & POS (Point of Sale)
The Manager's interface is designed for speed and conflict resolution.
- **Interactive Floor Plan (Blueprint):** A 2D visual representation of the restaurant's tables. Managers can see live statuses:
  - **Green:** Table is Empty/Available.
  - **Red (Pulsing):** Table is Occupied (Guests have ordered).
  - **Orange:** Bill has been generated but not paid.
- **Table Operations:** Managers can move tables physically on the screen (Edit Mode), merge two tables for large parties, or transfer a guest from Table A to Table B.
- **Central POS Cart:** A massive touch-friendly menu for walk-in customers or deliveries. Supports custom order notes (e.g., "Less Spicy").
- **Split Payment Gateway:** When generating an invoice, the Manager can split the payment. (Example: A Rs. 5000 bill can be paid as Rs. 2000 Cash and Rs. 3000 Credit Card).
- **End of Day (Z-Report):** At the end of the shift, the Manager generates a Z-Report. This calculates Expected Cash in Drawer, allowing the Manager to input the Actual Cash and the system calculates any Shortage/Overage.

### 4.3. Waiter Terminal (Mobile Experience)
Waiters use smartphones or mini-tablets to take orders at the table.
- **Live Menu Browsing:** Waiters can quickly search or filter the menu by category.
- **Variant Popups:** When a Waiter taps an item like "Pina Colada", a popup asks them to select the size/variant before adding it to the cart. This prevents missing information.
- **Multi-Round Ordering (Add-ons):** If Table 5 has already ordered Starters, and now wants Main Courses, the Waiter simply selects Table 5 again and punches the new items. The system intelligently marks this as "Round 2 (Add-on)" and alerts the kitchen without printing a completely new separate bill.
- **Bill Request:** Waiters can ping the Manager's desk requesting the bill for a specific table.

### 4.4. Main Kitchen Display System (KDS)
The Kitchen screen is a robust, dark-themed dashboard built for high-stress environments.
- **Live Notifications:** When a Waiter punches an order, a loud Chime plays on the Kitchen TV, and a banner flashes on screen.
  - **Green Banner:** Brand new table order.
  - **Orange/Flashing Banner:** Add-on / Urgent item for an already eating table.
- **Color-Coded Timers:** Every ticket has a stopwatch. 
  - 0-10 mins: Normal (Gray)
  - 10-20 mins: Delayed (Amber)
  - 20+ mins: Critical (Red)
- **Status Bumping:** Chefs tap items to mark them "Completed", and tap "BUMP TICKET" to move the order to the "Ready for Pickup" queue.
- **Thermal Slip Printing:** A dedicated "Print Slip" button on every ticket allows the expeditor to instantly print a physical, logo-free receipt containing only the Table No, Waiter Name, and Items to attach to the food tray.

### 4.5. Juice Bar Display System
A completely isolated environment for the beverage department.
- **Traffic Isolation:** The Barista does not see food orders (Burgers, Steaks). They only see items routed to the "Juice" station by the Admin (e.g., Shakes, Teas).
- **Parallel Processing:** This allows the Kitchen and the Juice Bar to prepare their respective items simultaneously, drastically reducing the total service time.
- **Independent Slip Printing:** The Juice Bar has its own thermal printer integration to print beverage slips.

---

## 6. Operational Workflows (Examples)

### Workflow A: Dine-in Customer Journey
1. **Seating:** Customer arrives. Waiter guides them to Table 4.
2. **Order Taking:** Waiter opens the app, selects Table 4, adds 1x Mutton Karahi (Half Kg) and 2x Mint Margaritas. Waiter taps "Send to Kitchen".
3. **Kitchen & Bar Split:** 
   - The Main KDS immediately chimes and shows the Mutton Karahi ticket.
   - The Juice Bar KDS chimes and shows the Mint Margarita ticket.
4. **Preparation & Bumping:** Chefs prepare the food, tap the items, and hit "Bump". Waiter receives notification that food is ready.
5. **Add-on:** Customer wants extra Naan. Waiter selects Table 4 again, adds Naan. The KDS flashes an orange "Add-on" warning so chefs prioritize it.
6. **Billing:** Customer asks for bill. Manager taps Table 4 on the Blueprint, hits "Print Bill".
7. **Payment:** Customer pays via Card. Manager finalizes invoice. Table 4 turns Green (Available) on the blueprint.

### Workflow B: End of Day Reconciliation
1. Manager finishes night shift.
2. Goes to Shift Management -> Generate Z-Report.
3. System shows: Total Cash Expected: Rs. 150,000. Total Card: Rs. 50,000.
4. Manager counts physical cash drawer (Rs. 149,500) and inputs it.
5. System logs a variance of -Rs. 500.
6. Manager prints the Z-Report slip and closes the shift securely.

---
**Prepared For:** Sultan Restaurant Executive Management Team.
