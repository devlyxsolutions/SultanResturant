================================================================================
   🏰 SULTAN RESTAURANT & CAFE - DESKTOP POS APPLICATION PACKAGE
================================================================================

Yeh mukammal folder Sultan Restaurant POS ka final release package hai.
Is ko aap kisi bhi Windows PC / Laptop / POS Counter par direct chala saktay hain.

FOLDER CONTENTS:
----------------
1. SultanRestaurant.exe       -> Main Official Desktop Application (Logo icon embedded)
2. sultan-pos-config.json     -> Configuration File (Server IP & Station settings)
3. Launch-Sultan-POS.bat      -> Cashier POS Billing direct open karne ke liye
4. Launch-Kitchen-KDS.bat     -> Kitchen Order Display (KDS) direct open karne ke liye
5. Launch-Admin-Dashboard.bat -> Manager / Admin Dashboard direct open karne ke liye
6. Configure-Station-IP.bat   -> Server IP ya settings change karne ke liye
7. Create-Desktop-Shortcut.bat-> Desktop par Golden Crown Logo wala shortcut banane ke liye
8. JuiceBar-Printer-Agent     -> Juice Bar thermal printer driver & auto-agent

KAISE CHALANA HAI (HOW TO USE):
-------------------------------
A) MAIN SERVER PC PAR:
   - SultanRestaurant.exe par double-click karein.
   - Yeh Port 5050 par Central Hub ko khud start karega aur POS Billing open karega.
   - Tharmal prints zero-click silent print honge.

B) CLIENT PCS PAR (JUICE BAR, KITCHEN KDS, CASHIER 2, WAITER):
   - Yeh poora folder USB ke zariye us PC par copy karein (maslan Desktop par).
   - "Configure-Station-IP.bat" chalayein ya "sultan-pos-config.json" open karein.
   - Server URL mein Main PC ka IP daalein (Jaise: http://192.168.1.10:5050)
   - "Auto-start Hub" ko uncheck / false karein.
   - "Save Configuration" karein.
   - Ab jab bhi "SultanRestaurant.exe" chalayenge, wo direct Main Server se connect ho jayega!

C) WINDOWS BOOT PAR AUTO START KARNA:
   - Sultan Control Center khol kar "Start Sultan Restaurant automatically on Windows Boot"
     ko check kar dein. Subha computer on hote hi software khud open ho jayega!
================================================================================
