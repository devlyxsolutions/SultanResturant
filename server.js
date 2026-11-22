const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const WebSocket = require('ws');
const WebSocketServer = WebSocket.Server;

const PORT = process.env.PORT || 5050;
const DATA_FILE = process.env.SULTAN_DATA_FILE || path.join(__dirname, 'server-data.json');

// Preset visual fallbacks for rich mobile display
const PRESET_VISUALS = {
  'sultan kebab': {
    imageUri: 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=800&q=80',
    description: 'Tender minced mutton & beef grilled with royal Sultan spices on open charcoal.',
    badge: 'Chef Special',
    rating: 4.9,
    prepTime: 20,
    category: 'Mains'
  },
  'chicken karahi': {
    imageUri: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=800&q=80',
    description: 'Fresh chicken cooked in pure desi ghee, fresh tomatoes, ginger and green chillies.',
    badge: 'Best Seller',
    rating: 4.8,
    prepTime: 25,
    category: 'Karahi & Handi'
  },
  'beef karahii': {
    imageUri: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80',
    description: 'Tender beef shank cuts slow-cooked in rich spiced tomato & black pepper gravy.',
    badge: 'Signature',
    rating: 4.9,
    prepTime: 30,
    category: 'Karahi & Handi'
  },
  'chicken fajita': {
    imageUri: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&q=80',
    description: 'Crispy crust loaded with fajita chicken, bell peppers, olives and melted mozzarella.',
    badge: 'Hot',
    rating: 4.7,
    prepTime: 18,
    category: 'Fast Food'
  },
  'chicken cheese': {
    imageUri: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=80',
    description: 'Double cheese layer topped with marinated grilled chicken breast chunks.',
    badge: 'Popular',
    rating: 4.8,
    prepTime: 18,
    category: 'Fast Food'
  },
  'mangoo shake': {
    imageUri: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=800&q=80',
    description: 'Thick mango pulp blended with traditional kulfa ice cream and dry fruits.',
    badge: 'Chilled',
    rating: 4.9,
    prepTime: 10,
    category: 'Drinks'
  },
  'mint margarita': {
    imageUri: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=800&q=80',
    description: 'Blended fresh mint leaves, lemon juice, soda and crushed ice.',
    badge: 'Refreshing',
    rating: 4.8,
    prepTime: 8,
    category: 'Drinks'
  },
  'kunafa': {
    imageUri: 'https://images.unsplash.com/photo-1608836561226-d621b10a26e8?w=800&q=80',
    description: 'Crunchy golden pastry filled with sweet cheese, soaked in rose syrup & pistachios.',
    badge: 'Royal Sweet',
    rating: 4.9,
    prepTime: 15,
    category: 'Desserts'
  },
  'hummus & pita': {
    imageUri: 'https://images.unsplash.com/photo-1577906096429-f73c2c312435?w=800&q=80',
    description: 'Creamy chickpea dip with extra virgin olive oil and freshly baked pita bread.',
    badge: 'Healthy',
    rating: 4.6,
    prepTime: 10,
    category: 'Appetizers'
  }
};

// Default Playland attractions & rides catalog
const DEFAULT_PLAYLAND_RIDES = [
  {
    id: 'PL-R1',
    name: 'Sultan Royal Carousel',
    category: 'jhoola',
    price: 200,
    variants: [
      { id: 'v1-1', name: '5 Mins', durationMinutes: 5, price: 200 },
      { id: 'v1-2', name: '10 Mins', durationMinutes: 10, price: 350 },
      { id: 'v1-3', name: '15 Mins', durationMinutes: 15, price: 480 },
    ],
    icon: 'color-palette-outline',
    minAge: '2+ yrs',
    duration: '5 Mins',
    capacity: 16,
    isActive: true,
    color: '#D5A943',
  },
  {
    id: 'PL-R2',
    name: 'Mini Roller Coaster',
    category: 'jhoola',
    price: 300,
    variants: [
      { id: 'v2-1', name: '3 Mins (1 Round)', durationMinutes: 3, price: 300 },
      { id: 'v2-2', name: '6 Mins (2 Rounds)', durationMinutes: 6, price: 500 },
    ],
    icon: 'rocket-outline',
    minAge: '5+ yrs',
    duration: '3 Mins',
    capacity: 12,
    isActive: true,
    color: '#FF6B6B',
  },
  {
    id: 'PL-R3',
    name: 'Sultan Bumper Cars',
    category: 'jhoola',
    price: 250,
    variants: [
      { id: 'v3-1', name: '6 Mins', durationMinutes: 6, price: 250 },
      { id: 'v3-2', name: '12 Mins', durationMinutes: 12, price: 450 },
    ],
    icon: 'car-sport-outline',
    minAge: '4+ yrs',
    duration: '6 Mins',
    capacity: 10,
    isActive: true,
    color: '#4D96FF',
  },
  {
    id: 'PL-R4',
    name: 'Sultan Jungle Safari Train',
    category: 'jhoola',
    price: 180,
    variants: [
      { id: 'v4-1', name: '8 Mins', durationMinutes: 8, price: 180 },
      { id: 'v4-2', name: '15 Mins', durationMinutes: 15, price: 300 },
    ],
    icon: 'train-outline',
    minAge: 'All Ages',
    duration: '8 Mins',
    capacity: 20,
    isActive: true,
    color: '#6BCB77',
  },
  {
    id: 'PL-R5',
    name: 'Flying Chair Swings',
    category: 'jhoola',
    price: 220,
    variants: [
      { id: 'v5-1', name: '5 Mins', durationMinutes: 5, price: 220 },
      { id: 'v5-2', name: '10 Mins', durationMinutes: 10, price: 380 },
    ],
    icon: 'planet-outline',
    minAge: '6+ yrs',
    duration: '5 Mins',
    capacity: 14,
    isActive: true,
    color: '#FFD93D',
  },
  {
    id: 'PL-R6',
    name: 'Toddler Soft Play Kingdom',
    category: 'softplay',
    price: 350,
    variants: [
      { id: 'v6-1', name: '30 Mins', durationMinutes: 30, price: 350 },
      { id: 'v6-2', name: '60 Mins (1 Hour)', durationMinutes: 60, price: 600 },
      { id: 'v6-3', name: 'Unlimited Day', durationMinutes: 300, price: 1000 },
    ],
    icon: 'happy-outline',
    minAge: '1-6 yrs',
    duration: '30 Mins',
    capacity: 25,
    isActive: true,
    color: '#FF9F45',
  },
  {
    id: 'PL-R7',
    name: '9D Virtual Reality Cinema',
    category: 'vr',
    price: 350,
    variants: [
      { id: 'v7-1', name: '1 Ride (10 Mins)', durationMinutes: 10, price: 350 },
      { id: 'v7-2', name: '2 Rides (20 Mins)', durationMinutes: 20, price: 600 },
    ],
    icon: 'glasses-outline',
    minAge: '7+ yrs',
    duration: '10 Mins',
    capacity: 6,
    isActive: true,
    color: '#9C27B0',
  },
  {
    id: 'PL-R8',
    name: 'Arcade Master Card',
    category: 'arcade',
    price: 500,
    variants: [
      { id: 'v8-1', name: '500 Balance', durationMinutes: 0, price: 500 },
      { id: 'v8-2', name: '1000 Balance (+200 Bonus)', durationMinutes: 0, price: 1000 },
      { id: 'v8-3', name: '2000 Balance (+500 Bonus)', durationMinutes: 0, price: 2000 },
    ],
    icon: 'game-controller-outline',
    minAge: 'All Ages',
    duration: 'Tokens',
    capacity: 50,
    isActive: true,
    color: '#00BCD4',
  },
  {
    id: 'PL-R9',
    name: 'Sultan VIP Unlimited Mega Pass',
    category: 'pass',
    price: 1500,
    variants: [
      { id: 'v9-1', name: 'Single Child Full Pass (3 Hours)', durationMinutes: 180, price: 1500 },
      { id: 'v9-2', name: 'Family Pass (2 Kids, 3 Hours)', durationMinutes: 180, price: 2700 },
    ],
    icon: 'star-outline',
    minAge: 'All Ages',
    duration: '3 Hours',
    capacity: 100,
    isActive: true,
    color: '#D5A943',
  }
];

// Initial state template
const INITIAL_STATE = {
  tables: [
    // Ground Floor
    { id: '1', floor: 'Ground Floor', zone: 'Ground Floor', seatingType: 'tables', name: 'T-01', seats: 4, status: 'available' },
    { id: '2', floor: 'Ground Floor', zone: 'Ground Floor', seatingType: 'tables', name: 'T-02', seats: 4, status: 'available' },
    { id: '3', floor: 'Ground Floor', zone: 'Ground Floor', seatingType: 'couches', name: 'Couch 1', seats: 6, status: 'available' },
    { id: '4', floor: 'Ground Floor', zone: 'Ground Floor', seatingType: 'majlis', cabinNumber: 'Cabin 1', name: 'Cabin 1', seats: 8, status: 'available' },
    { id: '5', floor: 'Ground Floor', zone: 'Ground Floor', seatingType: 'majlis', cabinNumber: 'Cabin 2', name: 'Cabin 2', seats: 10, status: 'available' },

    // 1st Floor
    { id: 'f1-t1', floor: '1st Floor', zone: '1st Floor', seatingType: 'tables', name: 'F1-T01', seats: 4, status: 'available' },
    { id: 'f1-t2', floor: '1st Floor', zone: '1st Floor', seatingType: 'tables', name: 'F1-T02', seats: 6, status: 'available' },
    { id: 'f1-c1', floor: '1st Floor', zone: '1st Floor', seatingType: 'couches', name: 'Couch 1', seats: 6, status: 'available' },
    { id: 'f1-m1', floor: '1st Floor', zone: '1st Floor', seatingType: 'majlis', cabinNumber: 'Cabin 1', name: 'Cabin 1', seats: 8, status: 'available' },
    { id: 'f1-m2', floor: '1st Floor', zone: '1st Floor', seatingType: 'majlis', cabinNumber: 'Cabin 2', name: 'Cabin 2', seats: 10, status: 'available' },
    { id: 'f1-m3', floor: '1st Floor', zone: '1st Floor', seatingType: 'majlis', cabinNumber: 'Cabin 3', name: 'Cabin 3', seats: 12, status: 'available' },

    // 2nd Floor
    { id: 'f2-t1', floor: '2nd Floor', zone: '2nd Floor', seatingType: 'tables', name: 'F2-T01', seats: 4, status: 'available' },
    { id: 'f2-m1', floor: '2nd Floor', zone: '2nd Floor', seatingType: 'majlis', cabinNumber: 'Cabin 1', name: 'Cabin 1', seats: 10, status: 'available' },

    // 3rd Floor
    { id: 'f3-t1', floor: '3rd Floor', zone: '3rd Floor', seatingType: 'tables', name: 'F3-T01', seats: 6, status: 'available' },
    { id: 'f3-m1', floor: '3rd Floor', zone: '3rd Floor', seatingType: 'majlis', cabinNumber: 'Royal Cabin 1', name: 'Royal Cabin 1', seats: 14, status: 'available' },

    // Rooftop
    { id: 'rt-1', floor: 'Rooftop', zone: 'Rooftop', seatingType: 'tables', name: 'R-01', seats: 4, status: 'available' },
    { id: 'rt-2', floor: 'Rooftop', zone: 'Rooftop', seatingType: 'majlis', cabinNumber: 'Sky Cabin 1', name: 'Sky Cabin 1', seats: 8, status: 'available' },
    { id: 'rt-3', floor: 'Rooftop', zone: 'Rooftop', seatingType: 'majlis', cabinNumber: 'Sky Cabin 2', name: 'Sky Cabin 2', seats: 8, status: 'available' }
  ],
  tickets: [],
  onlineOrders: [],
  invoices: [],
  customers: [],
  serviceRequests: [],
  playlandTickets: [],
  playlandRides: DEFAULT_PLAYLAND_RIDES,
  appUsers: [
    {
      id: 'usr-1',
      name: 'Hamza Sheikh',
      phone: '03219876543',
      password: 'password123',
      address: 'House #42, Street 7, Block F, Johar Town, Lahore',
      deviceInfo: 'iPhone 15 Pro (iOS 18.1)',
      registeredAt: Date.now() - 48 * 3600000,
      lastLoginAt: Date.now() - 15 * 60000,
      totalOrders: 3,
      totalSpent: 8450,
      status: 'Active'
    },
    {
      id: 'usr-2',
      name: 'Ayesha Khan',
      phone: '03331122334',
      password: 'password123',
      address: 'Suite 304, Mega Tower, Gulberg II, Lahore',
      deviceInfo: 'Samsung Galaxy S24 (Android 14)',
      registeredAt: Date.now() - 24 * 3600000,
      lastLoginAt: Date.now() - 2 * 3600000,
      totalOrders: 1,
      totalSpent: 2805,
      status: 'Active'
    }
  ],
  appUserLogs: [
    {
      id: 'log-1',
      userId: 'usr-1',
      name: 'Hamza Sheikh',
      phone: '03219876543',
      action: 'LOGIN',
      deviceInfo: 'iPhone 15 Pro (iOS 18.1)',
      timestamp: Date.now() - 15 * 60000,
      details: 'Customer logged in successfully from mobile app'
    },
    {
      id: 'log-2',
      userId: 'usr-2',
      name: 'Ayesha Khan',
      phone: '03331122334',
      action: 'SIGNUP',
      deviceInfo: 'Samsung Galaxy S24 (Android 14)',
      timestamp: Date.now() - 24 * 3600000,
      details: 'New user registered via mobile app'
    }
  ],
  menuItems: [
    {
        "id": "m1",
        "name": "Sultan Seekh Kebab",
        "region": "Pakistani",
        "price": 1450,
        "costPrice": 650,
        "category": "Mains",
        "imageUri": "https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=600&q=80",
        "description": "Tender minced mutton & beef grilled with royal Sultan spices on open charcoal.",
        "badge": "Chef Special",
        "trackStock": true,
        "stockQty": 35,
        "lowStockThreshold": 10,
        "station": "main",
        "prepTimeMin": 20,
        "imageUrl": "https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=600&q=80",
        "isAvailable": true
    },
    {
        "id": "m2",
        "name": "Desi Murgh Karahi",
        "region": "Pakistani",
        "price": 1850,
        "costPrice": 820,
        "category": "Mains",
        "imageUri": "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=600&q=80",
        "description": "Fresh chicken cooked in pure desi ghee, fresh tomatoes, ginger and green chillies.",
        "badge": "Best Seller",
        "trackStock": true,
        "stockQty": 25,
        "lowStockThreshold": 5,
        "station": "main",
        "prepTimeMin": 25,
        "imageUrl": "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=600&q=80",
        "isAvailable": true
    },
    {
        "id": "m3",
        "name": "Hummus with Warm Pita",
        "region": "Arabic",
        "price": 650,
        "costPrice": 220,
        "category": "Appetizers",
        "imageUri": "https://images.unsplash.com/photo-1577906096429-f73c2c312435?w=600&q=80",
        "description": "Creamy chickpea dip with extra virgin olive oil and freshly baked pita bread.",
        "badge": "Healthy",
        "trackStock": true,
        "stockQty": 40,
        "lowStockThreshold": 10,
        "station": "main",
        "prepTimeMin": 8,
        "imageUrl": "https://images.unsplash.com/photo-1577906096429-f73c2c312435?w=600&q=80",
        "isAvailable": true
    },
    {
        "id": "m4",
        "name": "Royal Turkish Kunafa",
        "region": "Turkish",
        "price": 850,
        "costPrice": 320,
        "category": "Desserts",
        "imageUri": "https://images.unsplash.com/photo-1608836561226-d621b10a26e8?w=600&q=80",
        "description": "Crunchy golden pastry filled with stretchy sweet cheese, soaked in rose syrup & pistachios.",
        "badge": "Signature",
        "trackStock": true,
        "stockQty": 20,
        "lowStockThreshold": 6,
        "station": "main",
        "prepTimeMin": 12,
        "imageUrl": "https://images.unsplash.com/photo-1608836561226-d621b10a26e8?w=600&q=80",
        "isAvailable": true
    },
    {
        "id": "m5",
        "name": "Fresh Mint Margarita",
        "region": "Continental",
        "price": 450,
        "costPrice": 120,
        "category": "Drinks",
        "imageUri": "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&q=80",
        "description": "Blended fresh mint leaves, lemon juice, soda and crushed ice.",
        "badge": "Chilled",
        "trackStock": true,
        "stockQty": 50,
        "lowStockThreshold": 15,
        "station": "juice",
        "prepTimeMin": 5,
        "imageUrl": "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&q=80",
        "isAvailable": true
    },
    {
        "id": "m6",
        "name": "Fajita Supreme Pizza",
        "region": "Italian",
        "price": 1400,
        "costPrice": 550,
        "category": "Mains",
        "imageUri": "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&q=80",
        "description": "Crispy crust loaded with fajita chicken, bell peppers, olives and mozzarella.",
        "badge": "Popular",
        "trackStock": false,
        "station": "main",
        "prepTimeMin": 18,
        "variants": [
            {
                "name": "Small (7\")",
                "price": 850
            },
            {
                "name": "Medium (10\")",
                "price": 1400
            },
            {
                "name": "Large (13\")",
                "price": 1950
            },
            {
                "name": "Family (16\")",
                "price": 2500
            }
        ],
        "imageUrl": "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&q=80",
        "isAvailable": true
    },
    {
        "id": "m7",
        "name": "Smoked Mutton Ribs",
        "region": "Continental",
        "price": 3500,
        "costPrice": 1800,
        "category": "Mains",
        "imageUri": "https://images.unsplash.com/photo-1544025162-d76694265947?w=600&q=80",
        "description": "Slow-smoked juicy mutton ribs marinated in Sultan royal rub.",
        "badge": "Signature",
        "trackStock": true,
        "stockQty": 10,
        "lowStockThreshold": 4,
        "station": "main",
        "prepTimeMin": 35,
        "variants": [
            {
                "name": "Half KG",
                "price": 3500
            },
            {
                "name": "1 KG",
                "price": 6800
            }
        ],
        "imageUrl": "https://images.unsplash.com/photo-1544025162-d76694265947?w=600&q=80",
        "isAvailable": true
    },
    {
        "id": "m8",
        "name": "Sultan Dum Biryani",
        "region": "Pakistani",
        "price": 950,
        "costPrice": 400,
        "category": "Mains",
        "imageUri": "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&q=80",
        "description": "Fragrant basmati rice layered with spiced meat and caramelized onions.",
        "badge": "Popular",
        "trackStock": true,
        "stockQty": 30,
        "lowStockThreshold": 8,
        "station": "main",
        "prepTimeMin": 15,
        "imageUrl": "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&q=80",
        "isAvailable": true
    },
    {
        "id": "m9",
        "name": "Grand Sultan Angus Burger",
        "region": "Fast Food",
        "price": 1150,
        "costPrice": 480,
        "category": "Mains",
        "imageUri": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&q=80",
        "description": "Juicy 200g beef patty, smoked cheese, caramelized onions and house sauce.",
        "badge": "Chef Special",
        "trackStock": true,
        "stockQty": 20,
        "lowStockThreshold": 5,
        "station": "main",
        "prepTimeMin": 18,
        "imageUrl": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&q=80",
        "isAvailable": true
    },
    {
        "id": "m10",
        "name": "Cheesy Truffle Fries",
        "region": "Fast Food",
        "price": 590,
        "costPrice": 190,
        "category": "Appetizers",
        "imageUri": "https://images.unsplash.com/photo-1585109649139-366815a0d713?w=600&q=80",
        "description": "Golden crispy fries topped with melted cheddar, jalapenos and spicy garlic dip.",
        "badge": "Snack",
        "trackStock": true,
        "stockQty": 35,
        "lowStockThreshold": 10,
        "station": "main",
        "prepTimeMin": 10,
        "imageUrl": "https://images.unsplash.com/photo-1585109649139-366815a0d713?w=600&q=80",
        "isAvailable": true
    },
    {
        "id": "m11",
        "name": "Choco Molten Lava Cake",
        "region": "Continental",
        "price": 750,
        "costPrice": 260,
        "category": "Desserts",
        "imageUri": "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600&q=80",
        "description": "Warm chocolate cake with a molten Belgian chocolate center served with vanilla ice cream.",
        "badge": "Sweet",
        "trackStock": true,
        "stockQty": 15,
        "lowStockThreshold": 5,
        "station": "main",
        "prepTimeMin": 15,
        "imageUrl": "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600&q=80",
        "isAvailable": true
    },
    {
        "id": "m12",
        "name": "Mango Kulfa Shake",
        "region": "Pakistani",
        "price": 550,
        "costPrice": 180,
        "category": "Drinks",
        "imageUri": "https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=600&q=80",
        "description": "Thick mango pulp blended with traditional kulfa ice cream and dry fruits.",
        "badge": "Rich",
        "trackStock": true,
        "stockQty": 40,
        "lowStockThreshold": 10,
        "station": "juice",
        "prepTimeMin": 6,
        "imageUrl": "https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=600&q=80",
        "isAvailable": true
    },
    {
        "id": "m13",
        "name": "Sultan Special Roghni Naan",
        "region": "Pakistani",
        "price": 150,
        "costPrice": 50,
        "category": "Appetizers",
        "imageUri": "https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600&q=80",
        "description": "Traditional clay oven baked naan brushed with desi ghee and sesame seeds.",
        "badge": "Hot",
        "trackStock": true,
        "stockQty": 100,
        "lowStockThreshold": 20,
        "station": "main",
        "prepTimeMin": 5,
        "imageUrl": "https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600&q=80",
        "isAvailable": true
    },
    {
        "id": "m14",
        "name": "Mutton Shinwari Karahi",
        "region": "Pakistani",
        "price": 2800,
        "costPrice": 1400,
        "category": "Mains",
        "imageUri": "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=600&q=80",
        "description": "Traditional Shinwari style tender mutton prepared with black pepper, salt and fresh tomatoes.",
        "badge": "Chef Special",
        "trackStock": true,
        "stockQty": 15,
        "lowStockThreshold": 4,
        "station": "main",
        "prepTimeMin": 35,
        "imageUrl": "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=600&q=80",
        "isAvailable": true
    },
    {
        "id": "m15",
        "name": "Chicken Manchurian & Egg Fried Rice",
        "region": "Chinese",
        "price": 1350,
        "costPrice": 580,
        "category": "Mains",
        "imageUri": "https://images.unsplash.com/photo-1525755662778-989d0524087e?w=600&q=80",
        "description": "Crispy chicken cubes in tangy spicy red Manchurian sauce served with aromatic egg fried rice.",
        "badge": "Best Seller",
        "trackStock": true,
        "stockQty": 25,
        "lowStockThreshold": 6,
        "station": "main",
        "prepTimeMin": 18,
        "imageUrl": "https://images.unsplash.com/photo-1525755662778-989d0524087e?w=600&q=80",
        "isAvailable": true
    },
    {
        "id": "m16",
        "name": "Chicken Chowmein Classic",
        "region": "Chinese",
        "price": 1150,
        "costPrice": 480,
        "category": "Mains",
        "imageUri": "https://images.unsplash.com/photo-1585032226651-759b368d7246?w=600&q=80",
        "description": "Stir-fried noodles with julienne chicken, bell peppers, cabbage and house soy glaze.",
        "badge": "Popular",
        "trackStock": true,
        "stockQty": 30,
        "lowStockThreshold": 8,
        "station": "main",
        "prepTimeMin": 15,
        "imageUrl": "https://images.unsplash.com/photo-1585032226651-759b368d7246?w=600&q=80",
        "isAvailable": true
    },
    {
        "id": "m17",
        "name": "Hot & Sour Chicken Soup",
        "region": "Chinese",
        "price": 490,
        "costPrice": 180,
        "category": "Appetizers",
        "imageUri": "https://images.unsplash.com/photo-1547592166-23ac45744acd?w=600&q=80",
        "description": "Rich dark broth with shredded chicken, mushrooms, tofu, egg ribbon and spicy chili oil.",
        "badge": "Starter",
        "trackStock": true,
        "stockQty": 40,
        "lowStockThreshold": 10,
        "station": "main",
        "prepTimeMin": 10,
        "imageUrl": "https://images.unsplash.com/photo-1547592166-23ac45744acd?w=600&q=80",
        "isAvailable": true
    },
    {
        "id": "m18",
        "name": "Grilled Chicken Alfredo Pasta",
        "region": "Continental",
        "price": 1490,
        "costPrice": 620,
        "category": "Mains",
        "imageUri": "https://images.unsplash.com/photo-1645112411341-6c4fd023714a?w=600&q=80",
        "description": "Fettuccine pasta in rich creamy parmesan garlic sauce topped with grilled chicken breast.",
        "badge": "Chef Special",
        "trackStock": true,
        "stockQty": 20,
        "lowStockThreshold": 5,
        "station": "main",
        "prepTimeMin": 20,
        "imageUrl": "https://images.unsplash.com/photo-1645112411341-6c4fd023714a?w=600&q=80",
        "isAvailable": true
    },
    {
        "id": "m19",
        "name": "Crispy Fish & Chips",
        "region": "Continental",
        "price": 1650,
        "costPrice": 720,
        "category": "Mains",
        "imageUri": "https://images.unsplash.com/photo-1579208030886-b937da0925dc?w=600&q=80",
        "description": "Golden batter fried fish fillet served with thick-cut fries and homemade tartar dip.",
        "badge": "Popular",
        "trackStock": true,
        "stockQty": 18,
        "lowStockThreshold": 5,
        "station": "main",
        "prepTimeMin": 16,
        "imageUrl": "https://images.unsplash.com/photo-1579208030886-b937da0925dc?w=600&q=80",
        "isAvailable": true
    },
    {
        "id": "deal1",
        "name": "Sultan Family Feast (4-5 Persons)",
        "region": "Pakistani",
        "price": 4999,
        "costPrice": 2300,
        "category": "Deals",
        "imageUri": "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&q=80",
        "description": "Complete family banquet: 1x Desi Murgh Karahi + 2x Sultan Seekh Kebabs + 1x Medium Fajita Pizza + 2x Fresh Mint Margaritas + 1x Royal Turkish Kunafa.",
        "badge": "Family Deal",
        "isDeal": true,
        "dealOriginalPrice": 6050,
        "prepTimeMin": 25,
        "dealItems": [
            {
                "menuItemId": "m2",
                "name": "Desi Murgh Karahi",
                "qty": 1,
                "price": 1850
            },
            {
                "menuItemId": "m1",
                "name": "Sultan Seekh Kebab",
                "qty": 2,
                "price": 1450
            },
            {
                "menuItemId": "m6",
                "name": "Fajita Supreme Pizza (Medium)",
                "qty": 1,
                "price": 1400
            },
            {
                "menuItemId": "m5",
                "name": "Fresh Mint Margarita",
                "qty": 2,
                "price": 450
            },
            {
                "menuItemId": "m4",
                "name": "Royal Turkish Kunafa",
                "qty": 1,
                "price": 850
            }
        ],
        "trackStock": true,
        "stockQty": 15,
        "lowStockThreshold": 5,
        "station": "main",
        "imageUrl": "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&q=80",
        "isAvailable": true
    },
    {
        "id": "deal2",
        "name": "Royal Couple Platter (2 Persons)",
        "region": "Arabic",
        "price": 2850,
        "costPrice": 1250,
        "category": "Deals",
        "imageUri": "https://images.unsplash.com/photo-1544025162-d76694265947?w=600&q=80",
        "description": "Perfect for two: 2x Sultan Seekh Kebabs + 1x Hummus with Warm Pita + 2x Fresh Mint Margaritas + 1x Royal Turkish Kunafa.",
        "badge": "Couple Deal",
        "isDeal": true,
        "dealOriginalPrice": 3400,
        "prepTimeMin": 20,
        "dealItems": [
            {
                "menuItemId": "m1",
                "name": "Sultan Seekh Kebab",
                "qty": 2,
                "price": 1450
            },
            {
                "menuItemId": "m3",
                "name": "Hummus with Warm Pita",
                "qty": 1,
                "price": 650
            },
            {
                "menuItemId": "m5",
                "name": "Fresh Mint Margarita",
                "qty": 2,
                "price": 450
            },
            {
                "menuItemId": "m4",
                "name": "Royal Turkish Kunafa",
                "qty": 1,
                "price": 850
            }
        ],
        "trackStock": true,
        "stockQty": 20,
        "lowStockThreshold": 5,
        "station": "main",
        "imageUrl": "https://images.unsplash.com/photo-1544025162-d76694265947?w=600&q=80",
        "isAvailable": true
    },
    {
        "id": "m-zain",
        "name": "zain dish",
        "price": 1200,
        "costPrice": 550,
        "category": "Mains",
        "region": "Pakistani",
        "station": "main",
        "imageUri": "https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80",
        "imageUrl": "https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80",
        "description": "Chef Zain special tender meat preparation with royal spices and butter gravy.",
        "badge": "Chef Special",
        "rating": 4.9,
        "prepTime": 25,
        "isAvailable": true
    },
    {
        "id": "m-shahi-handi",
        "name": "Sultan Shahi Handi",
        "price": 2400,
        "costPrice": 1100,
        "category": "Karahi & Handi",
        "region": "Pakistani",
        "station": "main",
        "variants": [
            {
                "name": "Half (0.5 kg)",
                "price": 1350
            },
            {
                "name": "Full (1 kg)",
                "price": 2400
            }
        ],
        "imageUri": "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800&q=80",
        "imageUrl": "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800&q=80",
        "description": "Boneless chicken cubes slow-cooked in pure cream, butter, roasted cashew paste and saffron.",
        "badge": "Royal Handi",
        "rating": 4.9,
        "prepTime": 25,
        "isAvailable": true
    },
    {
        "id": "m-beef-karahi",
        "name": "Beef Karahii",
        "price": 2200,
        "costPrice": 950,
        "category": "Karahi & Handi",
        "region": "Pakistani",
        "station": "main",
        "variants": [
            {
                "name": "Half (0.5 kg)",
                "price": 1250
            },
            {
                "name": "Full (1 kg)",
                "price": 2200
            }
        ],
        "imageUri": "https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80",
        "imageUrl": "https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80",
        "description": "Tender beef shank cuts slow-cooked in rich spiced tomato & black pepper desi gravy.",
        "badge": "Signature",
        "rating": 4.9,
        "prepTime": 30,
        "isAvailable": true
    },
    {
        "id": "m-chicken-cheese",
        "name": "Chicken Cheese",
        "price": 950,
        "costPrice": 420,
        "category": "Fast Food",
        "region": "Fast Food",
        "station": "main",
        "imageUri": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=80",
        "imageUrl": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=80",
        "description": "Double melted cheese layer topped with marinated grilled chicken breast chunks.",
        "badge": "Popular",
        "rating": 4.8,
        "prepTime": 18,
        "isAvailable": true
    }
],
  categories: ['All', 'Mains', 'Karahi & Handi', 'Chinese', 'Continental', 'Fast Food', 'Drinks', 'Appetizers', 'Desserts', 'Deals'],
  zones: ['Ground Floor', '1st Floor', '2nd Floor', '3rd Floor', 'Rooftop'],
  regions: ['Pakistani', 'Chinese', 'Continental', 'Arabic', 'Turkish', 'Fast Food', 'Italian'],
  staff: [
    { id: 'st1', name: 'Junaid Ahsan', phone: '+92 300 1234567', role: 'Admin', pin: '1122', status: 'Active', shift: 'Morning', joinedDate: '2025-01-15' },
    { id: 'st2', name: 'Ali Khan', phone: '+92 301 7654321', role: 'Manager', pin: '2233', status: 'Active', shift: 'Morning', joinedDate: '2025-02-01' },
    { id: 'st3', name: 'Chef Omar', phone: '+92 302 9876543', role: 'Kitchen', pin: '3344', status: 'Active', shift: 'Evening', joinedDate: '2025-03-10' },
    { id: 'st4', name: 'Sara Ahmed', phone: '+92 303 5556677', role: 'Waiter', pin: '4455', status: 'Active', shift: 'Evening', joinedDate: '2025-04-05', assignedZone: 'Ground Floor', assignedZones: ['Ground Floor'] },
    { id: 'st5', name: 'Hamza Malik', phone: '+92 304 4443322', role: 'Waiter', pin: '5566', status: 'On Leave', shift: 'Night', joinedDate: '2025-05-12', assignedZone: '1st Floor', assignedZones: ['1st Floor'] },
    { id: 'st-fm1', name: 'Rashid Mehmood', phone: '+92 305 6677889', role: 'Floor Manager', pin: '6677', status: 'Active', shift: 'Morning', joinedDate: '2025-02-15', assignedZone: 'Ground Floor', assignedZones: ['Ground Floor'], designation: 'Ground Floor Manager' },
    { id: 'st-fm2', name: 'Tariq Javed', phone: '+92 306 1122334', role: 'Floor Manager', pin: '7788', status: 'Active', shift: 'Evening', joinedDate: '2025-03-01', assignedZone: '1st Floor', assignedZones: ['1st Floor'], designation: '1st Floor Manager' },
  ],
  reservations: [
    {
      id: 'res-1',
      tableId: '5',
      tableName: 'Cabin 2',
      customerName: 'Hamza Malik',
      phone: '03219988776',
      guestsCount: 6,
      reservationDate: new Date().toISOString().split('T')[0],
      timeSlot: '08:30 PM',
      status: 'confirmed',
      notes: 'Birthday celebration, requested quiet corner',
      createdAt: Date.now() - 3600000,
    }
  ],
  assets: [],
  damageRecords: [],
  chillerHandovers: []
};

// Load or create state
let serverState = { ...INITIAL_STATE };
try {
  if (fs.existsSync(DATA_FILE)) {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    serverState = { ...INITIAL_STATE, ...JSON.parse(raw) };
    if (!serverState.onlineOrders) serverState.onlineOrders = [];
    if (!serverState.appUsers) serverState.appUsers = INITIAL_STATE.appUsers;
    if (!serverState.appUserLogs) serverState.appUserLogs = INITIAL_STATE.appUserLogs;
    if (!Array.isArray(serverState.serviceRequests)) serverState.serviceRequests = [];
    if (!Array.isArray(serverState.reservations)) serverState.reservations = INITIAL_STATE.reservations || [];
    if (!Array.isArray(serverState.playlandTickets)) serverState.playlandTickets = [];
    if (!Array.isArray(serverState.playlandRides) || serverState.playlandRides.length === 0) {
      serverState.playlandRides = DEFAULT_PLAYLAND_RIDES;
    }
    if (!serverState.tables || serverState.tables.length < 10 || !serverState.tables.some(t => t.seatingType === 'majlis')) {
      serverState.tables = INITIAL_STATE.tables;
    }
    if (!Array.isArray(serverState.staff) || serverState.staff.length === 0) {
      serverState.staff = INITIAL_STATE.staff;
    } else {
      for (const initSt of (INITIAL_STATE.staff || [])) {
        if (!serverState.staff.some(s => s.id === initSt.id || s.name.toLowerCase() === initSt.name.toLowerCase())) {
          serverState.staff.push(initSt);
        }
      }
    }
    if (!Array.isArray(serverState.deletedTicketIds)) {
      serverState.deletedTicketIds = ['KOT-1042'];
    } else if (!serverState.deletedTicketIds.includes('KOT-1042')) {
      serverState.deletedTicketIds.push('KOT-1042');
    }
    if (Array.isArray(serverState.tickets)) {
      const delSet = new Set(serverState.deletedTicketIds);
      serverState.tickets = serverState.tickets
        .filter(t => t && t.id && !delSet.has(t.id))
        .map(t => {
          if (t && t.status === 'served' && Array.isArray(t.items)) {
            return {
              ...t,
              items: t.items.map(it => ({ ...it, completed: true, itemStatus: 'served' }))
            };
          }
          return t;
        });
    }
    const activeTicketTableIds = new Set((serverState.tickets || []).map(tk => tk && tk.tableId).filter(Boolean));
    if (Array.isArray(serverState.tables)) {
      const nowInit = Date.now();
      serverState.tables = serverState.tables.map(t => {
        if (t.status === 'occupied' && !activeTicketTableIds.has(t.id) && !t.mergedInto) {
          return {
            ...t,
            status: 'available',
            billTotal: 0,
            orders: [],
            server: undefined,
            isPaid: false,
            lastInvoiceId: undefined,
            occupiedSince: undefined,
            lastSettledAt: t.lastSettledAt || nowInit,
          };
        }
        return t;
      });
    }
    serverState.lastUpdated = Date.now();
    fs.writeFileSync(DATA_FILE, JSON.stringify(serverState, null, 2));
    console.log('[Sultan Hub] Loaded saved database from server-data.json');
  } else {
    fs.writeFileSync(DATA_FILE, JSON.stringify(INITIAL_STATE, null, 2));
    console.log('[Sultan Hub] Created initial server-data.json');
  }
} catch (err) {
  console.error('[Sultan Hub] Error loading server-data.json:', err.message);
}

// Crash-safe atomic debounced file save + daily backup
const BACKUP_DIR = path.join(__dirname, 'backups');
let saveTimer = null;
let lastBackupDate = '';
function persistState() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const jsonStr = JSON.stringify(serverState, null, 2);
      const tmpFile = `${DATA_FILE}.tmp`;
      fs.writeFileSync(tmpFile, jsonStr);
      fs.renameSync(tmpFile, DATA_FILE);

      const today = new Date().toISOString().split('T')[0];
      if (today !== lastBackupDate) {
        if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
        fs.writeFileSync(path.join(BACKUP_DIR, `server-data-${today}.json`), jsonStr);
        lastBackupDate = today;
      }
    } catch (e) {
      console.error('[Sultan Hub] Failed to save state to disk:', e.message);
    }
  }, 400);
}

// Simple in-memory rate limiter for public endpoints
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 200;
const rateLimitMap = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };

  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + RATE_LIMIT_WINDOW_MS;
    rateLimitMap.set(ip, record);
    return true;
  }

  record.count++;
  rateLimitMap.set(ip, record);
  return record.count <= MAX_REQUESTS_PER_WINDOW;
}

// Helper: Sanitize public menu item (Strip sensitive margin, cost, supplier notes)
function sanitizeMenuItem(item) {
  const lowerName = (item.name || '').toLowerCase().trim();
  const visual = PRESET_VISUALS[lowerName] || {};

  return {
    id: item.id || `m-${Date.now()}`,
    name: item.name,
    urduName: item.urduName || undefined,
    price: Number(item.price) || 0,
    category: item.category || visual.category || 'Mains',
    description: item.description || visual.description || `${item.name} prepared freshly with authentic royal spices.`,
    imageUrl: item.imageUri || item.imageUrl || visual.imageUri || 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80',
    badge: item.badge || visual.badge || undefined,
    isPopular: item.isPopular || item.badge === 'Chef Special' || item.badge === 'Best Seller',
    isAvailable: item.isAvailable !== false,
    rating: Number(item.rating || visual.rating || 4.8),
    preparationTimeMinutes: Number(item.preparationTimeMinutes || visual.prepTime || 20),
    variants: Array.isArray(item.variants) ? item.variants.map(v => ({ name: v.name, price: Number(v.price) })) : undefined,
    isDeal: Boolean(item.isDeal),
    dealOriginalPrice: item.dealOriginalPrice ? Number(item.dealOriginalPrice) : undefined,
    dealItems: item.dealItems || undefined
  };
}

// Helper: Read JSON request body
function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON format'));
      }
    });
    req.on('error', err => reject(err));
  });
}

// Central Request Handler
async function handleRequest(req, res) {
  const clientIp = req.socket.remoteAddress || 'unknown';

  // Security Headers & CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Rate Limiting Enforcement
  if (!checkRateLimit(clientIp)) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Rate limit reached. Please wait a moment.' }));
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // 1. Health / System Status (Pure API endpoints only, never intercept browser HTML paths)
  if (url.pathname === '/health' || url.pathname === '/api/status') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
    res.end(JSON.stringify({
      status: 'online',
      server: 'Sultan Central POS & Mobile Hub',
      clientsCount: wss ? wss.clients.size : 0,
      activeMenuCount: (serverState.menuItems || []).length,
      registeredAppUsers: (serverState.appUsers || []).length,
      timestamp: Date.now()
    }));
    return;
  }

  // -------------------------------------------------------------
  // CUSTOMER AUTHENTICATION ENDPOINTS (Sign Up & Login)
  // -------------------------------------------------------------

  // POST /api/auth/register
  if (url.pathname === '/api/auth/register' && req.method === 'POST') {
    try {
      const payload = await readRequestBody(req);
      const { name, phone, password, address, deviceInfo } = payload;

      if (!name || !phone || !password) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Name, phone number and password are required' }));
        return;
      }

      const cleanPhone = phone.trim().replace(/\D/g, '');
      const existingUser = (serverState.appUsers || []).find(u => u.phone.replace(/\D/g, '') === cleanPhone);

      if (existingUser) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'An account with this phone number already exists. Please log in.' }));
        return;
      }

      const newUser = {
        id: `usr-${Date.now()}`,
        name: name.trim(),
        phone: phone.trim(),
        password: password.trim(),
        address: address ? address.trim() : '',
        deviceInfo: deviceInfo || 'Mobile App',
        registeredAt: Date.now(),
        lastLoginAt: Date.now(),
        totalOrders: 0,
        totalSpent: 0,
        status: 'Active'
      };

      if (!serverState.appUsers) serverState.appUsers = [];
      serverState.appUsers.unshift(newUser);

      // Audit Log Entry
      const logEntry = {
        id: `log-${Date.now()}`,
        userId: newUser.id,
        name: newUser.name,
        phone: newUser.phone,
        action: 'SIGNUP',
        deviceInfo: newUser.deviceInfo,
        timestamp: Date.now(),
        details: 'User created a new account on mobile app'
      };
      if (!serverState.appUserLogs) serverState.appUserLogs = [];
      serverState.appUserLogs.unshift(logEntry);

      // Also ensure this user exists in Customer CRM
      if (!serverState.customers) serverState.customers = [];
      const crmCustomer = serverState.customers.find(c => c.phone.replace(/\D/g, '') === cleanPhone);
      if (!crmCustomer) {
        serverState.customers.unshift({
          id: `crm-${Date.now()}`,
          name: newUser.name,
          phone: newUser.phone,
          address: newUser.address,
          totalOrders: 0,
          totalSpent: 0,
          firstVisit: Date.now(),
          tags: ['Mobile App User']
        });
      }

      persistState();

      // Broadcast new registration to admin web app
      broadcastToClients({
        type: 'APP_USER_REGISTERED',
        user: { id: newUser.id, name: newUser.name, phone: newUser.phone, registeredAt: newUser.registeredAt },
        log: logEntry,
        timestamp: Date.now()
      });

      // Issue mock JWT token
      const token = `sultan_jwt_${newUser.id}_${Date.now()}`;

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        token,
        user: {
          id: newUser.id,
          name: newUser.name,
          phone: newUser.phone,
          address: newUser.address,
          role: 'customer'
        },
        message: 'Account created successfully! Welcome to Sultan Restaurant.'
      }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // POST /api/auth/login
  if (url.pathname === '/api/auth/login' && req.method === 'POST') {
    try {
      const payload = await readRequestBody(req);
      const { phone, password, deviceInfo } = payload;

      if (!phone || !password) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Phone number and password are required' }));
        return;
      }

      const cleanPhone = phone.trim().replace(/\D/g, '');
      const user = (serverState.appUsers || []).find(u => u.phone.replace(/\D/g, '') === cleanPhone);

      if (!user) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'No account found with this phone number. Please sign up.' }));
        return;
      }

      if (user.password !== password.trim()) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid password. Please try again.' }));
        return;
      }

      user.lastLoginAt = Date.now();
      if (deviceInfo) user.deviceInfo = deviceInfo;

      // Audit Log Entry
      const logEntry = {
        id: `log-${Date.now()}`,
        userId: user.id,
        name: user.name,
        phone: user.phone,
        action: 'LOGIN',
        deviceInfo: user.deviceInfo,
        timestamp: Date.now(),
        details: 'Customer logged in to mobile app'
      };
      if (!serverState.appUserLogs) serverState.appUserLogs = [];
      serverState.appUserLogs.unshift(logEntry);

      persistState();

      // Broadcast login event to admin dashboard
      broadcastToClients({
        type: 'APP_USER_LOGIN',
        user: { id: user.id, name: user.name, phone: user.phone, lastLoginAt: user.lastLoginAt },
        log: logEntry,
        timestamp: Date.now()
      });

      const token = `sultan_jwt_${user.id}_${Date.now()}`;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        token,
        user: {
          id: user.id,
          name: user.name,
          phone: user.phone,
          address: user.address,
          role: 'customer'
        },
        message: `Welcome back, ${user.name}!`
      }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // POST /api/auth/google (Google One-Tap / Social Sign-In)
  if (url.pathname === '/api/auth/google' && req.method === 'POST') {
    try {
      const payload = await readRequestBody(req);
      const { email, name, googleId, photoUrl, deviceInfo } = payload;

      if (!email || !name) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Email and Name are required for Google Sign-In' }));
        return;
      }

      const cleanEmail = email.trim().toLowerCase();
      let user = (serverState.appUsers || []).find(u => (u.email && u.email.toLowerCase() === cleanEmail) || u.googleId === googleId);

      if (!user) {
        user = {
          id: `usr-g-${Date.now()}`,
          name: name.trim(),
          email: cleanEmail,
          googleId: googleId || `gid-${Date.now()}`,
          phone: payload.phone ? payload.phone.trim() : '',
          photoUrl: photoUrl || '',
          address: payload.address ? payload.address.trim() : '',
          deviceInfo: deviceInfo || 'Google Mobile App',
          registeredAt: Date.now(),
          lastLoginAt: Date.now(),
          totalOrders: 0,
          totalSpent: 0,
          status: 'Active',
          authProvider: 'google'
        };

        if (!serverState.appUsers) serverState.appUsers = [];
        serverState.appUsers.unshift(user);

        // CRM Entry
        if (!serverState.customers) serverState.customers = [];
        serverState.customers.unshift({
          id: `crm-g-${Date.now()}`,
          name: user.name,
          phone: user.phone || 'Google User',
          email: user.email,
          address: user.address,
          totalOrders: 0,
          totalSpent: 0,
          firstVisit: Date.now(),
          tags: ['Google Sign-In User']
        });
      } else {
        user.lastLoginAt = Date.now();
        if (photoUrl) user.photoUrl = photoUrl;
        if (deviceInfo) user.deviceInfo = deviceInfo;
      }

      // Audit Log
      const logEntry = {
        id: `log-${Date.now()}`,
        userId: user.id,
        name: user.name,
        phone: user.phone || user.email,
        action: 'GOOGLE_SIGNIN',
        deviceInfo: user.deviceInfo || 'Mobile App',
        timestamp: Date.now(),
        details: `Signed in with Google Account (${user.email})`
      };
      if (!serverState.appUserLogs) serverState.appUserLogs = [];
      serverState.appUserLogs.unshift(logEntry);

      persistState();

      broadcastToClients({
        type: 'APP_USER_LOGIN',
        user: { id: user.id, name: user.name, email: user.email, phone: user.phone, lastLoginAt: user.lastLoginAt },
        log: logEntry,
        timestamp: Date.now()
      });

      const token = `sultan_jwt_g_${user.id}_${Date.now()}`;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          address: user.address,
          photoUrl: user.photoUrl,
          role: 'customer'
        },
        message: `Welcome ${user.name}! Signed in via Google.`
      }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // -------------------------------------------------------------
  // ADMIN DASHBOARD VISIBILITY ENDPOINTS (App Installs, Users & Logs)
  // -------------------------------------------------------------

  // GET /api/admin/app-users
  if (url.pathname === '/api/admin/app-users' && req.method === 'GET') {
    const users = (serverState.appUsers || []).map(u => ({
      id: u.id,
      name: u.name,
      phone: u.phone,
      address: u.address,
      deviceInfo: u.deviceInfo || 'Mobile App',
      registeredAt: u.registeredAt,
      lastLoginAt: u.lastLoginAt,
      totalOrders: u.totalOrders || 0,
      totalSpent: u.totalSpent || 0,
      status: u.status || 'Active'
    }));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      totalUsers: users.length,
      users,
      timestamp: Date.now()
    }));
    return;
  }

  // GET /api/admin/app-logs
  if (url.pathname === '/api/admin/app-logs' && req.method === 'GET') {
    const logs = serverState.appUserLogs || [];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      count: logs.length,
      logs,
      timestamp: Date.now()
    }));
    return;
  }

  // GET /api/admin/online-orders
  if (url.pathname === '/api/admin/online-orders' && req.method === 'GET') {
    const orders = serverState.onlineOrders || [];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      count: orders.length,
      orders,
      timestamp: Date.now()
    }));
    return;
  }

  // -------------------------------------------------------------
  // ADMIN MENU MANAGEMENT (Category-wise with Image Upload/URL)
  // -------------------------------------------------------------

  // POST /api/admin/menu-items (Add dish with category & picture)
  if (url.pathname === '/api/admin/menu-items' && req.method === 'POST') {
    try {
      const payload = await readRequestBody(req);
      const { name, price, category, description, imageUrl, imageUri, badge, preparationTimeMinutes, variants } = payload;

      if (!name || price === undefined || !category) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Name, price, and category are required' }));
        return;
      }

      const newItem = {
        id: `m-${Date.now()}`,
        name: name.trim(),
        price: Number(price),
        category: category.trim(),
        description: description ? description.trim() : `${name} prepared freshly at Sultan Restaurant.`,
        imageUri: imageUrl || imageUri || 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80',
        badge: badge ? badge.trim() : undefined,
        rating: 4.9,
        preparationTimeMinutes: preparationTimeMinutes ? Number(preparationTimeMinutes) : 20,
        isAvailable: true,
        variants: Array.isArray(variants) ? variants : undefined
      };

      if (!serverState.menuItems) serverState.menuItems = [];
      serverState.menuItems.unshift(newItem);

      // Auto-register category if not present
      if (!serverState.categories) serverState.categories = ['All', 'Mains', 'Karahi & Handi', 'Fast Food', 'Drinks', 'Appetizers', 'Desserts', 'Deals'];
      if (!serverState.categories.includes(newItem.category)) {
        serverState.categories.push(newItem.category);
      }

      persistState();

      // Real-time broadcast to mobile app and web POS!
      broadcastToClients({
        type: 'MENU_ITEM_ADDED',
        item: sanitizeMenuItem(newItem),
        timestamp: Date.now()
      });

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: sanitizeMenuItem(newItem),
        message: `Dish "${newItem.name}" added successfully and synced to Mobile App!`
      }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // DELETE /api/admin/menu-items/:id
  if (url.pathname.startsWith('/api/admin/menu-items/') && req.method === 'DELETE') {
    const itemId = url.pathname.split('/').pop();
    if (!serverState.menuItems) serverState.menuItems = [];
    serverState.menuItems = serverState.menuItems.filter(m => m.id !== itemId);
    persistState();

    broadcastToClients({
      type: 'MENU_ITEM_DELETED',
      itemId,
      timestamp: Date.now()
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Item deleted' }));
    return;
  }

  // POST /api/admin/categories
  if (url.pathname === '/api/admin/categories' && req.method === 'POST') {
    try {
      const payload = await readRequestBody(req);
      const { category } = payload;
      if (!category) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Category name is required' }));
        return;
      }

      if (!serverState.categories) serverState.categories = [];
      if (!serverState.categories.includes(category.trim())) {
        serverState.categories.push(category.trim());
      }
      persistState();

      broadcastToClients({
        type: 'CATEGORIES_UPDATED',
        categories: serverState.categories,
        timestamp: Date.now()
      });

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, categories: serverState.categories }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // -------------------------------------------------------------
  // PUBLIC MENU, DEALS & ORDERING ENDPOINTS
  // -------------------------------------------------------------

  // 2. Safe Public Menu Endpoint: GET /api/public/menu or /api/menu
  if ((url.pathname === '/api/public/menu' || url.pathname === '/api/menu') && req.method === 'GET') {
    const categoryFilter = url.searchParams.get('category');
    let items = (serverState.menuItems || []).map(sanitizeMenuItem);

    if (items.length < 5) {
      items = Object.keys(PRESET_VISUALS).map((k, idx) => {
        const v = PRESET_VISUALS[k];
        return {
          id: `preset-${idx + 1}`,
          name: k.replace(/\b\w/g, l => l.toUpperCase()),
          price: 950 + idx * 150,
          category: v.category,
          description: v.description,
          imageUrl: v.imageUri,
          badge: v.badge,
          isPopular: true,
          isAvailable: true,
          rating: v.rating,
          preparationTimeMinutes: v.prepTime
        };
      });
    }

    if (categoryFilter && categoryFilter.toLowerCase() !== 'all') {
      const catLower = categoryFilter.toLowerCase();
      items = items.filter(item => 
        (item.category || '').toLowerCase().includes(catLower) ||
        (item.name || '').toLowerCase().includes(catLower)
      );
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      data: items,
      count: items.length,
      timestamp: Date.now()
    }));
    return;
  }

  // 3. Safe Public Categories: GET /api/public/categories or /api/categories
  if ((url.pathname === '/api/public/categories' || url.pathname === '/api/categories') && req.method === 'GET') {
    const rawCategories = serverState.categories || ['All', 'Mains', 'Karahi & Handi', 'Fast Food', 'Drinks', 'Appetizers', 'Desserts', 'Deals'];
    const uniqueCategories = Array.from(new Set(['All', ...rawCategories]));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      data: uniqueCategories,
      timestamp: Date.now()
    }));
    return;
  }

  // 4. Safe Public Deals: GET /api/public/deals
  if (url.pathname === '/api/public/deals' && req.method === 'GET') {
    const deals = (serverState.menuItems || [])
      .filter(item => item.isDeal || (item.category && item.category.toLowerCase() === 'deals'))
      .map(sanitizeMenuItem);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      data: deals,
      timestamp: Date.now()
    }));
    return;
  }

  // 4b. Safe Public Tables & Floors: GET /api/public/tables
  if (url.pathname === '/api/public/tables' && req.method === 'GET') {
    const floorFilter = url.searchParams.get('floor');
    let tables = (serverState.tables || []).map(t => ({
      id: t.id,
      name: t.name,
      floor: t.floor || t.zone || 'Ground Floor',
      zone: t.zone || 'Ground Floor',
      seatingType: t.seatingType || (t.name.toLowerCase().includes('cabin') ? 'majlis' : (t.name.toLowerCase().includes('couch') ? 'couches' : 'tables')),
      cabinNumber: t.cabinNumber,
      seats: t.seats || 4,
      status: t.status || 'available'
    }));

    if (floorFilter && floorFilter !== 'All') {
      tables = tables.filter(t => (t.floor || '').toLowerCase() === floorFilter.toLowerCase());
    }

    const availableFloors = Array.from(new Set(tables.map(t => t.floor).filter(Boolean)));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      floors: availableFloors.length > 0 ? availableFloors : ['Ground Floor', '1st Floor', '2nd Floor', '3rd Floor', 'Rooftop'],
      data: tables,
      timestamp: Date.now()
    }));
    return;
  }

  // 5. Order Placement: POST /api/public/orders or /api/orders
  if ((url.pathname === '/api/public/orders' || url.pathname === '/api/orders') && req.method === 'POST') {
    try {
      const payload = await readRequestBody(req);

      if (!payload.items || !Array.isArray(payload.items) || payload.items.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Order must contain at least one valid item' }));
        return;
      }

      // Mandatory User Verification for Order Placement
      const customerName = payload.customerName || payload.customer?.name;
      const customerPhone = payload.customerPhone || payload.customer?.phone;

      if (!customerName || !customerPhone) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Customer Name and Phone Number are required to place an order.' }));
        return;
      }

      const orderType = payload.orderType || (payload.tableInfo || payload.tableId ? 'dine_in' : (payload.takeaway ? 'takeaway' : 'delivery'));

      // Authoritative server-side price calculation
      const dbItems = serverState.menuItems || [];
      let calculatedSubtotal = 0;
      const verifiedItems = [];

      for (const cartItem of payload.items) {
        const menuItemId = cartItem.menuItem ? cartItem.menuItem.id : cartItem.id;
        const qty = Math.max(1, parseInt(cartItem.quantity || cartItem.qty || 1, 10));
        
        const dbItem = dbItems.find(m => m.id === menuItemId);
        let unitPrice = dbItem ? Number(dbItem.price) : (Number(cartItem.price) || 0);

        if (cartItem.selectedVariant && dbItem && Array.isArray(dbItem.variants)) {
          const v = dbItem.variants.find(vr => vr.name === cartItem.selectedVariant);
          if (v) unitPrice = Number(v.price);
        }

        calculatedSubtotal += unitPrice * qty;
        const itemName = dbItem ? dbItem.name : (cartItem.menuItem?.name || cartItem.name || 'Food Item');
        const itemImage = dbItem?.imageUrl || cartItem.menuItem?.imageUrl || 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80';
        const itemStation = dbItem?.station || (['Drinks', 'Beverages', 'Desserts', 'Juices', 'Beverages & Desserts'].includes(dbItem?.category) ? 'juice' : 'main');

        verifiedItems.push({
          id: menuItemId,
          name: itemName,
          unitPrice,
          price: unitPrice,
          qty,
          quantity: qty,
          totalPrice: unitPrice * qty,
          selectedVariant: cartItem.selectedVariant || undefined,
          station: itemStation,
          notes: cartItem.specialInstructions || cartItem.notes || undefined,
          menuItem: {
            id: menuItemId,
            name: itemName,
            price: unitPrice,
            description: dbItem?.description || '',
            category: dbItem?.category || 'Mains',
            imageUrl: itemImage,
            isAvailable: true,
            station: itemStation,
          }
        });
      }

      // Recipe BOM auto-deduction from inventory if configured
      if (Array.isArray(serverState.recipes) && Array.isArray(serverState.inventory) && serverState.recipes.length > 0) {
        for (const it of verifiedItems) {
          const recipe = serverState.recipes.find(r => r.menuItemId === it.id);
          if (recipe && Array.isArray(recipe.ingredients)) {
            const portions = Number(recipe.yieldPortions) || 1;
            for (const ing of recipe.ingredients) {
              const invItem = serverState.inventory.find(inv => inv.id === ing.inventoryItemId);
              if (invItem) {
                const deductQty = (ing.qty / portions) * it.qty;
                invItem.currentStock = Math.max(0, (invItem.currentStock || 0) - deductQty);
                invItem.updatedAt = Date.now();
              }
            }
          }
        }
      }

      // For Dine-In or Express Takeaway, delivery fee is 0
      const deliveryFee = (orderType === 'dine_in' || orderType === 'takeaway') ? 0 : (calculatedSubtotal >= 2500 ? 0 : 150);
      const tax = Math.round(calculatedSubtotal * 0.05); // 5% GST
      const grandTotal = calculatedSubtotal + deliveryFee + tax;

      const orderId = `ORD-${Date.now().toString().slice(-6)}`;
      const orderNumber = `SLT-${Math.floor(1000 + Math.random() * 9000)}`;
      const roundNum = payload.roundNumber ? parseInt(payload.roundNumber, 10) : 1;
      const isAddOn = roundNum > 1 || payload.isAddOn || false;

      // Table details if Dine-in
      const tableInfo = payload.tableInfo || {};
      const targetTableId = payload.tableId || tableInfo.tableId || (orderType === 'dine_in' ? 'DINE-IN-APP' : (orderType === 'takeaway' ? 'EXPRESS-TAKEAWAY' : 'DELIVERY'));
      const targetTableName = payload.tableName || tableInfo.tableName || (
        orderType === 'dine_in' 
          ? `${tableInfo.floor || 'Floor'} • ${tableInfo.seatingType || 'Table'} ${tableInfo.tableName || tableInfo.tableNumber || ''}`
          : (orderType === 'takeaway' ? `Express Takeaway: ${customerName}` : `Delivery: ${customerName}`)
      );

      // Determine floor and matching table
      let foundTable = null;
      if (targetTableId && targetTableId !== 'DINE-IN-APP') {
        foundTable = (serverState.tables || []).find(t => t.id === targetTableId || t.name.toLowerCase() === targetTableName.toLowerCase());
      }
      const orderFloor = tableInfo.floor || foundTable?.floor || foundTable?.zone || 'Ground Floor';

      const newOrder = {
        id: orderId,
        orderNumber,
        source: 'mobile_app',
        orderType: orderType, // 'dine_in' | 'takeaway' | 'delivery'
        floor: orderFloor,
        seatingType: tableInfo.seatingType || foundTable?.seatingType || undefined,
        tableId: targetTableId,
        tableName: targetTableName,
        cabinNumber: tableInfo.cabinNumber || foundTable?.cabinNumber || undefined,
        roundNumber: roundNum,
        isAddOn,
        customer: {
          id: payload.customerId || undefined,
          name: customerName,
          phone: customerPhone,
          address: payload.deliveryAddress ? `${payload.deliveryAddress.addressLine}, ${payload.deliveryAddress.area}` : (orderType === 'dine_in' ? `In-Restaurant: ${targetTableName}` : (orderType === 'takeaway' ? 'Sultan Express Takeaway Counter' : 'Lahore, Pakistan'))
        },
        items: verifiedItems,
        subtotal: calculatedSubtotal,
        deliveryFee,
        tax,
        total: grandTotal,
        paymentMethod: payload.paymentMethod || (orderType === 'dine_in' || orderType === 'takeaway' ? 'pay_at_counter' : 'cash_on_delivery'),
        isPaid: payload.paymentMethod === 'card' || payload.paymentMethod === 'easypaisa' || payload.paymentMethod === 'jazzcash',
        status: orderType === 'dine_in' ? 'PENDING' : 'CONFIRMED',
        createdAt: Date.now(),
        estimatedDeliveryMinutes: orderType === 'dine_in' ? 20 : (orderType === 'takeaway' ? 15 : 35)
      };

      // Persist to central state
      if (!serverState.onlineOrders) serverState.onlineOrders = [];
      serverState.onlineOrders.unshift(newOrder);

      // Dine-in orders require Floor Manager confirmation with continuous repeating notification
      if (orderType === 'dine_in') {
        const floorAlert = {
          id: `alert-${Date.now()}`,
          orderId: newOrder.id,
          orderNumber: newOrder.orderNumber,
          floor: orderFloor,
          tableId: targetTableId,
          tableName: targetTableName,
          customerName,
          customerPhone,
          total: grandTotal,
          itemsCount: verifiedItems.length,
          itemsSummary: verifiedItems.map(i => `${i.qty}x ${i.name}`).join(', '),
          time: Date.now()
        };
        serverState.pendingFloorOrderAlert = floorAlert;
      } else {
        // Takeaway / Delivery generates KOT immediately
        const kotTicket = {
          id: `KOT-${Math.floor(1000 + Math.random() * 9000)}`,
          orderId: newOrder.id,
          orderNumber: newOrder.orderNumber,
          tableId: targetTableId,
          tableName: targetTableName,
          server: orderType === 'takeaway' ? 'Mobile Express Takeaway' : 'Mobile App Delivery',
          timePlaced: Date.now(),
          status: 'cooking',
          roundNumber: roundNum,
          isAddOn,
          items: verifiedItems.map(it => ({
            id: it.id,
            name: it.name,
            price: it.unitPrice,
            qty: it.qty,
            notes: it.notes,
            station: it.station || 'main',
            completed: false
          }))
        };
        if (!serverState.tickets) serverState.tickets = [];
        serverState.tickets.unshift(kotTicket);
      }

      // Update customer total orders & spent in appUsers and customers
      if (serverState.appUsers) {
        const u = serverState.appUsers.find(au => au.phone.replace(/\D/g, '') === customerPhone.replace(/\D/g, ''));
        if (u) {
          u.totalOrders = (u.totalOrders || 0) + 1;
          u.totalSpent = (u.totalSpent || 0) + grandTotal;
        }
      }

      // Log Order Placed event
      if (!serverState.appUserLogs) serverState.appUserLogs = [];
      serverState.appUserLogs.unshift({
        id: `log-${Date.now()}`,
        name: customerName,
        phone: customerPhone,
        action: 'ORDER_PLACED',
        deviceInfo: 'Mobile App',
        timestamp: Date.now(),
        details: `Placed order #${newOrder.orderNumber} (Rs. ${grandTotal.toLocaleString()})`
      });

      persistState();

      // Broadcast Real-Time Alert to Web POS, Waiter & Kitchen Screens!
      broadcastToClients({
        type: 'SERVER_BROADCAST',
        state: serverState,
        senderId: 'APP_ORDER',
        timestamp: Date.now()
      });

      let activeTicket = typeof kotTicket !== 'undefined' ? kotTicket : null;

      broadcastToClients({
        type: orderType === 'dine_in' ? 'PENDING_FLOOR_ORDER_ALERT' : 'NEW_ORDER_ALERT',
        alert: serverState.pendingFloorOrderAlert,
        order: newOrder,
        ticket: activeTicket,
        soundAlert: true,
        timestamp: Date.now()
      });

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: newOrder,
        order: newOrder,
        ticket: activeTicket,
        pendingConfirmation: orderType === 'dine_in',
        message: orderType === 'dine_in'
          ? 'Order submitted and sent to Floor Manager for confirmation.'
          : 'Order created and dispatched to Sultan Kitchen successfully!'
      }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: `Invalid order data: ${err.message}` }));
    }
    return;
  }

  // 6a. Safe Public & Admin Orders List: GET /api/public/orders or /api/admin/online-orders
  if ((url.pathname === '/api/public/orders' || url.pathname === '/api/admin/online-orders' || url.pathname === '/api/orders') && req.method === 'GET') {
    const customerId = url.searchParams.get('customerId');
    const phone = url.searchParams.get('phone');
    let orders = serverState.onlineOrders || [];

    if (phone) {
      const cleanPhone = phone.replace(/\D/g, '');
      orders = orders.filter(o => o.customer?.phone?.replace(/\D/g, '').includes(cleanPhone));
    } else if (customerId) {
      orders = orders.filter(o => o.customer?.id === customerId);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      data: orders,
      orders: orders,
      count: orders.length,
      timestamp: Date.now()
    }));
    return;
  }

  // 6b. Track Single Order: GET /api/public/orders/:id or /api/orders/:id
  if ((url.pathname.startsWith('/api/public/orders/') || url.pathname.startsWith('/api/orders/')) && req.method === 'GET') {
    const parts = url.pathname.split('/');
    const orderId = parts[parts.length - 1];
    const order = (serverState.onlineOrders || []).find(o => o.id === orderId || o.orderNumber === orderId);

    if (!order) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Order not found' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: order, order: order }));
    return;
  }

  // 7. Rider / Kitchen Status Progression: PATCH /api/public/orders/:id/status
  if (url.pathname.startsWith('/api/public/orders/') && url.pathname.endsWith('/status') && req.method === 'PATCH') {
    const parts = url.pathname.split('/');
    const orderId = parts[parts.length - 2];

    try {
      const payload = await readRequestBody(req);
      const { status, riderName, riderPhone, assignedWaiter, managerNotes } = payload;
      const validStatuses = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'SERVED', 'CANCELLED'];
      
      if (!validStatuses.includes(status)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }));
        return;
      }

      const order = (serverState.onlineOrders || []).find(o => o.id === orderId || o.orderNumber === orderId);
      if (!order) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Order not found' }));
        return;
      }

      order.status = status;
      if (riderName) order.riderName = riderName;
      if (riderPhone) order.riderPhone = riderPhone;
      if (assignedWaiter) order.assignedWaiter = assignedWaiter;
      if (managerNotes) order.managerNotes = managerNotes;
      order.updatedAt = Date.now();

      // Clear pending floor alert if this order was confirmed or cancelled
      if (serverState.pendingFloorOrderAlert && 
          (serverState.pendingFloorOrderAlert.orderId === order.id || serverState.pendingFloorOrderAlert.orderNumber === order.orderNumber)) {
        serverState.pendingFloorOrderAlert = null;
      }

      let ticket = (serverState.tickets || []).find(t => t.orderId === order.id || (order.orderNumber && t.orderNumber === order.orderNumber));
      if (status === 'CONFIRMED') {
        if (!ticket) {
          ticket = {
            id: `KOT-${Math.floor(1000 + Math.random() * 9000)}`,
            orderId: order.id,
            orderNumber: order.orderNumber,
            tableId: order.tableId || 'DINE-IN-APP',
            tableName: order.tableName || 'Dine-In',
            server: assignedWaiter || order.assignedWaiter || 'Floor Manager Confirmed',
            timePlaced: Date.now(),
            status: 'cooking',
            roundNumber: order.roundNumber || 1,
            isAddOn: order.isAddOn || false,
            stationStatuses: { main: 'cooking', juice: 'cooking' },
            items: (order.items || []).map(it => ({
              id: it.id,
              name: it.name,
              price: it.unitPrice || it.price,
              qty: it.qty || it.quantity,
              notes: it.notes,
              station: it.station || 'main',
              itemStatus: 'cooking',
              completed: false
            }))
          };
          if (!serverState.tickets) serverState.tickets = [];
          serverState.tickets.unshift(ticket);
        } else {
          ticket.status = 'cooking';
          if (assignedWaiter) ticket.server = assignedWaiter;
        }

        // Occupy table
        if (order.tableId && order.tableId !== 'DINE-IN-APP') {
          const foundTable = (serverState.tables || []).find(t => t.id === order.tableId || t.name.toLowerCase() === (order.tableName || '').toLowerCase());
          if (foundTable) {
            foundTable.status = 'occupied';
            if (assignedWaiter || order.assignedWaiter) foundTable.server = assignedWaiter || order.assignedWaiter;
            foundTable.billTotal = (foundTable.billTotal || 0) + (order.total || 0);
            if (!foundTable.orders) foundTable.orders = [];
            foundTable.orders.push(...(order.items || []).map(it => ({
              id: it.id,
              name: it.name,
              price: it.unitPrice || it.price,
              qty: it.qty || it.quantity,
              completed: false
            })));
          }
        }
      } else if (ticket) {
        if (status === 'PREPARING') ticket.status = 'cooking';
        else if (status === 'READY' || status === 'READY_FOR_PICKUP') ticket.status = 'ready';
        else if (status === 'DELIVERED' || status === 'SERVED') ticket.status = 'served';
      }

      persistState();

      broadcastToClients({
        type: 'ORDER_STATUS_CHANGED',
        orderId: order.id,
        orderNumber: order.orderNumber,
        status,
        riderName: order.riderName,
        riderPhone: order.riderPhone,
        assignedWaiter: order.assignedWaiter,
        timestamp: Date.now()
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: order, message: `Status updated to ${status}` }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 7b. Service Requests: GET, POST & PATCH /api/public/service-requests
  if (url.pathname === '/api/public/service-requests' && req.method === 'GET') {
    const tableId = url.searchParams.get('tableId');
    let reqs = serverState.serviceRequests || [];
    if (tableId) {
      reqs = reqs.filter(r => r.tableId === tableId);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: reqs }));
    return;
  }

  if (url.pathname === '/api/public/service-requests' && req.method === 'POST') {
    try {
      const payload = await readRequestBody(req);
      const { tableId, tableName, zone, type, note, source } = payload;
      if (!tableId || !type) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'tableId and type are required' }));
        return;
      }

      const newReq = {
        id: `sr-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        tableId,
        tableName: tableName || `Table ${tableId}`,
        zone: zone || 'Dining Hall',
        type, // 'call_waiter' | 'bill' | 'water' | 'cleaning' | 'complaint'
        note: note || '',
        status: 'pending',
        source: source || 'guest',
        createdAt: Date.now()
      };

      if (!serverState.serviceRequests) serverState.serviceRequests = [];
      serverState.serviceRequests.unshift(newReq);
      persistState();

      // Real-time Audio/Visual Alert to Waiter & Manager screens
      broadcastToClients({
        type: 'SERVICE_REQUEST_ALERT',
        request: newReq,
        soundAlert: true,
        timestamp: Date.now()
      });

      broadcastToClients({
        type: 'SERVER_BROADCAST',
        state: serverState,
        senderId: 'GUEST_SERVICE_REQUEST',
        timestamp: Date.now()
      });

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: newReq, message: 'Service request dispatched to floor staff' }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  if (url.pathname.startsWith('/api/public/service-requests/') && req.method === 'PATCH') {
    const parts = url.pathname.split('/');
    const reqId = parts[parts.length - 1];
    try {
      const payload = await readRequestBody(req);
      const targetReq = (serverState.serviceRequests || []).find(r => r.id === reqId);
      if (!targetReq) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Service request not found' }));
        return;
      }
      if (payload.status) targetReq.status = payload.status;
      if (payload.acknowledgedBy) {
        targetReq.acknowledgedBy = payload.acknowledgedBy;
        targetReq.acknowledgedAt = Date.now();
      }
      if (payload.status === 'resolved') targetReq.resolvedAt = Date.now();

      persistState();
      broadcastToClients({
        type: 'SERVER_BROADCAST',
        state: serverState,
        senderId: 'SERVICE_REQUEST_RESOLVED',
        timestamp: Date.now()
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: targetReq }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 7c. Table Reservations: GET & POST /api/public/reservations
  if (url.pathname === '/api/public/reservations' && req.method === 'GET') {
    const phone = url.searchParams.get('phone');
    let resList = serverState.reservations || [];
    if (phone) {
      const cleanPhone = phone.replace(/\D/g, '');
      resList = resList.filter(r => (r.phone || '').replace(/\D/g, '') === cleanPhone);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: resList }));
    return;
  }

  if (url.pathname === '/api/public/reservations' && req.method === 'POST') {
    try {
      const payload = await readRequestBody(req);
      const { customerName, phone, guestsCount, reservationDate, timeSlot, tableId, tableName, floor, seatingCategory, notes, preOrderItems, preOrderTotal } = payload;
      if (!customerName || !phone || !reservationDate || !timeSlot) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Customer name, phone, date, and time slot are required' }));
        return;
      }

      // Pick or find a table if not specified
      let assignedTableId = tableId;
      let assignedTableName = tableName;
      if (!assignedTableId) {
        const availableTable = (serverState.tables || []).find(t => 
          t.status === 'available' && 
          (!floor || t.floor === floor) &&
          (!seatingCategory || t.seatingType === seatingCategory)
        );
        if (availableTable) {
          assignedTableId = availableTable.id;
          assignedTableName = availableTable.name;
        } else {
          assignedTableId = 'RES-AUTO';
          assignedTableName = `Reserved (${guestsCount} guests)`;
        }
      }

      const newReservation = {
        id: `res-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        tableId: assignedTableId,
        tableName: assignedTableName,
        customerName,
        phone,
        guestsCount: Number(guestsCount) || 2,
        reservationDate,
        timeSlot,
        floor: floor || 'Ground Floor',
        seatingCategory: seatingCategory || 'tables',
        status: 'confirmed',
        notes: notes || '',
        preOrderItems: Array.isArray(preOrderItems) ? preOrderItems : [],
        preOrderTotal: Number(preOrderTotal) || 0,
        createdAt: Date.now()
      };

      if (!serverState.reservations) serverState.reservations = [];
      serverState.reservations.unshift(newReservation);

      // Lock table on SRE blueprint as 'reserved' (Purple)
      if (assignedTableId && assignedTableId !== 'RES-AUTO') {
        const tbl = (serverState.tables || []).find(t => t.id === assignedTableId);
        if (tbl) {
          tbl.status = 'reserved';
          tbl.reservationId = newReservation.id;
          tbl.server = `${customerName} (Reserved)`;
        }
      }

      persistState();

      broadcastToClients({
        type: 'RESERVATION_CONFIRMED',
        reservation: newReservation,
        timestamp: Date.now()
      });

      broadcastToClients({
        type: 'SERVER_BROADCAST',
        state: serverState,
        senderId: 'TABLE_RESERVATION',
        timestamp: Date.now()
      });

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: newReservation, message: 'Table reserved successfully' }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 7d. Playland Rides: GET /api/public/playland/rides
  if (url.pathname === '/api/public/playland/rides' && req.method === 'GET') {
    const rides = (serverState.playlandRides && serverState.playlandRides.length > 0) ? serverState.playlandRides : DEFAULT_PLAYLAND_RIDES;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: rides }));
    return;
  }

  // 7e. Playland Tickets: GET & POST /api/public/playland/tickets
  if (url.pathname === '/api/public/playland/tickets' && req.method === 'GET') {
    const phone = url.searchParams.get('phone');
    let tickets = serverState.playlandTickets || [];
    if (phone) {
      const cleanPhone = phone.replace(/\D/g, '');
      tickets = tickets.filter(t => (t.parentPhone || '').replace(/\D/g, '') === cleanPhone);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: tickets }));
    return;
  }

  if (url.pathname === '/api/public/playland/tickets' && req.method === 'POST') {
    try {
      const payload = await readRequestBody(req);
      const { childName, parentName, parentPhone, childAge, items, totalAmount, paymentMethod, wristbandColor, notes } = payload;
      if (!items || !Array.isArray(items) || items.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'At least one ride item is required' }));
        return;
      }
      if (!parentPhone) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Parent phone number is required' }));
        return;
      }

      const ticketCode = `PL-${Math.floor(100000 + Math.random() * 900000)}`;
      const newTicket = {
        id: `pltk-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        ticketCode,
        childName: childName || 'Guest Child',
        parentName: parentName || 'Guest Parent',
        parentPhone,
        childAge: childAge || undefined,
        wristbandColor: wristbandColor || '#D5A943',
        notes: notes || undefined,
        items,
        totalAmount: Number(totalAmount) || items.reduce((acc, it) => acc + (it.price * (it.qty || 1)), 0),
        paymentMethod: paymentMethod || 'online',
        issuedAt: Date.now(),
        issuedBy: 'Customer Mobile App',
        status: 'active',
        redeemedRidesCount: 0
      };

      if (!serverState.playlandTickets) serverState.playlandTickets = [];
      serverState.playlandTickets.unshift(newTicket);
      persistState();

      broadcastToClients({
        type: 'NEW_PLAYLAND_TICKET',
        ticket: newTicket,
        timestamp: Date.now()
      });

      broadcastToClients({
        type: 'SERVER_BROADCAST',
        state: serverState,
        senderId: 'APP_PLAYLAND_TICKET',
        timestamp: Date.now()
      });

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: newTicket, message: 'Playland digital ticket issued' }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 8. Legacy / Central Web POS Sync: GET & POST /api/sync
  if (url.pathname === '/api/pos/clear-all' && req.method === 'POST') {
    const now = Date.now();
    const removedIds = (serverState.tickets || []).map(t => t && t.id).filter(Boolean);
    serverState.deletedTicketIds = Array.from(
      new Set([...(serverState.deletedTicketIds || []), 'KOT-1042', ...removedIds])
    ).slice(-500);
    serverState.tickets = [];
    serverState.tables = (serverState.tables || []).map(t =>
      t.status === 'occupied' || t.status === 'billed'
        ? {
            ...t,
            status: 'available',
            billTotal: 0,
            orders: [],
            server: undefined,
            isPaid: false,
            lastInvoiceId: undefined,
            occupiedSince: undefined,
            lastSettledAt: now,
            mergedInto: undefined,
            reservationId: undefined,
          }
        : t
    );
    serverState.lastBillPaidAlert = null;
    serverState.lastFoodReadyAlert = null;
    serverState.lastUpdated = now;
    lastStateFingerprint = computeStateFingerprint(serverState);
    persistState();
    broadcastToClients({
      type: 'SERVER_BROADCAST',
      state: serverState,
      senderId: 'POS_CLEAR_ALL',
      timestamp: now,
    });
    pushToFirestoreCloud();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, timestamp: now, state: serverState }));
    return;
  }

  if (url.pathname === '/api/sync' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(serverState));
    return;
  }

  if (url.pathname === '/api/sync' && req.method === 'POST') {
    try {
      const data = await readRequestBody(req);
      if (data.state && !hasProcessedServerPacket(data.packetId)) {
        applyStateUpdate(data.state, data.senderId);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, timestamp: Date.now(), state: serverState }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 9. High-Performance Static Web File Server (Serves pre-compiled production SPA from /dist with gzip acceleration)
  if (req.method === 'GET' || req.method === 'HEAD') {
    const DIST_DIR = process.env.SULTAN_DIST_DIR || path.join(__dirname, 'dist');
    if (fs.existsSync(DIST_DIR)) {
      let rawPath = (url.pathname || '/').split('?')[0];
      try {
        rawPath = decodeURIComponent(rawPath);
      } catch (_) {}
      
      let filePath = path.join(DIST_DIR, rawPath === '/' ? 'index.html' : rawPath);
      // Prevent directory traversal
      if (filePath.startsWith(DIST_DIR)) {
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          // Fallback to index.html for client-side Expo router routes (e.g. /admin/dashboard, /pos, /floor-manager)
          filePath = path.join(DIST_DIR, 'index.html');
        }

        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath).toLowerCase();
          const mimeTypes = {
            '.html': 'text/html; charset=utf-8',
            '.js': 'application/javascript; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.json': 'application/json; charset=utf-8',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon',
            '.ttf': 'font/ttf',
            '.woff': 'font/woff',
            '.woff2': 'font/woff2',
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
          };
          const contentType = mimeTypes[ext] || 'application/octet-stream';
          const isHashed = rawPath.includes('/_expo/') || rawPath.includes('/assets/') || rawPath.includes('/fonts/');
          const cacheControl = isHashed 
            ? 'public, max-age=31536000, immutable' 
            : 'no-cache, no-store, must-revalidate';

          const acceptEncoding = req.headers['accept-encoding'] || '';
          const canGzip = /\bgzip\b/.test(acceptEncoding) && ['.html', '.js', '.css', '.json', '.svg'].includes(ext);

          const headers = {
            'Content-Type': contentType,
            'Cache-Control': cacheControl,
            'Access-Control-Allow-Origin': '*',
          };

          const cachedAsset = getCachedStaticAsset(filePath, canGzip);
          if (cachedAsset) {
            if (canGzip && cachedAsset.gzipped) {
              headers['Content-Encoding'] = 'gzip';
              headers['Content-Length'] = cachedAsset.gzipped.length;
              res.writeHead(200, headers);
              if (req.method === 'HEAD') {
                res.end();
                return;
              }
              res.end(cachedAsset.gzipped);
              return;
            }

            headers['Content-Length'] = cachedAsset.raw.length;
            res.writeHead(200, headers);
            if (req.method === 'HEAD') {
              res.end();
              return;
            }
            res.end(cachedAsset.raw);
            return;
          }
        }
      }
    }

    // If static files are still compiling or being refreshed, show a polite instant loader rather than JSON
    if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="2">
  <title>Sultan Restaurant POS - Starting</title>
  <style>
    body { background: #1a0f0f; color: #d4af37; font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    h1 { margin-bottom: 8px; font-size: 26px; }
    p { color: #f5e6ca; font-size: 15px; opacity: 0.85; }
    .loader { width: 40px; height: 40px; border: 4px solid #331515; border-top: 4px solid #d4af37; border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 18px; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="loader"></div>
  <h1>👑 Sultan Restaurant POS</h1>
  <p>Loading application resources, please wait a moment...</p>
</body>
</html>`);
      return;
    }
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found', server: 'Sultan Restaurant Hub' }));
}

// In-memory RAM cache for static web assets (raw + gzipped) for <1ms instant page loads
const staticAssetCache = new Map();

function getCachedStaticAsset(filePath, canGzip) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return null;
    const cacheKey = filePath;
    const cached = staticAssetCache.get(cacheKey);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      if (canGzip && !cached.gzipped) {
        cached.gzipped = zlib.gzipSync(cached.raw, { level: 6 });
      }
      return cached;
    }
    const raw = fs.readFileSync(filePath);
    const entry = {
      mtimeMs: stat.mtimeMs,
      raw,
      gzipped: canGzip ? zlib.gzipSync(raw, { level: 6 }) : null,
    };
    staticAssetCache.set(cacheKey, entry);
    return entry;
  } catch (_) {
    return null;
  }
}
const server = http.createServer(handleRequest);
const server5000 = http.createServer(handleRequest);
let server80 = null;
try {
  server80 = http.createServer(handleRequest);
} catch (e) {}

const wss = new WebSocketServer({ noServer: true });

function bindUpgrade(srv) {
  if (!srv) return;
  srv.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });
}
bindUpgrade(server);
bindUpgrade(server5000);
if (server80) bindUpgrade(server80);

function broadcastToClients(msgObj, excludeWs = null) {
  const payload = JSON.stringify(msgObj);
  for (const client of wss.clients) {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

const recentServerPacketIds = new Set();
function hasProcessedServerPacket(packetId) {
  if (!packetId || typeof packetId !== 'string') return false;
  if (recentServerPacketIds.has(packetId)) return true;
  recentServerPacketIds.add(packetId);
  if (recentServerPacketIds.size > 300) {
    const oldest = recentServerPacketIds.values().next().value;
    if (oldest) recentServerPacketIds.delete(oldest);
  }
  return false;
}

let lastStateFingerprint = '';
function computeStateFingerprint(st) {
  try {
    return JSON.stringify({
      tickets: st.tickets || [],
      deletedTicketIds: st.deletedTicketIds || [],
      tables: (st.tables || []).map(t => ({
        id: t.id,
        status: t.status,
        billTotal: t.billTotal,
        isPaid: t.isPaid,
        server: t.server,
        occupiedSince: t.occupiedSince,
        lastSettledAt: t.lastSettledAt,
        ordersLen: Array.isArray(t.orders) ? t.orders.length : 0,
      })),
      onlineOrdersLen: Array.isArray(st.onlineOrders) ? st.onlineOrders.map(o => `${o.id}:${o.status}`).join(',') : '',
      invoicesLen: Array.isArray(st.invoices) ? st.invoices.length : 0,
      menuLen: Array.isArray(st.menuItems) ? st.menuItems.length : 0,
      lastBillPaidAlert: st.lastBillPaidAlert || null,
      lastFoodReadyAlert: st.lastFoodReadyAlert || null,
      pendingFloorOrderAlert: st.pendingFloorOrderAlert || null,
    });
  } catch (_) {
    return String(Date.now());
  }
}

function applyStateUpdate(partialState, senderId, originWs = null) {
  if (!partialState || typeof partialState !== 'object') return;

  const prevFingerprint = lastStateFingerprint || computeStateFingerprint(serverState);

  // Merge state keys safely (deletedTicketIds, tickets, and tables MUST be processed first in order)
  const allowedKeys = ['deletedTicketIds', 'tickets', 'tables', 'onlineOrders', 'pendingFloorOrderAlert', 'appUsers', 'appUserLogs', 'invoices', 'menuItems', 'categories', 'regions', 'zones', 'staff', 'customers', 'reservations', 'lastBillPaidAlert', 'lastFoodReadyAlert', 'serviceRequests', 'playlandTickets', 'playlandRides', 'inventory', 'stockMovements', 'chillerHandovers', 'expenses', 'feedback', 'unavailableItemIds', 'suppliers', 'purchaseOrders', 'supplierPayments', 'recipes', 'kitchenSessions', 'kitchenConsumption', 'kitchenManualUsage', 'kitchenCash', 'kitchenSettings', 'assets', 'damageRecords', 'shifts', 'activeShiftId', 'roles'];
  let modified = false;

  // Pre-collect any ticket IDs explicitly deleted or belonging to tables being newly billed/settled in this update
  if (!Array.isArray(serverState.deletedTicketIds)) {
    serverState.deletedTicketIds = [];
  }
  const incomingDeleted = Array.isArray(partialState.deletedTicketIds) ? partialState.deletedTicketIds : [];
  const autoRetiredTicketIds = [];
  if (Array.isArray(partialState.tables) && Array.isArray(serverState.tables)) {
    const currTableMap = new Map(serverState.tables.map(t => [t.id, t]));
    for (const incT of partialState.tables) {
      if (!incT || !incT.id) continue;
      const currT = currTableMap.get(incT.id);
      if (!currT) continue;
      const newlyBilled = currT.status !== 'billed' && incT.status === 'billed' && incT.isPaid;
      const newlySettledFromBilled = currT.status === 'billed' && incT.status === 'available';
      const newlySettledByTimestamp =
        (currT.status === 'occupied' || currT.status === 'billed') &&
        incT.status === 'available' &&
        incT.lastSettledAt &&
        incT.lastSettledAt >= (currT.occupiedSince || 0);
      if (newlyBilled || newlySettledFromBilled || newlySettledByTimestamp) {
        const cutoff = incT.lastSettledAt || Date.now();
        for (const tk of (serverState.tickets || [])) {
          if (tk && tk.tableId === incT.id && (!tk.timePlaced || tk.timePlaced <= cutoff + 2000)) {
            autoRetiredTicketIds.push(tk.id);
          }
        }
      }
    }
  }
  if (incomingDeleted.length > 0 || autoRetiredTicketIds.length > 0) {
    serverState.deletedTicketIds = Array.from(
      new Set([...serverState.deletedTicketIds, ...incomingDeleted, ...autoRetiredTicketIds])
    ).slice(-400);
  }
  const deletedSet = new Set(serverState.deletedTicketIds);

  for (const key of allowedKeys) {
    if (partialState[key] !== undefined) {
      if (key === 'deletedTicketIds') {
        modified = true;
      } else if (key === 'tickets') {
        const incomingTickets = Array.isArray(partialState.tickets) ? partialState.tickets : [];
        const existingTickets = Array.isArray(serverState.tickets) ? serverState.tickets : [];
        
        // Status hierarchy: pending -> cooking -> ready -> served
        const STATUS_RANK = { pending: 0, cooking: 1, ready: 2, served: 3 };

        const existingMap = new Map(existingTickets.filter(t => t && t.id).map(t => [t.id, t]));
        const incomingMap = new Map(incomingTickets.filter(t => t && t.id).map(t => [t.id, t]));
        // Incoming keys first so newest KOTs appear at the top of KDS/POS
        const allTicketIds = new Set([...incomingMap.keys(), ...existingMap.keys()]);
        const mergedList = [];

        for (const tId of allTicketIds) {
          // Never resurrect a ticket that has been billed, settled, or dismissed
          if (deletedSet.has(tId)) continue;

          const inc = incomingMap.get(tId);
          const ext = existingMap.get(tId);

          if (inc && ext) {
            const extRank = STATUS_RANK[ext.status] ?? 0;
            const incRank = STATUS_RANK[inc.status] ?? 0;
            let chosen = extRank > incRank ? { ...ext } : { ...inc };

            // Merge item-level ready/served states
            if (Array.isArray(ext.items) && Array.isArray(inc.items)) {
              const extItemsMap = new Map(ext.items.map(it => [it.id, it]));
              chosen.items = inc.items.map(incIt => {
                const extIt = extItemsMap.get(incIt.id);
                if (!extIt) return incIt;
                const extItRank = extIt.itemStatus ? (STATUS_RANK[extIt.itemStatus] ?? 0) : (extIt.completed ? 2 : 0);
                const incItRank = incIt.itemStatus ? (STATUS_RANK[incIt.itemStatus] ?? 0) : (incIt.completed ? 2 : 0);
                if (extItRank > incItRank) {
                  return { ...incIt, itemStatus: extIt.itemStatus, completed: extIt.completed, readyAt: extIt.readyAt };
                }
                return incIt;
              });
            }

            if (chosen.status === 'served' && Array.isArray(chosen.items)) {
              chosen.items = chosen.items.map(it => ({ ...it, completed: true, itemStatus: 'served' }));
            }
            mergedList.push(chosen);
          } else if (inc) {
            if (inc.status === 'served' && Array.isArray(inc.items)) {
              inc.items = inc.items.map(it => ({ ...it, completed: true, itemStatus: 'served' }));
            }
            mergedList.push(inc);
          } else if (ext) {
            // Preserve active server tickets when an out-of-sync client sends a partial/older ticket list
            mergedList.push(ext);
          }
        }

        serverState.tickets = mergedList;
        modified = true;
      } else if (key === 'tables') {
        const incomingTables = Array.isArray(partialState.tables) ? partialState.tables : [];
        if (incomingTables.length > 0) {
          const currentTables = Array.isArray(serverState.tables) ? serverState.tables : [];
          const incomingMap = new Map(incomingTables.map(t => [t.id, t]));
          const activeTickets = Array.isArray(serverState.tickets) ? serverState.tickets : [];
          
          serverState.tables = currentTables.map(curr => {
            const inc = incomingMap.get(curr.id);
            if (!inc) return curr;

            const tableTickets = activeTickets.filter(tk => tk && tk.tableId === curr.id);

            // If table has active unbilled tickets on the server, never allow an out-of-sync client to revert it to 'available'
            if (tableTickets.length > 0 && inc.status !== 'billed') {
              const ticketTotal = tableTickets.reduce(
                (sum, tk) => sum + (tk.items || []).reduce((s, it) => s + ((it.price || 0) * (it.qty || 1)), 0),
                0
              );
              const ticketOrders = tableTickets.flatMap(tk => (tk.items || []).map(i => ({ ...i })));
              const base = (inc.status === 'occupied' && (inc.occupiedSince || 0) >= (curr.occupiedSince || 0))
                ? { ...curr, ...inc }
                : { ...inc, ...curr };
              const bestOrders =
                Array.isArray(base.orders) && base.orders.length >= ticketOrders.length && base.orders.length > 0
                  ? base.orders
                  : ticketOrders;
              return {
                ...base,
                status: 'occupied',
                isPaid: false,
                occupiedSince: Math.max(curr.occupiedSince || 0, inc.occupiedSince || 0) || Date.now(),
                billTotal: Math.max(curr.billTotal || 0, inc.billTotal || 0, ticketTotal),
                orders: bestOrders,
                server: inc.server || curr.server || tableTickets[0].server,
              };
            }

            // If no active tickets remain for this table and it had an order or is being cleared/settled, release it to 'available'
            if (
              tableTickets.length === 0 &&
              inc.status !== 'billed' &&
              (inc.status === 'available' ||
                (curr.status === 'occupied' && ((Array.isArray(curr.orders) && curr.orders.length > 0) || (curr.billTotal || 0) > 0)))
            ) {
              return {
                ...curr,
                ...inc,
                status: 'available',
                billTotal: 0,
                orders: [],
                isPaid: false,
                server: undefined,
                lastInvoiceId: undefined,
                occupiedSince: undefined,
                lastSettledAt: inc.lastSettledAt || curr.lastSettledAt || Date.now(),
              };
            }

            return { ...curr, ...inc };
          });

          // Append any newly added tables
          const existingIds = new Set(serverState.tables.map(t => t.id));
          for (const inc of incomingTables) {
            if (!existingIds.has(inc.id)) {
              serverState.tables.push(inc);
            }
          }
          modified = true;
        }
      } else if (key === 'menuItems') {
        const incomingMenu = Array.isArray(partialState.menuItems) ? partialState.menuItems : [];
        if (incomingMenu.length > 0) {
          const currentMenu = serverState.menuItems || [];
          const incomingById = new Map(incomingMenu.map(m => [m.id, m]));
          const incomingByName = new Map(incomingMenu.map(m => [(m.name || '').trim().toLowerCase(), m]));

          // Update existing dishes
          const merged = currentMenu.map(curr => {
            const inc = incomingById.get(curr.id) || incomingByName.get((curr.name || '').trim().toLowerCase());
            return inc ? { ...curr, ...inc } : curr;
          });

          // Append any newly added custom dishes
          const existingIds = new Set(merged.map(m => m.id));
          const existingNames = new Set(merged.map(m => (m.name || '').trim().toLowerCase()));
          for (const inc of incomingMenu) {
            const incName = (inc.name || '').trim().toLowerCase();
            if (!existingIds.has(inc.id) && !existingNames.has(incName)) {
              merged.push(inc);
              existingIds.add(inc.id);
              existingNames.add(incName);
            }
          }

          serverState.menuItems = merged;
          modified = true;
        }
      } else if (key === 'categories') {
        const incomingCats = Array.isArray(partialState.categories) ? partialState.categories : [];
        if (incomingCats.length > 0) {
          serverState.categories = Array.from(new Set([...(serverState.categories || []), ...incomingCats]));
          modified = true;
        }
      } else if (key === 'regions') {
        const incomingRegs = Array.isArray(partialState.regions) ? partialState.regions : [];
        if (incomingRegs.length > 0) {
          serverState.regions = Array.from(new Set([...(serverState.regions || []), ...incomingRegs]));
          modified = true;
        }
      } else {
        serverState[key] = partialState[key];
        modified = true;
      }
    }
  }

  if (modified) {
    // Reconcile tables with active tickets so any table whose tickets were all removed is released to 'available'
    const activeTicketByTable = new Set((serverState.tickets || []).map(tk => tk && tk.tableId).filter(Boolean));
    if (Array.isArray(serverState.tables)) {
      const nowRec = Date.now();
      serverState.tables = serverState.tables.map(t => {
        if (t.status === 'occupied' && !activeTicketByTable.has(t.id) && !t.mergedInto) {
          return {
            ...t,
            status: 'available',
            billTotal: 0,
            orders: [],
            server: undefined,
            isPaid: false,
            lastInvoiceId: undefined,
            occupiedSince: undefined,
            lastSettledAt: t.lastSettledAt || nowRec,
          };
        }
        return t;
      });
    }

    const nextFingerprint = computeStateFingerprint(serverState);
    if (nextFingerprint === prevFingerprint) {
      return;
    }
    lastStateFingerprint = nextFingerprint;
    serverState.lastUpdated = Date.now();
    persistState();
    console.log(`[Sultan Hub] Synced state update from ${senderId || 'CLIENT'} (tickets: ${(serverState.tickets || []).length}, active ws: ${wss.clients.size})`);
    broadcastToClients({
      type: 'SERVER_BROADCAST',
      state: serverState,
      senderId: senderId || 'SERVER',
      timestamp: serverState.lastUpdated
    }, originWs);
    pushToFirestoreCloud();
  }
}

// ==============================================================
// BIDIRECTIONAL CLOUD FIRESTORE BRIDGE
// ==============================================================
const FIRESTORE_API_KEY = "AIzaSyAzsBG5kc0gFf83DJaluvF42sk_m-9JdAU";
const FIRESTORE_PROJECT_ID = "sultan-resturant";
const FIRESTORE_DOC_URL = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/sultan_restaurant/live_state?key=${FIRESTORE_API_KEY}`;

let lastProcessedCloudTimestamp = Date.now();
let isPushingToFirestore = false;
let isApplyingCloudUpdate = false;
let firestorePushTimer = null;

function decodeFirestoreValue(val) {
  if (!val || typeof val !== 'object') return val;
  if ('stringValue' in val) return val.stringValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('booleanValue' in val) return val.booleanValue;
  if ('nullValue' in val) return null;
  if ('mapValue' in val) {
    const fields = val.mapValue.fields || {};
    const res = {};
    for (const k in fields) res[k] = decodeFirestoreValue(fields[k]);
    return res;
  }
  if ('arrayValue' in val) {
    const values = val.arrayValue.values || [];
    return values.map(decodeFirestoreValue);
  }
  return val;
}

function encodeFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'string') return { stringValue: val };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { integerValue: val.toString() };
    return { doubleValue: val };
  }
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(encodeFirestoreValue) } };
  }
  if (typeof val === 'object') {
    const fields = {};
    for (const k in val) {
      if (val[k] !== undefined) fields[k] = encodeFirestoreValue(val[k]);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function pushToFirestoreCloud() {
  if (isApplyingCloudUpdate) return;
  if (firestorePushTimer) clearTimeout(firestorePushTimer);
  firestorePushTimer = setTimeout(async () => {
    if (isPushingToFirestore) return;
    isPushingToFirestore = true;
    try {
      const now = Date.now();
      lastProcessedCloudTimestamp = now;
      const payload = {
        type: 'SERVER_BROADCAST',
        senderId: 'SERVER_POS_HUB',
        timestamp: now,
        state: {
          tables: serverState.tables,
          tickets: serverState.tickets,
          deletedTicketIds: serverState.deletedTicketIds || [],
          menuItems: serverState.menuItems,
          categories: serverState.categories,
          staff: serverState.staff,
          onlineOrders: serverState.onlineOrders,
          pendingFloorOrderAlert: serverState.pendingFloorOrderAlert,
          lastBillPaidAlert: serverState.lastBillPaidAlert,
          lastFoodReadyAlert: serverState.lastFoodReadyAlert,
          roles: serverState.roles,
          shifts: serverState.shifts,
          activeShiftId: serverState.activeShiftId,
        }
      };
      const fields = {};
      for (const k in payload) {
        fields[k] = encodeFirestoreValue(payload[k]);
      }
      await fetch(FIRESTORE_DOC_URL, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields })
      });
    } catch (_) {
      // Local LAN continues seamlessly if cloud is offline
    } finally {
      isPushingToFirestore = false;
    }
  }, 400);
}

async function pollFirestoreCloud() {
  if (isPushingToFirestore) return;
  try {
    const res = await fetch(FIRESTORE_DOC_URL);
    if (!res.ok) return;
    const doc = await res.json();
    const fields = doc.fields || {};
    const senderId = fields.senderId?.stringValue;
    if (senderId === 'SERVER_POS_HUB') return;
    const timestamp = Number(fields.timestamp?.integerValue || 0);
    if (timestamp && timestamp <= lastProcessedCloudTimestamp) return;

    if (fields.state?.mapValue?.fields) {
      const decodedState = decodeFirestoreValue(fields.state);
      if (decodedState && typeof decodedState === 'object') {
        isApplyingCloudUpdate = true;
        lastProcessedCloudTimestamp = timestamp || Date.now();
        applyStateUpdate(decodedState, senderId);
        setTimeout(() => { isApplyingCloudUpdate = false; }, 300);
      }
    }
  } catch (_) {
    // Network retry next pulse
  }
}

// Start Cloud Firestore bridge pulse
setInterval(pollFirestoreCloud, 2500);
setTimeout(pollFirestoreCloud, 500);

wss.on('connection', (ws, req) => {
  const remoteIp = req.socket.remoteAddress;
  console.log(`[Sultan Hub] New device connected from ${remoteIp}. Total devices: ${wss.clients.size}`);

  ws.send(JSON.stringify({
    type: 'INIT_STATE',
    state: serverState,
    senderId: 'SERVER',
    timestamp: Date.now()
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.type === 'CLIENT_UPDATE' && data.state) {
        if (!hasProcessedServerPacket(data.packetId)) {
          applyStateUpdate(data.state, data.senderId, ws);
        }
      } else if (data.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
      }
    } catch (e) {
      console.error('[Sultan Hub] Bad WS message:', e.message);
    }
  });

  ws.on('close', () => {
    console.log(`[Sultan Hub] Device disconnected. Total active: ${wss.clients.size}`);
  });

  ws.on('error', (err) => {
    console.error('[Sultan Hub] WS socket error:', err.message);
  });
});

function listenDualStack(srv, port, onSuccess, onError) {
  if (!srv) return;
  srv.on('error', (err) => {
    if (onError) onError(err);
  });
  try {
    srv.listen({ port: Number(port), host: '::', ipv6Only: false }, onSuccess);
  } catch (_) {
    srv.listen(Number(port), '0.0.0.0', onSuccess);
  }
}

listenDualStack(
  server,
  PORT,
  () => {
    console.log(`=================================================`);
    console.log(`🏰 SULTAN RESTAURANT CENTRAL POS & API HUB ONLINE`);
    console.log(`📡 Port: ${PORT} (Dual-Stack IPv4 0.0.0.0 + IPv6 ::)`);
    console.log(`👤 Auth API: http://localhost:${PORT}/api/auth/login`);
    console.log(`📊 Admin Users API: http://localhost:${PORT}/api/admin/app-users`);
    console.log(`🌐 Public Menu: http://localhost:${PORT}/api/public/menu`);
    console.log(`📦 Online Orders: http://localhost:${PORT}/api/public/orders`);
    console.log(`⚡ WebSocket URL: ws://localhost:${PORT}`);
    console.log(`=================================================`);
  },
  (err) => {
    console.log(`[Sultan Hub] Port ${PORT} listener:`, err.message);
  }
);

listenDualStack(
  server5000,
  5000,
  () => {
    console.log(`📡 Sultan POS Hub also active on Port 5000 (Firewall-Friendly LAN Range)`);
  },
  (err) => {
    console.log('[Sultan Hub] Port 5000 listener:', err.message);
  }
);

if (server80) {
  listenDualStack(
    server80,
    80,
    () => {
      console.log(`🌐 Sultan POS Hub also active on Port 80 (Standard WWW HTTP)`);
    },
    (err) => {
      console.log('[Sultan Hub] Port 80 listener:', err.message);
    }
  );
}
