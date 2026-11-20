const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const WebSocket = require('ws');
const WebSocketServer = WebSocket.Server;

const PORT = process.env.PORT || 5050;
const DATA_FILE = path.join(__dirname, 'server-data.json');
let printerHelper = null;
try {
  printerHelper = require('./printerHelper');
} catch (e) {
  console.warn('[Sultan Hub] printerHelper load error:', e.message);
}

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
    "id": "slt-sal-caesar",
    "name": "Caesar Salad",
    "price": 890,
    "category": "Salad",
    "region": "Continental",
    "station": "main",
    "prepTimeMin": 12,
    "imageUri": "https://images.unsplash.com/photo-1546793665-c74683f339c1?w=800&q=80",
    "description": "Fresh crunchy Iceberg, grilled chicken, sun-dried tomatoes, tossed in Chef's special sauce, topped with croutons & Black olives & boiled eggs"
  },
  {
    "id": "slt-sal-fruity-nutty",
    "name": "Fruity Nutty Salad",
    "price": 890,
    "category": "Salad",
    "region": "Continental",
    "station": "main",
    "prepTimeMin": 10,
    "imageUri": "https://images.unsplash.com/photo-1519996529931-28324d5a630e?w=800&q=80",
    "description": "Julienne cut apples, Papaya, carrots tossed in honey sauce, topped with dry nuts"
  },
  {
    "id": "slt-sal-russian",
    "name": "Russian Salad",
    "price": 650,
    "category": "Salad",
    "region": "Continental",
    "station": "main",
    "prepTimeMin": 10,
    "imageUri": "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=800&q=80",
    "description": "Classic creamy Russian salad with fresh cube-cut Apple & Fruit Cocktail Topped with dry Nuts"
  },
  {
    "id": "slt-sal-green",
    "name": "Fresh Green Salad",
    "price": 250,
    "category": "Salad",
    "region": "Pakistani",
    "station": "main",
    "prepTimeMin": 8,
    "imageUri": "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&q=80",
    "description": "Fresh garden vegetables with our signature dressing"
  },
  {
    "id": "slt-app-dynamite-prawns",
    "name": "Dynamite Prawns",
    "price": 1150,
    "category": "Appetizers",
    "region": "Continental",
    "station": "main",
    "prepTimeMin": 14,
    "badge": "Chef Special",
    "imageUri": "https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?w=800&q=80",
    "description": "Crispy battered fried prawns tossed in Dynamite sauce, served with Iceberg"
  },
  {
    "id": "slt-app-loaded-hummus",
    "name": "Loaded Hummus",
    "price": 1150,
    "category": "Appetizers",
    "region": "Arabic",
    "station": "main",
    "prepTimeMin": 12,
    "imageUri": "https://images.unsplash.com/photo-1541518763669-27fef04b14ea?w=800&q=80",
    "description": "Creamy chickpea hummus topped with grilled chicken, tahini sauce & Extra Virgin olive oil, served with Pita Bread & Carrot sticks"
  },
  {
    "id": "slt-app-stuffed-peri-bite",
    "name": "Stuffed Peri Bite",
    "price": 999,
    "category": "Appetizers",
    "region": "Continental",
    "station": "main",
    "prepTimeMin": 15,
    "imageUri": "https://images.unsplash.com/photo-1562967914-608f82629710?w=800&q=80",
    "description": "Thin layered stuffed chicken, crunchy fried, served with Peri Peri sauce"
  },
  {
    "id": "slt-app-finger-fish",
    "name": "Finger Fish",
    "price": 999,
    "category": "Appetizers",
    "region": "Continental",
    "station": "main",
    "prepTimeMin": 15,
    "imageUri": "https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=800&q=80",
    "description": "Crispy fried boneless fish, served with Tartar sauce & fries"
  },
  {
    "id": "slt-app-chicken-dynamite",
    "name": "Chicken Dynamite",
    "price": 850,
    "category": "Appetizers",
    "region": "Continental",
    "station": "main",
    "prepTimeMin": 12,
    "imageUri": "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=800&q=80",
    "description": "Crispy battered fried chicken tossed in Dynamite sauce, served with Iceberg"
  },
  {
    "id": "slt-app-loaded-fries",
    "name": "Loaded Fries",
    "price": 699,
    "category": "Appetizers",
    "region": "Fast Food",
    "station": "main",
    "prepTimeMin": 10,
    "imageUri": "https://images.unsplash.com/photo-1585109649139-366815a0d713?w=800&q=80",
    "description": "Crispy fries topped with cheese sauce, chicken & sauces"
  },
  {
    "id": "slt-app-honey-chilli-wings",
    "name": "Honey Chilli Wings",
    "price": 599,
    "category": "Appetizers",
    "region": "Chinese",
    "station": "main",
    "prepTimeMin": 14,
    "imageUri": "https://images.unsplash.com/photo-1527477378378-0c6f50529d33?w=800&q=80",
    "description": "Crispy chicken wings tossed in sweet honey-chilli glaze, served with Iceberg"
  },
  {
    "id": "slt-app-masala-fries",
    "name": "Masala Fries",
    "price": 399,
    "category": "Appetizers",
    "region": "Fast Food",
    "station": "main",
    "prepTimeMin": 8,
    "imageUri": "https://images.unsplash.com/photo-1576107232684-1279f3908594?w=800&q=80",
    "description": "Crispy fries tossed in spicy masala seasoning"
  },
  {
    "id": "slt-app-fish-cracker",
    "name": "Fish Cracker",
    "price": 399,
    "category": "Appetizers",
    "region": "Chinese",
    "station": "main",
    "prepTimeMin": 6,
    "imageUri": "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=800&q=80",
    "description": "Crispy fried fish crackers served with a dip"
  },
  {
    "id": "slt-app-plain-fries",
    "name": "Plain Fries",
    "price": 350,
    "category": "Appetizers",
    "region": "Fast Food",
    "station": "main",
    "prepTimeMin": 8,
    "imageUri": "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=800&q=80",
    "description": "Classic salted crispy french fries"
  },
  {
    "id": "slt-sop-sultan-special",
    "name": "Sultan Special Soup",
    "price": 1450,
    "category": "Soup",
    "region": "Chinese",
    "station": "main",
    "prepTimeMin": 15,
    "badge": "Chef Special",
    "imageUri": "https://images.unsplash.com/photo-1547592166-23ac45744acd?w=800&q=80",
    "description": "Signature special soup loaded with chicken, Black Mushrooms, Fish, Prawn, vegetables, Topped on Dry Nuts and secret spices"
  },
  {
    "id": "slt-sop-hot-sour",
    "name": "Hot & Sour Soup",
    "price": 1050,
    "category": "Soup",
    "region": "Chinese",
    "station": "main",
    "prepTimeMin": 12,
    "imageUri": "https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?w=800&q=80",
    "description": "Classic hot & sour soup with chicken & tangy spices"
  },
  {
    "id": "slt-sop-chicken-corn",
    "name": "Chicken Corn Soup",
    "price": 1050,
    "category": "Soup",
    "region": "Chinese",
    "station": "main",
    "prepTimeMin": 12,
    "imageUri": "https://images.unsplash.com/photo-1603105037880-880cd4edfb0d?w=800&q=80",
    "description": "Chicken corn soup with sweet corn & tender chicken pieces"
  },
  {
    "id": "slt-cnt-fish-steak",
    "name": "Fish Steak",
    "price": 1650,
    "category": "Continental",
    "region": "Continental",
    "station": "main",
    "prepTimeMin": 22,
    "imageUri": "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=800&q=80",
    "description": "Perfectly grilled fish fillet topped with lemon butter, tartar sauce, served with crispy fries or mashed potatoes"
  },
  {
    "id": "slt-cnt-fish-chips",
    "name": "Fish & Chips",
    "price": 1590,
    "category": "Continental",
    "region": "Continental",
    "station": "main",
    "prepTimeMin": 18,
    "imageUri": "https://images.unsplash.com/photo-1579208030886-b937da0925dc?w=800&q=80",
    "description": "Crispy fried Fish, Coated in crumbs, Serve with Fries & Tartar Sauce"
  },
  {
    "id": "slt-cnt-tarragon-chicken",
    "name": "Tarragon Chicken",
    "price": 1590,
    "category": "Continental",
    "region": "Continental",
    "station": "main",
    "prepTimeMin": 20,
    "imageUri": "https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80",
    "description": "Grilled chicken steak topped with creamy tarragon sauce, served with crispy fries or mashed potatoes"
  },
  {
    "id": "slt-cnt-pepper-chicken",
    "name": "Pepper Chicken",
    "price": 1590,
    "category": "Continental",
    "region": "Continental",
    "station": "main",
    "prepTimeMin": 20,
    "imageUri": "https://images.unsplash.com/photo-1532550907401-a500c9a57435?w=800&q=80",
    "description": "Juicy grilled chicken steak coated in cracked black pepper sauce with a rich creamy texture, served with crispy fries or mashed potatoes"
  },
  {
    "id": "slt-cnt-moroccan-chicken",
    "name": "Moroccan Chicken",
    "price": 1590,
    "category": "Continental",
    "region": "Continental",
    "station": "main",
    "prepTimeMin": 20,
    "imageUri": "https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=800&q=80",
    "description": "Tender grilled chicken infused with authentic Moroccan spices, topped with special Moroccan sauce, served with crispy fries or mashed potatoes"
  },
  {
    "id": "slt-cnt-mushroom-chicken",
    "name": "Mushroom Chicken",
    "price": 1590,
    "category": "Continental",
    "region": "Continental",
    "station": "main",
    "prepTimeMin": 20,
    "imageUri": "https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?w=800&q=80",
    "description": "Classic grilled chicken steak topped with creamy white mushroom sauce, served with sautéed vegetables & fries or mashed potatoes"
  },
  {
    "id": "slt-cnt-fettuccine-alfredo",
    "name": "Fettuccine Alfredo",
    "price": 1590,
    "category": "Continental",
    "region": "Italian",
    "station": "main",
    "prepTimeMin": 16,
    "imageUri": "https://images.unsplash.com/photo-1645112411341-6c4fd023714a?w=800&q=80",
    "description": "Creamy fettuccine pasta tossed in rich Alfredo sauce with grilled chicken chunks, mushrooms & parmesan cheese"
  },
  {
    "id": "slt-cnt-stuffed-chicken",
    "name": "Sultan Special Stuffed Chicken",
    "price": 1450,
    "category": "Continental",
    "region": "Continental",
    "station": "main",
    "prepTimeMin": 22,
    "badge": "Chef Special",
    "imageUri": "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=800&q=80",
    "description": "Signature stuffed chicken breast filled with cheese & herbs, topped with special creamy sauce, served with crispy fries or mashed potatoes"
  },
  {
    "id": "slt-cnt-arrabbiata-pasta",
    "name": "Arrabbiata Pasta",
    "price": 1350,
    "category": "Continental",
    "region": "Italian",
    "station": "main",
    "prepTimeMin": 16,
    "imageUri": "https://images.unsplash.com/photo-1621996346565-e3d5d6281292?w=800&q=80",
    "description": "Spicy penne pasta tossed in tangy tomato Arrabbiata sauce with herbs, garlic & a touch of chilli"
  },
  {
    "id": "slt-chn-cashew-nut",
    "name": "Chicken Cashew Nut",
    "price": 1499,
    "category": "Chinese",
    "region": "Chinese",
    "station": "main",
    "prepTimeMin": 18,
    "imageUri": "https://images.unsplash.com/photo-1525755662778-989d0524087e?w=800&q=80",
    "description": "Tender chicken cooked with roasted cashew nuts, Spring Onion, capsicum in a mild spicy gravy"
  },
  {
    "id": "slt-chn-manchurian",
    "name": "Chicken Manchurian",
    "price": 1299,
    "category": "Chinese",
    "region": "Chinese",
    "station": "main",
    "prepTimeMin": 16,
    "imageUri": "https://images.unsplash.com/photo-1585032226651-759b368d7246?w=800&q=80",
    "description": "Juicy chicken cooked in tangy & spicy Manchurian sauce with capsicum & onion"
  },
  {
    "id": "slt-chn-chilli-dry",
    "name": "Chicken Chilli Dry",
    "price": 1299,
    "category": "Chinese",
    "region": "Chinese",
    "station": "main",
    "prepTimeMin": 16,
    "badge": "Popular",
    "imageUri": "https://images.unsplash.com/photo-1563245372-f21724e3856d?w=800&q=80",
    "description": "Crispy fried chicken tossed in dry spicy chilli sauce with capsicum, onion, green chillies & fresh ginger"
  },
  {
    "id": "slt-chn-chowmein",
    "name": "Chicken Chowmein",
    "price": 1199,
    "category": "Chinese",
    "region": "Chinese",
    "station": "main",
    "prepTimeMin": 15,
    "imageUri": "https://images.unsplash.com/photo-1612927601601-6638404737ce?w=800&q=80",
    "description": "Stir-fried noodles with shredded chicken & vegetables"
  },
  {
    "id": "slt-chn-special-rice",
    "name": "Special Rice",
    "price": 1050,
    "category": "Chinese",
    "region": "Chinese",
    "station": "main",
    "prepTimeMin": 15,
    "badge": "Chef Special",
    "imageUri": "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=800&q=80",
    "description": "Signature fried rice loaded with chicken, prawns, egg, fruits, nuts & fresh vegetables"
  },
  {
    "id": "slt-chn-masala-rice",
    "name": "Chicken Masala Rice",
    "price": 999,
    "category": "Chinese",
    "region": "Chinese",
    "station": "main",
    "prepTimeMin": 14,
    "imageUri": "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=800&q=80",
    "description": "Spicy masala rice tossed with tender chicken chunks & aromatic spices"
  },
  {
    "id": "slt-chn-fried-rice",
    "name": "Chicken Fried Rice",
    "price": 999,
    "category": "Chinese",
    "region": "Chinese",
    "station": "main",
    "prepTimeMin": 14,
    "imageUri": "https://images.unsplash.com/photo-1536304929831-ee1ca9d44906?w=800&q=80",
    "description": "Classic Chinese style fried rice with juicy chicken, egg & vegetables"
  },
  {
    "id": "slt-piz-train",
    "name": "Train Pizza",
    "price": 5999,
    "category": "Pizza",
    "region": "Italian",
    "station": "main",
    "prepTimeMin": 25,
    "badge": "Grand Feast",
    "imageUri": "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&q=80",
    "description": "Three Flavours of Your Choice: Veggie Pizza, Kabab Crust Pizza, Tikka Pizza",
    "variants": [
      {
        "name": "Family",
        "price": 5999
      }
    ]
  },
  {
    "id": "slt-piz-sultan-special",
    "name": "Sultan Special Pizza",
    "price": 1450,
    "category": "Pizza",
    "region": "Italian",
    "station": "main",
    "prepTimeMin": 20,
    "badge": "Chef Special",
    "imageUri": "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80",
    "description": "Chef's royal recipe with premium mozzarella, smoked chicken, pepperoni, veggies & secret sauce",
    "variants": [
      {
        "name": "Medium (M)",
        "price": 1450
      },
      {
        "name": "Large (L)",
        "price": 2050
      },
      {
        "name": "Family",
        "price": 2250
      }
    ]
  },
  {
    "id": "slt-piz-kabab-crust",
    "name": "Kabab Crust Pizza",
    "price": 1450,
    "category": "Pizza",
    "region": "Italian",
    "station": "main",
    "prepTimeMin": 22,
    "imageUri": "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=800&q=80",
    "description": "Handcrafted golden crust stuffed with succulent minced seekh kababs and melted cheese",
    "variants": [
      {
        "name": "Medium (M)",
        "price": 1450
      },
      {
        "name": "Large (L)",
        "price": 2050
      },
      {
        "name": "Family",
        "price": 2250
      }
    ]
  },
  {
    "id": "slt-piz-crown-crust",
    "name": "Crown Crust Pizza",
    "price": 1450,
    "category": "Pizza",
    "region": "Italian",
    "station": "main",
    "prepTimeMin": 22,
    "badge": "Signature Crust",
    "imageUri": "https://images.unsplash.com/photo-1590947132387-155cc02f3212?w=800&q=80",
    "description": "Crown-shaped crust filled with creamy cheese & spicy chicken chunks with rich toppings",
    "variants": [
      {
        "name": "Medium (M)",
        "price": 1450
      },
      {
        "name": "Large (L)",
        "price": 2050
      },
      {
        "name": "Family",
        "price": 2250
      }
    ]
  },
  {
    "id": "slt-piz-tikka",
    "name": "Tikka Pizza",
    "price": 1350,
    "category": "Pizza",
    "region": "Italian",
    "station": "main",
    "prepTimeMin": 18,
    "imageUri": "https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?w=800&q=80",
    "description": "Traditional spicy chicken tikka chunks with onions, bell peppers & gooey melted cheese",
    "variants": [
      {
        "name": "Medium (M)",
        "price": 1350
      },
      {
        "name": "Large (L)",
        "price": 1950
      },
      {
        "name": "Family",
        "price": 2150
      }
    ]
  },
  {
    "id": "slt-piz-cheese-lover",
    "name": "Cheese Lover Pizza",
    "price": 1250,
    "category": "Pizza",
    "region": "Italian",
    "station": "main",
    "prepTimeMin": 16,
    "imageUri": "https://images.unsplash.com/photo-1571407970349-bc81e7e96d47?w=800&q=80",
    "description": "Loaded double blend of mozzarella and cheddar cheese over rich Italian tomato base",
    "variants": [
      {
        "name": "Medium (M)",
        "price": 1250
      },
      {
        "name": "Large (L)",
        "price": 1850
      },
      {
        "name": "Family",
        "price": 2050
      }
    ]
  },
  {
    "id": "slt-piz-turkish-fatayer",
    "name": "Turkish Fatayer Pizza",
    "price": 1450,
    "category": "Pizza",
    "region": "Turkish",
    "station": "main",
    "prepTimeMin": 18,
    "imageUri": "https://images.unsplash.com/photo-1585238342024-78d387f4a707?w=800&q=80",
    "description": "Authentic boat-shaped Turkish pastry pizza topped with spiced meats, cheese & herbs",
    "variants": [
      {
        "name": "Large (L) / Standard",
        "price": 1450
      }
    ]
  },
  {
    "id": "slt-fst-beef-smash",
    "name": "Beef Smash Burger",
    "price": 990,
    "category": "Fast Food",
    "region": "Fast Food",
    "station": "main",
    "prepTimeMin": 16,
    "badge": "Top Rated",
    "imageUri": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=80",
    "description": "Premium beef patty smashed on grill loaded with melted cheese, caramelized onions, lettuce, tomato & special sauce, served with fries & coleslaw"
  },
  {
    "id": "slt-fst-chicken-smash",
    "name": "Chicken Smash Burger",
    "price": 790,
    "category": "Fast Food",
    "region": "Fast Food",
    "station": "main",
    "prepTimeMin": 15,
    "imageUri": "https://images.unsplash.com/photo-1550547660-d9450f859349?w=800&q=80",
    "description": "Premium Chicken patty smashed on grill loaded with melted cheese, caramelized onions, lettuce, tomato & special sauce, served with fries & coleslaw"
  },
  {
    "id": "slt-fst-grilled-burger",
    "name": "Grilled Chicken Burger",
    "price": 790,
    "category": "Fast Food",
    "region": "Fast Food",
    "station": "main",
    "prepTimeMin": 15,
    "imageUri": "https://images.unsplash.com/photo-1521305916504-4a1121188589?w=800&q=80",
    "description": "Grilled chicken fillet marinated in herbs and spices, topped with fresh lettuce, creamy mayo, & cheese, served with crispy fries & coleslaw"
  },
  {
    "id": "slt-fst-zinger-burger",
    "name": "Zinger Chicken Burger",
    "price": 450,
    "category": "Fast Food",
    "region": "Fast Food",
    "station": "main",
    "prepTimeMin": 12,
    "badge": "Crispy Bestseller",
    "imageUri": "https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b?w=800&q=80",
    "description": "Crispy, spicy Zinger with fresh lettuce & creamy mayo, served with crispy golden fries & coleslaw"
  },
  {
    "id": "slt-fst-sultan-panini",
    "name": "Sultan Special Panini",
    "price": 990,
    "category": "Fast Food",
    "region": "Fast Food",
    "station": "main",
    "prepTimeMin": 14,
    "badge": "Chef Special",
    "imageUri": "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=800&q=80",
    "description": "Double chicken, double cheese, Sun-dried Tomato, Pepperoni & Sultan special secret sauce, served with crispy fries & coleslaw"
  },
  {
    "id": "slt-fst-jalapeno-panini",
    "name": "Jalapeno Panini",
    "price": 790,
    "category": "Fast Food",
    "region": "Fast Food",
    "station": "main",
    "prepTimeMin": 14,
    "imageUri": "https://images.unsplash.com/photo-1509722747041-616f39b57569?w=800&q=80",
    "description": "Grilled Italian panini bread stuffed with chicken, cheese, jalapenos, olives & spicy jalapeno sauce, served with golden fries & coleslaw"
  },
  {
    "id": "slt-fst-grilled-panini",
    "name": "Grilled Chicken Panini",
    "price": 790,
    "category": "Fast Food",
    "region": "Fast Food",
    "station": "main",
    "prepTimeMin": 14,
    "imageUri": "https://images.unsplash.com/photo-1554433607-66b5efe9d304?w=800&q=80",
    "description": "Panini bread filled with grilled chicken chunks, mozzarella cheese, bell peppers & creamy sauce, served with crispy fries & coleslaw"
  },
  {
    "id": "slt-fst-club-sandwich",
    "name": "Classic Club Sandwich",
    "price": 790,
    "category": "Fast Food",
    "region": "Fast Food",
    "station": "main",
    "prepTimeMin": 14,
    "imageUri": "https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=800&q=80",
    "description": "Triple-layer classic club with grilled chicken, fried egg, cheese, lettuce & mayo, cut into 4 triangles & served with fries & coleslaw"
  },
  {
    "id": "slt-brs-chicken-broast",
    "name": "Chicken Broast",
    "price": 1350,
    "category": "Broast",
    "region": "Fast Food",
    "station": "main",
    "prepTimeMin": 20,
    "badge": "Golden Crispy",
    "imageUri": "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=800&q=80",
    "description": "Crispy, juicy chicken broast with a delicious special flavor",
    "variants": [
      {
        "name": "Half",
        "price": 1350
      },
      {
        "name": "Full",
        "price": 2299
      }
    ]
  },
  {
    "id": "slt-tur-roghan-josh",
    "name": "Mutton Roghan Josh",
    "price": 4999,
    "category": "Turkish Cuisine",
    "region": "Turkish",
    "station": "main",
    "prepTimeMin": 30,
    "badge": "Royal Dish",
    "imageUri": "https://images.unsplash.com/photo-1545247181-516773cae754?w=800&q=80",
    "description": "Special Turkish mutton masala with mughlai spices, tender mutton pieces in aromatic gravy"
  },
  {
    "id": "slt-tur-pasha-gosht",
    "name": "Pasha Gosht",
    "price": 4299,
    "category": "Turkish Cuisine",
    "region": "Turkish",
    "station": "main",
    "prepTimeMin": 30,
    "badge": "Pasha Royal",
    "imageUri": "https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=800&q=80",
    "description": "Royal Pasha style mutton curry, premium cut mutton in rich & flavorful Turkish gravy"
  },
  {
    "id": "slt-tur-mutton-larva",
    "name": "Mutton Larva",
    "price": 3999,
    "category": "Turkish Cuisine",
    "region": "Turkish",
    "station": "main",
    "prepTimeMin": 30,
    "imageUri": "https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80",
    "description": "Traditional Turkish mutton larva, slow-cooked mutton in rich Turkish spices & yogurt"
  },
  {
    "id": "slt-bbq-mutton-champ",
    "name": "Mutton Champ",
    "price": 3300,
    "category": "BBQ",
    "region": "BBQ",
    "station": "main",
    "prepTimeMin": 25,
    "badge": "Chef Special",
    "imageUri": "https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80",
    "description": "Tender prime mutton ribs grilled over charcoal with royal aromatic rub",
    "variants": [
      {
        "name": "06 PCS",
        "price": 3300
      }
    ]
  },
  {
    "id": "slt-bbq-mutton-kabab",
    "name": "Mutton Kabab",
    "price": 1799,
    "category": "BBQ",
    "region": "BBQ",
    "station": "main",
    "prepTimeMin": 20,
    "imageUri": "https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=800&q=80",
    "description": "Minced mutton seasoned with traditional herbs and skewered over embers",
    "variants": [
      {
        "name": "05 PCS",
        "price": 1799
      }
    ]
  },
  {
    "id": "slt-bbq-reshmi-kabab",
    "name": "Reshmi Kabab",
    "price": 1799,
    "category": "BBQ",
    "region": "BBQ",
    "station": "main",
    "prepTimeMin": 18,
    "imageUri": "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80",
    "description": "Silky tender chicken mince kababs infused with cream, cheese & green coriander",
    "variants": [
      {
        "name": "05 PCS",
        "price": 1799
      }
    ]
  },
  {
    "id": "slt-bbq-mint-cheese-kabab",
    "name": "Mint Cheese Kabab",
    "price": 1799,
    "category": "BBQ",
    "region": "BBQ",
    "station": "main",
    "prepTimeMin": 18,
    "badge": "Signature",
    "imageUri": "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=800&q=80",
    "description": "Grilled skewers with melted mozzarella cheese center and refreshing wild mint",
    "variants": [
      {
        "name": "05 PCS",
        "price": 1799
      }
    ]
  },
  {
    "id": "slt-bbq-chicken-kabab",
    "name": "Chicken Kabab",
    "price": 1499,
    "category": "BBQ",
    "region": "BBQ",
    "station": "main",
    "prepTimeMin": 16,
    "imageUri": "https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?w=800&q=80",
    "description": "Spiced chicken mince seekh kababs barbecued on open wood embers",
    "variants": [
      {
        "name": "05 PCS",
        "price": 1499
      }
    ]
  },
  {
    "id": "slt-bbq-fish-tikka",
    "name": "Fish Tikka",
    "price": 2299,
    "category": "BBQ",
    "region": "BBQ",
    "station": "main",
    "prepTimeMin": 20,
    "imageUri": "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=800&q=80",
    "description": "Boneless fish cubes marinated in lemon, carom seeds & royal tikka marinade",
    "variants": [
      {
        "name": "10 PCS",
        "price": 2299
      }
    ]
  },
  {
    "id": "slt-bbq-kastoori-boti",
    "name": "Chicken Kastoori Boti",
    "price": 1850,
    "category": "BBQ",
    "region": "BBQ",
    "station": "main",
    "prepTimeMin": 20,
    "imageUri": "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=800&q=80",
    "description": "Boneless chicken marinated with fenugreek leaves, saffron and royal creamy yogurt",
    "variants": [
      {
        "name": "10 PCS",
        "price": 1850
      }
    ]
  },
  {
    "id": "slt-bbq-qandhari-boti",
    "name": "Qandhari Boti",
    "price": 1850,
    "category": "BBQ",
    "region": "BBQ",
    "station": "main",
    "prepTimeMin": 20,
    "imageUri": "https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=800&q=80",
    "description": "Authentic Afghan style spicy tender marinated chicken boti grilled to perfection",
    "variants": [
      {
        "name": "10 PCS",
        "price": 1850
      }
    ]
  },
  {
    "id": "slt-bbq-haryali-boti",
    "name": "Haryali Boti",
    "price": 1850,
    "category": "BBQ",
    "region": "BBQ",
    "station": "main",
    "prepTimeMin": 18,
    "imageUri": "https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=800&q=80",
    "description": "Chicken cubes coated in aromatic green herb paste of mint, coriander and green chilies",
    "variants": [
      {
        "name": "10 PCS",
        "price": 1850
      }
    ]
  },
  {
    "id": "slt-bbq-malai-boti",
    "name": "Special Malai Boti",
    "price": 1499,
    "category": "BBQ",
    "region": "BBQ",
    "station": "main",
    "prepTimeMin": 18,
    "badge": "Most Popular",
    "imageUri": "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=800&q=80",
    "description": "Mouth melting chicken chunks marinated with thick dairy cream, cheese and mild white pepper",
    "variants": [
      {
        "name": "10 PCS",
        "price": 1499
      }
    ]
  },
  {
    "id": "slt-bbq-tandoori-boti",
    "name": "Chicken Tandoori Boti with Bone",
    "price": 1499,
    "category": "BBQ",
    "region": "BBQ",
    "station": "main",
    "prepTimeMin": 22,
    "imageUri": "https://images.unsplash.com/photo-1527477378378-0c6f50529d33?w=800&q=80",
    "description": "Traditional bone-in chicken cuts marinated in vibrant red tandoori spices and charred on coals",
    "variants": [
      {
        "name": "10 PCS",
        "price": 1499
      }
    ]
  },
  {
    "id": "slt-bir-mutton-biryani",
    "name": "Sultan Special Mutton Biryani",
    "price": 1499,
    "category": "Biryani",
    "region": "Pakistani",
    "station": "main",
    "prepTimeMin": 15,
    "badge": "Chef Special",
    "imageUri": "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=800&q=80",
    "description": "Topped with Cashew Nuts & Brown Onion"
  },
  {
    "id": "slt-bir-chicken-biryani",
    "name": "Sultan Special Chicken Biryani",
    "price": 1199,
    "category": "Biryani",
    "region": "Pakistani",
    "station": "main",
    "prepTimeMin": 15,
    "badge": "Chef Special",
    "imageUri": "https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=800&q=80",
    "description": "Topped with Cashew Nuts & Brown Onion"
  },
  {
    "id": "slt-dal-makhni",
    "name": "Shahi Daal Makhni",
    "price": 1499,
    "category": "Daal",
    "region": "Pakistani",
    "station": "main",
    "prepTimeMin": 15,
    "badge": "Royal Daal",
    "imageUri": "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800&q=80",
    "description": "Rich and creamy blend of lentils, slow-cooked with aromatic spices, butter, and fresh cream"
  },
  {
    "id": "slt-hnd-white-handi",
    "name": "Chicken Makhni Special White Handi",
    "price": 1399,
    "category": "Pakistani - Handi",
    "region": "Pakistani",
    "station": "main",
    "prepTimeMin": 22,
    "badge": "Chef Special",
    "imageUri": "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800&q=80",
    "description": "Velvety smooth boneless chicken cooked in pure dairy butter, cream, almonds and white pepper",
    "variants": [
      {
        "name": "Half",
        "price": 1399
      },
      {
        "name": "Full",
        "price": 2199
      }
    ]
  },
  {
    "id": "slt-hnd-shahjahani",
    "name": "Shahjahani Handi",
    "price": 1299,
    "category": "Pakistani - Handi",
    "region": "Pakistani",
    "station": "main",
    "prepTimeMin": 22,
    "imageUri": "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=800&q=80",
    "description": "Royal Mughal feast handi simmered with saffron, roasted nuts, yogurt and golden spices",
    "variants": [
      {
        "name": "Half",
        "price": 1299
      },
      {
        "name": "Full",
        "price": 2199
      }
    ]
  },
  {
    "id": "slt-hnd-patiala",
    "name": "Patiala Handi",
    "price": 1299,
    "category": "Pakistani - Handi",
    "region": "Pakistani",
    "station": "main",
    "prepTimeMin": 22,
    "imageUri": "https://images.unsplash.com/photo-1545247181-516773cae754?w=800&q=80",
    "description": "Punjabi Patiala style spiced chicken handi with rich onion-tomato masala and butter",
    "variants": [
      {
        "name": "Half",
        "price": 1299
      },
      {
        "name": "Full",
        "price": 2199
      }
    ]
  },
  {
    "id": "slt-hnd-ginger",
    "name": "Chicken Ginger Handi",
    "price": 1199,
    "category": "Pakistani - Handi",
    "region": "Pakistani",
    "station": "main",
    "prepTimeMin": 20,
    "imageUri": "https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=800&q=80",
    "description": "Boneless chicken prepared with generous fresh ginger juliennes and aromatic crushed spices",
    "variants": [
      {
        "name": "Half",
        "price": 1199
      },
      {
        "name": "Full",
        "price": 2099
      }
    ]
  },
  {
    "id": "slt-hnd-jalfrezi",
    "name": "Jalfrezi Handi",
    "price": 1199,
    "category": "Pakistani - Handi",
    "region": "Pakistani",
    "station": "main",
    "prepTimeMin": 20,
    "imageUri": "https://images.unsplash.com/photo-1563245372-f21724e3856d?w=800&q=80",
    "description": "Stir-cooked chicken handi tossed with crunchy bell peppers, fresh tomatoes and sweet onions",
    "variants": [
      {
        "name": "Half",
        "price": 1199
      },
      {
        "name": "Full",
        "price": 2099
      }
    ]
  },
  {
    "id": "slt-hnd-lahori",
    "name": "Lahori Chicken Handi",
    "price": 1199,
    "category": "Pakistani - Handi",
    "region": "Pakistani",
    "station": "main",
    "prepTimeMin": 20,
    "imageUri": "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800&q=80",
    "description": "Classic Lahori food street recipe cooked with freshly ground garam masala in clay pot",
    "variants": [
      {
        "name": "Half",
        "price": 1199
      },
      {
        "name": "Full",
        "price": 2099
      }
    ]
  },
  {
    "id": "slt-krh-sultan-mutton-white",
    "name": "Sultan Special Mutton Makhni White Karahi",
    "price": 2399,
    "category": "Pakistani - Karahi",
    "region": "Pakistani",
    "station": "main",
    "prepTimeMin": 35,
    "badge": "Chef Special",
    "imageUri": "https://images.unsplash.com/photo-1545247181-516773cae754?w=800&q=80",
    "description": "Tender mountain mutton cooked in cast iron wok with fresh cream, butter, green chilies and white pepper",
    "variants": [
      {
        "name": "Half",
        "price": 2399
      },
      {
        "name": "Full",
        "price": 4499
      }
    ]
  },
  {
    "id": "slt-krh-mutton",
    "name": "Mutton Karahi",
    "price": 2299,
    "category": "Pakistani - Karahi",
    "region": "Pakistani",
    "station": "main",
    "prepTimeMin": 35,
    "imageUri": "https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=800&q=80",
    "description": "Fresh tender mutton cuts braised in ripe red tomatoes, ginger slivers and desi ghee",
    "variants": [
      {
        "name": "Half",
        "price": 2299
      },
      {
        "name": "Full",
        "price": 4299
      }
    ]
  },
  {
    "id": "slt-krh-mutton-shanwari",
    "name": "Mutton Shanwari",
    "price": 2299,
    "category": "Pakistani - Karahi",
    "region": "Pakistani",
    "station": "main",
    "prepTimeMin": 35,
    "badge": "Shinwari Authentic",
    "imageUri": "https://images.unsplash.com/photo-1545247181-516773cae754?w=800&q=80",
    "description": "Traditional Khyber tribal recipe prepared only with fresh tomatoes, salt and animal fat",
    "variants": [
      {
        "name": "Half",
        "price": 2299
      },
      {
        "name": "Full",
        "price": 4299
      }
    ]
  },
  {
    "id": "slt-krh-dumba",
    "name": "Dumba Karahi",
    "price": 2399,
    "category": "Pakistani - Karahi",
    "region": "Pakistani",
    "station": "main",
    "prepTimeMin": 35,
    "imageUri": "https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80",
    "description": "Succulent sheep tail fat lamb prepared in classic wok with pure salt and ripe tomatoes",
    "variants": [
      {
        "name": "Half",
        "price": 2399
      },
      {
        "name": "Full",
        "price": 4499
      }
    ]
  },
  {
    "id": "slt-krh-dumba-shanwari",
    "name": "Dumba Shanwari",
    "price": 2399,
    "category": "Pakistani - Karahi",
    "region": "Pakistani",
    "station": "main",
    "prepTimeMin": 35,
    "badge": "Tribal Classic",
    "imageUri": "https://images.unsplash.com/photo-1545247181-516773cae754?w=800&q=80",
    "description": "Authentic Shinwari style dumba lamb, slow seared with tomatoes and mild green peppers",
    "variants": [
      {
        "name": "Half",
        "price": 2399
      },
      {
        "name": "Full",
        "price": 4499
      }
    ]
  },
  {
    "id": "slt-krh-desi-murgh",
    "name": "Desi Murgh Karahi",
    "price": 1599,
    "category": "Pakistani - Karahi",
    "region": "Pakistani",
    "station": "main",
    "prepTimeMin": 30,
    "badge": "Organic Desi",
    "imageUri": "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=800&q=80",
    "description": "Country chicken slow-cooked in pure desi ghee with crushed coriander and farm tomatoes",
    "variants": [
      {
        "name": "Half",
        "price": 1599
      },
      {
        "name": "Full",
        "price": 2999
      }
    ]
  },
  {
    "id": "slt-krh-white-chicken",
    "name": "Special White Chicken Karahi",
    "price": 1399,
    "category": "Pakistani - Karahi",
    "region": "Pakistani",
    "station": "main",
    "prepTimeMin": 25,
    "imageUri": "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800&q=80",
    "description": "Chicken pieces cooked without red spices, bathed in cream, butter and cracked black pepper",
    "variants": [
      {
        "name": "Half",
        "price": 1399
      },
      {
        "name": "Full",
        "price": 2299
      }
    ]
  },
  {
    "id": "slt-krh-lahori-chicken",
    "name": "Lahori Chicken Karahi",
    "price": 1299,
    "category": "Pakistani - Karahi",
    "region": "Pakistani",
    "station": "main",
    "prepTimeMin": 25,
    "imageUri": "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=800&q=80",
    "description": "Food street favorite with punchy tomatoes, fresh garlic and aromatic ground spices",
    "variants": [
      {
        "name": "Half",
        "price": 1299
      },
      {
        "name": "Full",
        "price": 2099
      }
    ]
  },
  {
    "id": "slt-krh-special-chicken",
    "name": "Special Chicken Karahi",
    "price": 1199,
    "category": "Pakistani - Karahi",
    "region": "Pakistani",
    "station": "main",
    "prepTimeMin": 22,
    "imageUri": "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800&q=80",
    "description": "Chef's signature chicken karahi bursting with robust ginger and roasted cumin aroma",
    "variants": [
      {
        "name": "Half",
        "price": 1199
      },
      {
        "name": "Full",
        "price": 2099
      }
    ]
  },
  {
    "id": "slt-krh-addon-makhan",
    "name": "Extra Add-on: 200g Makhan",
    "price": 700,
    "category": "Pakistani - Karahi",
    "region": "Pakistani",
    "station": "main",
    "prepTimeMin": 2,
    "imageUri": "https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=800&q=80",
    "description": "200g pure desi makhan dollop for extra richness in your Karahi or Handi"
  },
  {
    "id": "slt-mnd-lahm",
    "name": "Lahm Mandi",
    "price": 5499,
    "category": "Mandi Platter",
    "region": "Arabic",
    "station": "main",
    "prepTimeMin": 25,
    "badge": "Royal Arabic",
    "imageUri": "https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80",
    "description": "Juicy grilled mutton Turkish kabab, special Mandi rice, grilled vegetables, boiled eggs, Mandi & garlic sauces, dry nuts"
  },
  {
    "id": "slt-mnd-fish",
    "name": "Fish Mandi",
    "price": 3399,
    "category": "Mandi Platter",
    "region": "Arabic",
    "station": "main",
    "prepTimeMin": 22,
    "imageUri": "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=800&q=80",
    "description": "Juicy grilled Fish Turkish kabab, special Mandi rice, grilled vegetables, boiled eggs, Mandi & garlic sauces, dry nuts"
  },
  {
    "id": "slt-mnd-dajaj",
    "name": "Dajaj Mandi",
    "price": 3199,
    "category": "Mandi Platter",
    "region": "Arabic",
    "station": "main",
    "prepTimeMin": 22,
    "imageUri": "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=800&q=80",
    "description": "Juicy grilled Chicken Turkish kabab, special Mandi rice, grilled vegetables, boiled eggs, Mandi & garlic sauces, dry nuts"
  },
  {
    "id": "slt-mnd-lahm-kuzzu",
    "name": "Lahm Kuzzu",
    "price": 2399,
    "category": "Mandi Platter",
    "region": "Arabic",
    "station": "main",
    "prepTimeMin": 20,
    "imageUri": "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=800&q=80",
    "description": "Signature Mandi Rice, Topped on Mutton, Brown Onion, Cashew Nuts, Served with Kuzzu Yakhni"
  },
  {
    "id": "slt-plt-chicken-bbq-mix",
    "name": "Chicken BBQ Mix Platter",
    "price": 2999,
    "category": "Special Platters",
    "region": "BBQ",
    "station": "main",
    "prepTimeMin": 25,
    "badge": "Serving 2-3",
    "isDeal": true,
    "imageUri": "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80",
    "description": "Serving: 02-03 Persons | Includes: Chicken Tandoori Boti 3 pcs, Fish Tikka 3 pcs, Chicken Malai Boti 3 pcs, Chicken Haryali Boti 3 pcs, Chicken Turkish Kabab 2 pcs, Sheeshtok 3 pcs, Grilled Vegetables, Special BBQ Sauce, Green Mint Sauce"
  },
  {
    "id": "slt-plt-king-sultan",
    "name": "King Sultan Platter",
    "price": 12999,
    "category": "Special Platters",
    "region": "Pakistani",
    "station": "main",
    "prepTimeMin": 35,
    "badge": "Serving 10-12",
    "isDeal": true,
    "imageUri": "https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80",
    "description": "Serving: 10-12 Persons | Includes: Mix Mutton Turkish 750g, Chicken Turkish Kabab 2 pcs, Fish Tikka 10 pcs, Mutton Kabab 4 pcs, Kastoori Boti 10 pcs, Special Malai Boti 10 pcs, Tandoori Boti 10 pcs, Haryali Boti 10 pcs, Chicken Kabab 4 pcs, Mandi Rice, Boiled Eggs, Vegetables with Sweet Garnish, Zeera Raita, BBQ Sauce, Mint Sauce"
  },
  {
    "id": "slt-plt-grand-sultan",
    "name": "Grand Sultan Platter",
    "price": 59999,
    "category": "Special Platters",
    "region": "Pakistani",
    "station": "main",
    "prepTimeMin": 60,
    "badge": "Emperor Feast (22-25)",
    "isDeal": true,
    "imageUri": "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&q=80",
    "description": "Serving: 22-25 Persons | Includes: Grilled Tender Juicy Full Goat, Mutton Kabab, Chicken Turkish Kabab, Dajaj Mandi, Pome Boti, Malai Boti, Haryali Boti, Cashew Nut, Almond, Black Raisins, Bread Crouton, Turkish Bread, Grilled Vegetables, Roasted Potatoes, Sweet Garnish, Fries, Mandi Rice, Hummus, Kachumbar Salad, Thoam Sauce, Mandi Sauce, Mint Sauce, BBQ Sauce, Boiled Eggs"
  },
  {
    "id": "slt-tan-mix-basket",
    "name": "Mix Basket",
    "price": 550,
    "category": "Tandoor",
    "region": "Pakistani",
    "station": "main",
    "prepTimeMin": 8,
    "imageUri": "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=800&q=80",
    "description": "Assorted tandoor basket featuring Roghni, Garlic, Kalonji and Cheese naan"
  },
  {
    "id": "slt-tan-cheese-naan",
    "name": "Cheese Naan",
    "price": 490,
    "category": "Tandoor",
    "region": "Pakistani",
    "station": "main",
    "prepTimeMin": 8,
    "imageUri": "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=800&q=80",
    "description": "Fresh clay oven baked naan oozing with melted mozzarella cheese"
  },
  {
    "id": "slt-tan-kalonji-naan",
    "name": "Kalonji Naan",
    "price": 170,
    "category": "Tandoor",
    "region": "Pakistani",
    "station": "main",
    "prepTimeMin": 6,
    "imageUri": "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=800&q=80",
    "description": "Fluffy leavened flatbread sprinkled with nigella seeds (kalonji)"
  },
  {
    "id": "slt-tan-desi-ghee-paratha",
    "name": "Desi Ghee Paratha",
    "price": 160,
    "category": "Tandoor",
    "region": "Pakistani",
    "station": "main",
    "prepTimeMin": 8,
    "imageUri": "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=800&q=80",
    "description": "Flaky layered golden paratha griddled with pure fragrant desi ghee"
  },
  {
    "id": "slt-tan-garlic-naan",
    "name": "Garlic Naan",
    "price": 110,
    "category": "Tandoor",
    "region": "Pakistani",
    "station": "main",
    "prepTimeMin": 6,
    "imageUri": "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=800&q=80",
    "description": "Tandoori naan topped with roasted garlic bits and fresh butter"
  },
  {
    "id": "slt-tan-roghni-naan",
    "name": "Roghni Naan",
    "price": 90,
    "category": "Tandoor",
    "region": "Pakistani",
    "station": "main",
    "prepTimeMin": 6,
    "imageUri": "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=800&q=80",
    "description": "Traditional soft royal naan glazed with sesame seeds and milk wash"
  },
  {
    "id": "slt-tan-plain-roti",
    "name": "Plain Roti",
    "price": 60,
    "category": "Tandoor",
    "region": "Pakistani",
    "station": "main",
    "prepTimeMin": 5,
    "imageUri": "https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=800&q=80",
    "description": "Whole wheat freshly slapped tandoor roti (Per Head)"
  },
  {
    "id": "slt-sau-mint",
    "name": "Mint Sauce",
    "price": 150,
    "category": "Sauces",
    "region": "Pakistani",
    "station": "main",
    "prepTimeMin": 3,
    "imageUri": "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=800&q=80",
    "description": "Fresh crushed garden mint and green chili yogurt sauce"
  },
  {
    "id": "slt-sau-zeera-raita",
    "name": "Zeera Raita",
    "price": 150,
    "category": "Sauces",
    "region": "Pakistani",
    "station": "main",
    "prepTimeMin": 3,
    "imageUri": "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=800&q=80",
    "description": "Creamy whipped yogurt seasoned with roasted cumin and rock salt"
  },
  {
    "id": "slt-sau-imli",
    "name": "Imli Sauce",
    "price": 150,
    "category": "Sauces",
    "region": "Pakistani",
    "station": "main",
    "prepTimeMin": 3,
    "imageUri": "https://images.unsplash.com/photo-1541518763669-27fef04b14ea?w=800&q=80",
    "description": "Sweet and tangy slow-simmered tamarind dip infused with spices"
  },
  {
    "id": "slt-des-choc-brownie",
    "name": "Chocolate Hot Brownie",
    "price": 899,
    "category": "Bakery & Desserts",
    "region": "Bakery & Desserts",
    "station": "main",
    "prepTimeMin": 8,
    "imageUri": "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=800&q=80",
    "description": "Served with ice cream"
  },
  {
    "id": "slt-des-lotus-cheesecake",
    "name": "Lotus Cheesecake",
    "price": 899,
    "category": "Bakery & Desserts",
    "region": "Bakery & Desserts",
    "station": "main",
    "prepTimeMin": 6,
    "badge": "Popular",
    "imageUri": "https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=800&q=80",
    "description": "New York baked cheesecake topped with Lotus spread & Lotus biscuit"
  },
  {
    "id": "slt-des-hot-skillet-brownie",
    "name": "Hot Skillet Brownie",
    "price": 899,
    "category": "Bakery & Desserts",
    "region": "Bakery & Desserts",
    "station": "main",
    "prepTimeMin": 10,
    "imageUri": "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=800&q=80",
    "description": "Hot skillet brownie with ice cream on top, served on hot chocolate sizzling"
  },
  {
    "id": "slt-des-melting-moment",
    "name": "Melting Moment",
    "price": 899,
    "category": "Bakery & Desserts",
    "region": "Bakery & Desserts",
    "station": "main",
    "prepTimeMin": 8,
    "imageUri": "https://images.unsplash.com/photo-1587314168485-3236d6710814?w=800&q=80",
    "description": "Rich melt-in-the-mouth buttery pastry layered with creamy goodness"
  },
  {
    "id": "slt-des-kunafa",
    "name": "Kunafa",
    "price": 899,
    "category": "Bakery & Desserts",
    "region": "Turkish",
    "station": "main",
    "prepTimeMin": 14,
    "badge": "Royal Dessert",
    "imageUri": "https://images.unsplash.com/photo-1579954115545-a95591f28bfc?w=800&q=80",
    "description": "Crunchy golden spun kataifi pastry filled with sweet cheese, orange blossom syrup & pistachios"
  },
  {
    "id": "slt-des-molten-lava",
    "name": "Molten Lava",
    "price": 799,
    "category": "Bakery & Desserts",
    "region": "Bakery & Desserts",
    "station": "main",
    "prepTimeMin": 10,
    "imageUri": "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=800&q=80",
    "description": "Moist chocolate hot sauce with vanilla ice cream"
  },
  {
    "id": "slt-des-three-milk-cake",
    "name": "Three Milk Cake",
    "price": 799,
    "category": "Bakery & Desserts",
    "region": "Bakery & Desserts",
    "station": "main",
    "prepTimeMin": 6,
    "imageUri": "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=800&q=80",
    "description": "Vanilla sponge dipped in special milky sauce sprinkled with Lotus biscuit"
  },
  {
    "id": "slt-des-bread-pudding",
    "name": "Bread Pudding",
    "price": 699,
    "category": "Bakery & Desserts",
    "region": "Bakery & Desserts",
    "station": "main",
    "prepTimeMin": 8,
    "imageUri": "https://images.unsplash.com/photo-1587314168485-3236d6710814?w=800&q=80",
    "description": "Pleasantly milky baked bread with caramel sauce, served with ice cream topped on sugar crumb"
  },
  {
    "id": "slt-des-red-velvet",
    "name": "Red Velvet Cake/Slice",
    "price": 699,
    "category": "Bakery & Desserts",
    "region": "Bakery & Desserts",
    "station": "main",
    "prepTimeMin": 6,
    "imageUri": "https://images.unsplash.com/photo-1586985289688-ca3cf47d3e6e?w=800&q=80",
    "description": "Moist red cocoa sponge layered with smooth, tangy cream cheese frosting"
  },
  {
    "id": "slt-des-nutella-brownie",
    "name": "Nutella Brownie",
    "price": 699,
    "category": "Bakery & Desserts",
    "region": "Bakery & Desserts",
    "station": "main",
    "prepTimeMin": 6,
    "imageUri": "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=800&q=80",
    "description": "Rich, fudgy chocolate brownie swirled with creamy Nutella"
  },
  {
    "id": "slt-des-shahi-kheer",
    "name": "Shahi Kheer",
    "price": 499,
    "category": "Bakery & Desserts",
    "region": "Pakistani",
    "station": "main",
    "prepTimeMin": 5,
    "imageUri": "https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?w=800&q=80",
    "description": "Slow-reduced aromatic basmati rice pudding topped with cardamom, kewra and slivered nuts"
  },
  {
    "id": "slt-des-gulab-jamun",
    "name": "Hot Gulab Jamun",
    "price": 299,
    "category": "Bakery & Desserts",
    "region": "Pakistani",
    "station": "main",
    "prepTimeMin": 5,
    "imageUri": "https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?w=800&q=80",
    "description": "Soft khoya dumplings dipped in hot green cardamom and saffron rose syrup"
  },
  {
    "id": "slt-bev-cappuccino",
    "name": "Cappuccino",
    "price": 599,
    "category": "Hot Coffee & Tea",
    "region": "Beverages",
    "station": "juice",
    "prepTimeMin": 6,
    "imageUri": "https://images.unsplash.com/photo-1534778101976-62847782c213?w=800&q=80",
    "description": "Espresso shot topped with steamed milk and thick micro-foam dusted with cocoa"
  },
  {
    "id": "slt-bev-latte",
    "name": "Latte",
    "price": 599,
    "category": "Hot Coffee & Tea",
    "region": "Beverages",
    "station": "juice",
    "prepTimeMin": 6,
    "imageUri": "https://images.unsplash.com/photo-1570968915860-54d5c301fa9f?w=800&q=80",
    "description": "Smooth double shot of espresso balanced with silky steamed dairy milk"
  },
  {
    "id": "slt-bev-cafe-mocha",
    "name": "Cafe Mocha",
    "price": 599,
    "category": "Hot Coffee & Tea",
    "region": "Beverages",
    "station": "juice",
    "prepTimeMin": 6,
    "imageUri": "https://images.unsplash.com/photo-1578314675249-a6910f80cc4e?w=800&q=80",
    "description": "Rich espresso combined with Belgian dark chocolate and velvety steamed milk"
  },
  {
    "id": "slt-bev-caramel-latte",
    "name": "Caramel Latte",
    "price": 599,
    "category": "Hot Coffee & Tea",
    "region": "Beverages",
    "station": "juice",
    "prepTimeMin": 6,
    "imageUri": "https://images.unsplash.com/photo-1570968915860-54d5c301fa9f?w=800&q=80",
    "description": "Steamed latte infused with buttery sweet caramel syrup and drizzle"
  },
  {
    "id": "slt-bev-irish-latte",
    "name": "Irish Latte",
    "price": 599,
    "category": "Hot Coffee & Tea",
    "region": "Beverages",
    "station": "juice",
    "prepTimeMin": 6,
    "imageUri": "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=800&q=80",
    "description": "Warm espresso latte flavored with non-alcoholic aromatic Irish cream essence"
  },
  {
    "id": "slt-bev-french-vanilla-latte",
    "name": "French Vanilla Latte",
    "price": 599,
    "category": "Hot Coffee & Tea",
    "region": "Beverages",
    "station": "juice",
    "prepTimeMin": 6,
    "imageUri": "https://images.unsplash.com/photo-1570968915860-54d5c301fa9f?w=800&q=80",
    "description": "Classic latte infused with rich French vanilla bean syrup"
  },
  {
    "id": "slt-bev-hazelnut-latte",
    "name": "Hazelnut Latte",
    "price": 599,
    "category": "Hot Coffee & Tea",
    "region": "Beverages",
    "station": "juice",
    "prepTimeMin": 6,
    "imageUri": "https://images.unsplash.com/photo-1570968915860-54d5c301fa9f?w=800&q=80",
    "description": "Fragrant espresso latte blended with roasted nutty hazelnut syrup"
  },
  {
    "id": "slt-bev-hot-chocolate",
    "name": "Hot Chocolate",
    "price": 599,
    "category": "Hot Coffee & Tea",
    "region": "Beverages",
    "station": "juice",
    "prepTimeMin": 6,
    "imageUri": "https://images.unsplash.com/photo-1542990253-0d0f5be5f0ed?w=800&q=80",
    "description": "Indulgent melted cocoa and milk topped with whipped froth"
  },
  {
    "id": "slt-bev-americano",
    "name": "Americano",
    "price": 499,
    "category": "Hot Coffee & Tea",
    "region": "Beverages",
    "station": "juice",
    "prepTimeMin": 5,
    "imageUri": "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=800&q=80",
    "description": "Double espresso shots lengthened with pure piping hot water for a crisp finish"
  },
  {
    "id": "slt-bev-espresso",
    "name": "Espresso",
    "price": 350,
    "category": "Hot Coffee & Tea",
    "region": "Beverages",
    "station": "juice",
    "prepTimeMin": 4,
    "imageUri": "https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=800&q=80",
    "description": "Intense, concentrated shot of pure dark roast coffee with golden crema"
  },
  {
    "id": "slt-bev-karak-tea",
    "name": "Karak Tea",
    "price": 199,
    "category": "Hot Coffee & Tea",
    "region": "Pakistani",
    "station": "juice",
    "prepTimeMin": 6,
    "badge": "Desi Favorite",
    "imageUri": "https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=800&q=80",
    "description": "Strong, slow-brewed tea simmered with milk, cardamom and caramelized sugar"
  },
  {
    "id": "slt-bev-green-tea",
    "name": "Green Tea",
    "price": 149,
    "category": "Hot Coffee & Tea",
    "region": "Beverages",
    "station": "juice",
    "prepTimeMin": 5,
    "imageUri": "https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=800&q=80",
    "description": "Soothing brewed green tea infused with whole cardamom and mint"
  },
  {
    "id": "slt-ice-caramel-frappe",
    "name": "Caramel Frappe",
    "price": 599,
    "category": "Ice Coffee",
    "region": "Beverages",
    "station": "juice",
    "prepTimeMin": 6,
    "imageUri": "https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=800&q=80",
    "description": "Chilled blended coffee frappe swirled with caramel and topped with whipped cream"
  },
  {
    "id": "slt-ice-mocha-frappe",
    "name": "Mocha Frappe",
    "price": 599,
    "category": "Ice Coffee",
    "region": "Beverages",
    "station": "juice",
    "prepTimeMin": 6,
    "imageUri": "https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=800&q=80",
    "description": "Blended iced espresso and chocolate topped with chocolate drizzle"
  },
  {
    "id": "slt-ice-spanish-latte",
    "name": "Spanish Latte",
    "price": 499,
    "category": "Ice Coffee",
    "region": "Beverages",
    "station": "juice",
    "prepTimeMin": 6,
    "badge": "Trending",
    "imageUri": "https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=800&q=80",
    "description": "Iced espresso poured over sweetened condensed milk and cold fresh milk"
  },
  {
    "id": "slt-ice-caramel-coffee",
    "name": "Caramel Ice Coffee",
    "price": 499,
    "category": "Ice Coffee",
    "region": "Beverages",
    "station": "juice",
    "prepTimeMin": 6,
    "imageUri": "https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=800&q=80",
    "description": "Cold brewed espresso served over crystal ice cubes with caramel syrup"
  },
  {
    "id": "slt-ice-irish-coffee",
    "name": "Irish Ice Coffee",
    "price": 499,
    "category": "Ice Coffee",
    "region": "Beverages",
    "station": "juice",
    "prepTimeMin": 6,
    "imageUri": "https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=800&q=80",
    "description": "Refreshing cold coffee with rich non-alcoholic Irish cream infusion"
  },
  {
    "id": "slt-ice-vanilla-coffee",
    "name": "French Vanilla Ice Coffee",
    "price": 499,
    "category": "Ice Coffee",
    "region": "Beverages",
    "station": "juice",
    "prepTimeMin": 6,
    "imageUri": "https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=800&q=80",
    "description": "Crisp iced coffee sweetened with fragrant French vanilla bean"
  },
  {
    "id": "slt-ice-hazelnut-coffee",
    "name": "Hazelnut Ice Coffee",
    "price": 499,
    "category": "Ice Coffee",
    "region": "Beverages",
    "station": "juice",
    "prepTimeMin": 6,
    "imageUri": "https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=800&q=80",
    "description": "Nutty roasted hazelnut cold coffee served chilled over ice"
  },
  {
    "id": "slt-mck-pina-colada",
    "name": "Pina Colada",
    "price": 599,
    "category": "Mocktail",
    "region": "Beverages",
    "station": "juice",
    "prepTimeMin": 6,
    "badge": "Popular",
    "imageUri": "https://images.unsplash.com/photo-1544145945-f90425340c7e?w=800&q=80",
    "description": "Tropical blend of fresh pineapple juice and rich coconut cream served over ice"
  },
  {
    "id": "slt-mck-strawberry-colada",
    "name": "Strawberry Colada",
    "price": 599,
    "category": "Mocktail",
    "region": "Beverages",
    "station": "juice",
    "prepTimeMin": 6,
    "imageUri": "https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=800&q=80",
    "description": "Sweet wild strawberries blended with coconut cream and pineapple juice"
  },
  {
    "id": "slt-mck-guava-mint",
    "name": "Guava Mint Chiller",
    "price": 499,
    "category": "Mocktail",
    "region": "Beverages",
    "station": "juice",
    "prepTimeMin": 6,
    "imageUri": "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=800&q=80",
    "description": "Pink guava juice paired with freshly crushed garden mint and lemon"
  },
  {
    "id": "slt-mck-mint-margarita",
    "name": "Mint Margarita",
    "price": 399,
    "category": "Mocktail",
    "region": "Beverages",
    "station": "juice",
    "prepTimeMin": 5,
    "badge": "Signature Cooler",
    "imageUri": "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=800&q=80",
    "description": "Ice-cold crushed mint leaves, fresh lime juice and sparkling soda"
  },
  {
    "id": "slt-mck-strawberry-margarita",
    "name": "Strawberry Margarita",
    "price": 399,
    "category": "Mocktail",
    "region": "Beverages",
    "station": "juice",
    "prepTimeMin": 5,
    "imageUri": "https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=800&q=80",
    "description": "Zesty crushed strawberries with Persian lime and sparkling soda"
  },
  {
    "id": "slt-mck-blueberry-lagoon",
    "name": "Blueberry Lagoon",
    "price": 399,
    "category": "Mocktail",
    "region": "Beverages",
    "station": "juice",
    "prepTimeMin": 5,
    "imageUri": "https://images.unsplash.com/photo-1544145945-f90425340c7e?w=800&q=80",
    "description": "Electric blue curacao flavor with wild blueberries, lime and soda"
  },
  {
    "id": "slt-mck-mint-mojito",
    "name": "Mint Mojito",
    "price": 399,
    "category": "Mocktail",
    "region": "Beverages",
    "station": "juice",
    "prepTimeMin": 5,
    "imageUri": "https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=800&q=80",
    "description": "Cuban style muddled fresh mint leaves, brown cane sugar, lime and club soda"
  },
  {
    "id": "slt-mck-strawberry-mojito",
    "name": "Strawberry Mojito",
    "price": 399,
    "category": "Mocktail",
    "region": "Beverages",
    "station": "juice",
    "prepTimeMin": 5,
    "imageUri": "https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=800&q=80",
    "description": "Muddled fresh strawberries with wild mint, lime wheels and sparkling fizz"
  },
  {
    "id": "slt-mck-fresh-lime",
    "name": "Fresh Lime",
    "price": 299,
    "category": "Mocktail",
    "region": "Beverages",
    "station": "juice",
    "prepTimeMin": 4,
    "imageUri": "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=800&q=80",
    "description": "Freshly squeezed Persian lime with salt or sweet syrup topped with sparkling soda"
  },
  {
    "id": "slt-crm-shake",
    "name": "Ice Cream Shake",
    "price": 499,
    "category": "Ice Cream",
    "region": "Beverages",
    "station": "juice",
    "prepTimeMin": 8,
    "imageUri": "https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=800&q=80",
    "description": "Thick creamy dairy milkshake prepared with your choice of premium ice cream flavor",
    "variants": [
      {
        "name": "Chocolate",
        "price": 499
      },
      {
        "name": "Mango",
        "price": 499
      },
      {
        "name": "Caramel",
        "price": 499
      },
      {
        "name": "Vanilla",
        "price": 499
      },
      {
        "name": "Strawberry",
        "price": 499
      },
      {
        "name": "Pistachio",
        "price": 499
      }
    ]
  },
  {
    "id": "slt-crm-scoop",
    "name": "Ice Cream Scoop",
    "price": 250,
    "category": "Ice Cream",
    "region": "Bakery & Desserts",
    "station": "juice",
    "prepTimeMin": 3,
    "imageUri": "https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=800&q=80",
    "description": "Single scoop of artisan ice cream served in cup or cone",
    "variants": [
      {
        "name": "Chocolate",
        "price": 250
      },
      {
        "name": "Mango",
        "price": 250
      },
      {
        "name": "Caramel",
        "price": 250
      },
      {
        "name": "Vanilla",
        "price": 250
      },
      {
        "name": "Strawberry",
        "price": 250
      },
      {
        "name": "Pistachio",
        "price": 250
      }
    ]
  },
  {
    "id": "slt-drk-soft-drink",
    "name": "Soft Drink",
    "price": 150,
    "category": "Cold Drinks & Water",
    "region": "Beverages",
    "station": "juice",
    "prepTimeMin": 2,
    "imageUri": "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=800&q=80",
    "description": "Chilled soft drink selection (Coke, Sprite, Fanta, Dew)",
    "variants": [
      {
        "name": "Tin",
        "price": 150
      },
      {
        "name": "1.5 Ltr",
        "price": 250
      }
    ]
  },
  {
    "id": "slt-drk-water",
    "name": "Water",
    "price": 70,
    "category": "Cold Drinks & Water",
    "region": "Beverages",
    "station": "juice",
    "prepTimeMin": 2,
    "imageUri": "https://images.unsplash.com/photo-1548839140-29a749e1bc4e?w=800&q=80",
    "description": "Pure mineral spring water bottle",
    "variants": [
      {
        "name": "Small",
        "price": 70
      },
      {
        "name": "Large",
        "price": 120
      }
    ]
  }
],
  categories: [
  "All",
  "Salad",
  "Appetizers",
  "Soup",
  "Continental",
  "Chinese",
  "Pizza",
  "Fast Food",
  "Broast",
  "Turkish Cuisine",
  "BBQ",
  "Biryani",
  "Daal",
  "Pakistani - Handi",
  "Pakistani - Karahi",
  "Mandi Platter",
  "Special Platters",
  "Tandoor",
  "Sauces",
  "Bakery & Desserts",
  "Hot Coffee & Tea",
  "Ice Coffee",
  "Mocktail",
  "Ice Cream",
  "Cold Drinks & Water"
],
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
  activeStaffSessions: [],
  revokedDeviceIds: {}
};

const LEGACY_DUMMY_IDS = new Set([
  'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10',
  'm11', 'm12', 'm13', 'm14', 'm15', 'm16', 'm17', 'm18', 'm19',
  'deal1', 'deal2', 'm-zain', 'm-shahi-handi', 'm-beef-karahi', 'm-chicken-cheese'
]);
const LEGACY_DUMMY_NAMES = new Set([
  'sultan seekh kebab', 'desi murgh karahi', 'hummus with warm pita', 'royal turkish kunafa',
  'fresh mint margarita', 'fajita supreme pizza', 'smoked mutton ribs', 'sultan dum biryani',
  'grand sultan angus burger', 'cheesy truffle fries', 'choco molten lava cake', 'mango kulfa shake',
  'sultan special roghni naan', 'mutton shinwari karahi', 'chicken manchurian & egg fried rice',
  'chicken chowmein classic', 'hot & sour chicken soup', 'grilled chicken alfredo pasta',
  'crispy fish & chips', 'sultan family feast (4-5 persons)', 'royal couple platter (2 persons)',
  'zain dish', 'sultan shahi handi', 'beef karahii', 'chicken cheese'
]);
function isLegacyDummyDish(m) {
  if (!m) return true;
  if (m.id && LEGACY_DUMMY_IDS.has(m.id)) return true;
  return false;
}

// Load or create state
let serverState = { ...INITIAL_STATE };
try {
  if (fs.existsSync(DATA_FILE)) {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    serverState = { ...INITIAL_STATE, ...JSON.parse(raw) };
    if (!Array.isArray(serverState.menuItems) || serverState.menuItems.length === 0) {
      serverState.menuItems = INITIAL_STATE.menuItems;
    } else if (Array.isArray(serverState.menuItems)) {
      serverState.menuItems = serverState.menuItems.filter(m => !isLegacyDummyDish(m));
      if (serverState.menuItems.length === 0) {
        serverState.menuItems = INITIAL_STATE.menuItems;
      }
    }
    // Clean empty categories on startup
    const usedCatsOnBoot = new Set((serverState.menuItems || []).map(m => m.category).filter(Boolean));
    serverState.categories = ['All', ...Array.from(usedCatsOnBoot)];

    if (Array.isArray(serverState.recipes)) {
      serverState.recipes = serverState.recipes.filter(r => r && !LEGACY_DUMMY_IDS.has(r.menuItemId));
    }
    if (!serverState.onlineOrders) serverState.onlineOrders = [];
    if (!serverState.appUsers) serverState.appUsers = INITIAL_STATE.appUsers;
    if (!serverState.appUserLogs) serverState.appUserLogs = INITIAL_STATE.appUserLogs;
    if (!Array.isArray(serverState.serviceRequests)) serverState.serviceRequests = [];
    if (!Array.isArray(serverState.reservations)) serverState.reservations = INITIAL_STATE.reservations || [];
    if (!Array.isArray(serverState.playlandTickets)) serverState.playlandTickets = [];
    if (!Array.isArray(serverState.activeStaffSessions)) serverState.activeStaffSessions = [];
    if (!serverState.revokedDeviceIds || typeof serverState.revokedDeviceIds !== 'object') serverState.revokedDeviceIds = {};
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
      const seenOrderKeys = new Set();
      const deduplicatedStartupTickets = [];
      for (const t of serverState.tickets) {
        if (!t || !t.id || delSet.has(t.id)) continue;
        const orderKey = t.orderId ? `ord_${t.orderId}` : (t.orderNumber ? `num_${t.orderNumber}` : null);
        if (orderKey) {
          if (seenOrderKeys.has(orderKey)) {
            console.log(`[Sultan Hub Startup] Removed duplicate ticket ${t.id} for order ${orderKey}`);
            continue;
          }
          seenOrderKeys.add(orderKey);
        }
        if (t.status === 'served' && Array.isArray(t.items)) {
          deduplicatedStartupTickets.push({
            ...t,
            items: t.items.map(it => ({ ...it, completed: true, itemStatus: 'served' }))
          });
        } else {
          deduplicatedStartupTickets.push(t);
        }
      }
      serverState.tickets = deduplicatedStartupTickets;

      // Reconcile online orders against ticket status on startup
      if (Array.isArray(serverState.onlineOrders) && Array.isArray(serverState.tickets)) {
        for (const tk of serverState.tickets) {
          if (!tk || (!tk.orderId && !tk.orderNumber)) continue;
          const ord = serverState.onlineOrders.find(o =>
            (tk.orderId && o.id === tk.orderId) ||
            (tk.orderNumber && o.orderNumber === tk.orderNumber)
          );
          if (!ord) continue;

          const isTicketCooking = tk.status === 'cooking' ||
            (tk.stationStatuses && (tk.stationStatuses.main === 'cooking' || tk.stationStatuses.juice === 'cooking'));
          const isTicketReady = tk.status === 'ready' ||
            (tk.stationStatuses && tk.stationStatuses.main === 'ready' && tk.stationStatuses.juice === 'ready');
          const isTicketServed = tk.status === 'served' ||
            (tk.stationStatuses && tk.stationStatuses.main === 'served' && tk.stationStatuses.juice === 'served');

          if (isTicketServed && ord.status !== 'SERVED' && ord.status !== 'DELIVERED') {
            ord.status = 'SERVED';
          } else if (isTicketReady && ord.status !== 'READY' && ord.status !== 'SERVED' && ord.status !== 'DELIVERED') {
            ord.status = 'READY';
          } else if (isTicketCooking && ord.status === 'CONFIRMED') {
            ord.status = 'PREPARING';
          }
        }
      }
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

// -------------------------------------------------------------
// CENTRAL THERMAL PRINT ENGINE (Zero-Dialog Background ESC/POS)
// -------------------------------------------------------------
const serverAutoPrintedTicketIds = new Set();
// Pre-populate with startup tickets so rebooting server does not reprint historical tickets
if (Array.isArray(serverState.tickets)) {
  for (const t of serverState.tickets) {
    if (t && t.id) serverAutoPrintedTicketIds.add(String(t.id));
  }
}

let isAutoPrintingTicket = false;
const serverPrintQueue = [];

function queueAutoPrintTicket(ticket, station = 'all') {
  if (!ticket || !ticket.id) return;
  const tId = String(ticket.id);
  if (serverAutoPrintedTicketIds.has(tId)) return;
  serverAutoPrintedTicketIds.add(tId);

  // Keep set bounded to last 1000 IDs
  if (serverAutoPrintedTicketIds.size > 1000) {
    const firstKey = serverAutoPrintedTicketIds.values().next().value;
    serverAutoPrintedTicketIds.delete(firstKey);
  }

  if (!printerHelper || typeof printerHelper.printTicketDirect !== 'function') {
    return;
  }

  serverPrintQueue.push({ ticket, station });
  processServerPrintQueue();
}

function processServerPrintQueue() {
  if (isAutoPrintingTicket) return;
  const job = serverPrintQueue.shift();
  if (!job) return;

  isAutoPrintingTicket = true;
  console.log(`[Sultan Hub Auto-Print] Background ESC/POS printing KOT #${job.ticket.id} (${job.ticket.tableName || 'Takeaway'}) to POS-80...`);

  printerHelper.printTicketDirect(job.ticket, {
    station: job.station || 'all',
    printerName: 'POS-80',
  })
    .then((result) => {
      console.log(`[Sultan Hub Auto-Print] Direct KOT #${job.ticket.id} printed successfully to POS-80.`);
      broadcastToClients({
        type: 'TICKET_AUTO_PRINTED',
        ticketId: job.ticket.id,
        station: job.station,
        printer: 'POS-80',
        timestamp: Date.now(),
      });
    })
    .catch((err) => {
      console.warn(`[Sultan Hub Auto-Print] Print error for #${job.ticket.id}:`, err.message);
    })
    .finally(() => {
      setTimeout(() => {
        isAutoPrintingTicket = false;
        processServerPrintQueue();
      }, 250);
    });
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

// -------------------------------------------------------------
// AUTO-START COOKING ENGINE (30 Seconds Auto-Start for KDS Orders)
// -------------------------------------------------------------
const autoStartedServerTicketIds = new Set();

setInterval(() => {
  if (!Array.isArray(serverState.tickets) || serverState.tickets.length === 0) return;
  const now = Date.now();
  let stateModified = false;

  for (const ticket of serverState.tickets) {
    if (!ticket || !ticket.id) continue;
    // Check if ticket is pending and has passed 30 seconds since timePlaced
    if (ticket.status === 'pending') {
      const placedAt = ticket.timePlaced || now;
      const elapsedMs = now - placedAt;

      if (elapsedMs >= 30000 && !autoStartedServerTicketIds.has(ticket.id)) {
        autoStartedServerTicketIds.add(ticket.id);
        ticket.status = 'cooking';
        ticket.cookingStartedAt = now;

        if (!ticket.stationStatuses) {
          ticket.stationStatuses = { main: 'cooking', juice: 'cooking' };
        } else {
          if (ticket.stationStatuses.main === 'pending' || !ticket.stationStatuses.main) {
            ticket.stationStatuses.main = 'cooking';
          }
          if (ticket.stationStatuses.juice === 'pending' || !ticket.stationStatuses.juice) {
            ticket.stationStatuses.juice = 'cooking';
          }
        }

        if (Array.isArray(ticket.items)) {
          ticket.items = ticket.items.map(it => ({
            ...it,
            itemStatus: (it.itemStatus === 'ready' || it.itemStatus === 'served') ? it.itemStatus : 'cooking'
          }));
        }

        stateModified = true;
        console.log(`[Sultan Hub Auto-Cooking] Ticket #${ticket.id} (${ticket.tableName || 'Takeaway'}) auto-transitioned to COOKING after 30s.`);

        const stationLabel = 'Kitchen';
        const cookingAlert = {
          id: `cook_${ticket.id}_all_${now}`,
          ticketId: ticket.id,
          tableId: ticket.tableId,
          tableName: ticket.tableName,
          server: ticket.server,
          station: 'all',
          stationLabel,
          itemsSummary: 'Cooking started! (Timer: 15 mins)',
          type: 'cooking_started',
          estimatedMinutes: 15,
          time: now,
        };
        serverState.lastFoodReadyAlert = cookingAlert;

        // Auto-synchronize linked online order
        const targetOrdId = ticket.orderId || ticket.orderNumber;
        if (targetOrdId && Array.isArray(serverState.onlineOrders)) {
          const ord = serverState.onlineOrders.find(o => o.id === targetOrdId || o.orderNumber === targetOrdId);
          if (ord && (ord.status === 'CONFIRMED' || ord.status === 'PENDING')) {
            ord.status = 'PREPARING';
            ord.updatedAt = now;
            broadcastToClients({
              type: 'ORDER_STATUS_CHANGED',
              orderId: ord.id,
              orderNumber: ord.orderNumber,
              status: 'PREPARING',
              riderName: ord.riderName,
              riderPhone: ord.riderPhone,
              assignedWaiter: ord.assignedWaiter,
              timestamp: now,
            });
          }
        }

        broadcastToClients({
          type: 'COOKING_STARTED_ALERT',
          ticketId: ticket.id,
          ticket,
          lastFoodReadyAlert: cookingAlert,
          timestamp: now,
        });
      }
    }
  }

  if (stateModified) {
    persistState();
    broadcastToClients({
      type: 'SERVER_BROADCAST',
      state: {
        tickets: serverState.tickets,
        lastFoodReadyAlert: serverState.lastFoodReadyAlert,
        onlineOrders: serverState.onlineOrders,
      },
      timestamp: now,
    });
  }
}, 3000);

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
      if (!serverState.categories) serverState.categories = ['All'];
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
    const usedCats = new Set((serverState.menuItems || []).map(m => m.category).filter(Boolean));
    const uniqueCategories = ['All', ...Array.from(usedCats)];

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

      // Rapid de-duplication guard: if identical order arrived within last 6 seconds, return existing order
      const requestedTableId = payload.tableId || payload.tableInfo?.tableId || (orderType === 'dine_in' ? 'DINE-IN-APP' : undefined);
      const nowTs = Date.now();
      const recentDup = (serverState.onlineOrders || []).find(o =>
        o.customer?.phone === customerPhone &&
        (!requestedTableId || o.tableId === requestedTableId) &&
        (nowTs - (o.createdAt || 0)) < 6000
      );
      if (recentDup) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          data: recentDup,
          order: recentDup,
          ticket: (serverState.tickets || []).find(t => t.orderId === recentDup.id) || null,
          pendingConfirmation: recentDup.orderType === 'dine_in',
          message: 'Order already registered.'
        }));
        return;
      }

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
        if (kotTicket) queueAutoPrintTicket(kotTicket, 'all');
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

    // Auto-reconcile orders with live ticket progress
    const tickets = serverState.tickets || [];
    for (const ord of (serverState.onlineOrders || [])) {
      const tk = tickets.find(t => (t.orderId && t.orderId === ord.id) || (t.orderNumber && t.orderNumber === ord.orderNumber));
      if (!tk) continue;
      const isCooking = tk.status === 'cooking' ||
        (tk.stationStatuses && (tk.stationStatuses.main === 'cooking' || tk.stationStatuses.juice === 'cooking'));
      const isReady = tk.status === 'ready' ||
        (tk.stationStatuses && tk.stationStatuses.main === 'ready' && tk.stationStatuses.juice === 'ready');
      const isServed = tk.status === 'served' ||
        (tk.stationStatuses && tk.stationStatuses.main === 'served' && tk.stationStatuses.juice === 'served');

      if (isServed && ord.status !== 'SERVED' && ord.status !== 'DELIVERED') {
        ord.status = 'SERVED';
      } else if (isReady && ord.status !== 'READY' && ord.status !== 'SERVED' && ord.status !== 'DELIVERED') {
        ord.status = 'READY';
      } else if (isCooking && ord.status === 'CONFIRMED') {
        ord.status = 'PREPARING';
      }
    }

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

    // Auto-reconcile single order with live ticket progress
    const matchingTicket = (serverState.tickets || []).find(tk =>
      (tk.orderId && tk.orderId === order.id) ||
      (tk.orderNumber && tk.orderNumber === order.orderNumber)
    );
    if (matchingTicket) {
      const isCooking = matchingTicket.status === 'cooking' ||
        (matchingTicket.stationStatuses && (matchingTicket.stationStatuses.main === 'cooking' || matchingTicket.stationStatuses.juice === 'cooking'));
      const isReady = matchingTicket.status === 'ready' ||
        (matchingTicket.stationStatuses && matchingTicket.stationStatuses.main === 'ready' && matchingTicket.stationStatuses.juice === 'ready');
      const isServed = matchingTicket.status === 'served' ||
        (matchingTicket.stationStatuses && matchingTicket.stationStatuses.main === 'served' && matchingTicket.stationStatuses.juice === 'served');

      if (isServed && order.status !== 'SERVED' && order.status !== 'DELIVERED') {
        order.status = 'SERVED';
      } else if (isReady && order.status !== 'READY' && order.status !== 'SERVED' && order.status !== 'DELIVERED') {
        order.status = 'READY';
      } else if (isCooking && order.status === 'CONFIRMED') {
        order.status = 'PREPARING';
      }
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
            id: `KOT-${(order.orderNumber || order.id).replace(/\D/g, '') || Math.floor(1000 + Math.random() * 9000)}`,
            orderId: order.id,
            orderNumber: order.orderNumber,
            tableId: order.tableId || 'DINE-IN-APP',
            tableName: order.tableName || 'Dine-In',
            server: assignedWaiter || order.assignedWaiter || 'Floor Manager Confirmed',
            timePlaced: Date.now(),
            status: 'pending',
            roundNumber: order.roundNumber || 1,
            isAddOn: order.isAddOn || false,
            stationStatuses: { main: 'pending', juice: 'pending' },
            items: (order.items || []).map(it => ({
              id: it.id,
              name: it.name,
              price: it.unitPrice || it.price,
              qty: it.qty || it.quantity,
              notes: it.notes,
              station: it.station || 'main',
              itemStatus: 'pending',
              completed: false
            }))
          };
          if (!serverState.tickets) serverState.tickets = [];
          serverState.tickets.unshift(ticket);
          if (ticket) queueAutoPrintTicket(ticket, 'all');
        } else {
          if (assignedWaiter) ticket.server = assignedWaiter;
        }

        // Occupy table
        if (order.tableId && order.tableId !== 'DINE-IN-APP') {
          const foundTable = (serverState.tables || []).find(t => t.id === order.tableId || t.name.toLowerCase() === (order.tableName || '').toLowerCase());
          if (foundTable) {
            foundTable.status = 'occupied';
            if (assignedWaiter || order.assignedWaiter) foundTable.server = assignedWaiter || order.assignedWaiter;
            if (!foundTable.orders) foundTable.orders = [];
            const alreadyHasOrder = foundTable.orders.some(o => o.orderId === order.id);
            if (!alreadyHasOrder) {
              foundTable.billTotal = (foundTable.billTotal || 0) + (order.total || 0);
              foundTable.orders.push(...(order.items || []).map(it => ({
                id: it.id,
                orderId: order.id,
                name: it.name,
                price: it.unitPrice || it.price,
                qty: it.qty || it.quantity,
                completed: false
              })));
            }
          }
        }
      } else if (ticket) {
        if (status === 'PREPARING') {
          ticket.status = 'cooking';
          if (!ticket.stationStatuses) ticket.stationStatuses = { main: 'cooking', juice: 'cooking' };
          else {
            if (ticket.stationStatuses.main) ticket.stationStatuses.main = 'cooking';
            if (ticket.stationStatuses.juice) ticket.stationStatuses.juice = 'cooking';
          }
        } else if (status === 'READY' || status === 'READY_FOR_PICKUP') {
          ticket.status = 'ready';
          if (!ticket.stationStatuses) ticket.stationStatuses = { main: 'ready', juice: 'ready' };
          else {
            if (ticket.stationStatuses.main) ticket.stationStatuses.main = 'ready';
            if (ticket.stationStatuses.juice) ticket.stationStatuses.juice = 'ready';
          }
          if (Array.isArray(ticket.items)) {
            ticket.items = ticket.items.map(it => ({ ...it, completed: true, itemStatus: 'ready' }));
          }
        } else if (status === 'DELIVERED' || status === 'SERVED') {
          ticket.status = 'served';
          if (!ticket.stationStatuses) ticket.stationStatuses = { main: 'served', juice: 'served' };
          else {
            if (ticket.stationStatuses.main) ticket.stationStatuses.main = 'served';
            if (ticket.stationStatuses.juice) ticket.stationStatuses.juice = 'served';
          }
          if (Array.isArray(ticket.items)) {
            ticket.items = ticket.items.map(it => ({ ...it, completed: true, itemStatus: 'served' }));
          }
        }
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
      const clientIp = req.socket?.remoteAddress || 'unknown';
      const ticketCount = Array.isArray(data?.state?.tickets) ? data.state.tickets.length : '?';
      console.log(`[Sultan Hub] HTTP POST /api/sync from ${data.senderId || clientIp} (${clientIp}) tickets=${ticketCount}`);
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

  // 8.1 Direct Thermal Printer Raw ESC/POS KOT Dispatch (Instant Silent Print)
  if (url.pathname === '/api/print/kot' && req.method === 'POST') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    try {
      const data = await readRequestBody(req);
      if (!data || !data.ticket) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing ticket payload' }));
        return;
      }
      console.log(`[Sultan Hub] HTTP POST /api/print/kot for ticket #${data.ticket.id} (${data.station || 'all'})`);
      if (data.ticket.id) {
        serverAutoPrintedTicketIds.add(String(data.ticket.id));
      }
      if (printerHelper && typeof printerHelper.printTicketDirect === 'function') {
        const printResult = await printerHelper.printTicketDirect(data.ticket, {
          station: data.station || 'all',
          printerName: data.printerName || 'POS-80',
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(printResult));
      } else {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Printer helper not available' }));
      }
    } catch (err) {
      console.warn('[Sultan Hub] /api/print/kot error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 9. High-Performance Static Web File Server (Serves pre-compiled production SPA from /dist with gzip acceleration)
  if (req.method === 'GET' || req.method === 'HEAD') {
    const DIST_DIR = path.join(__dirname, 'dist');
    if (fs.existsSync(DIST_DIR)) {
      let rawPath = (url.pathname || '/').split('?')[0];
      try {
        rawPath = decodeURIComponent(rawPath);
      } catch (_) { }

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
  <h1>Sultan Restaurant POS</h1>
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
} catch (e) { }

let server8081 = null;
try {
  server8081 = http.createServer(handleRequest);
} catch (e) { }

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
if (server8081) bindUpgrade(server8081);

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
      rolesLen: Array.isArray(st.roles) ? st.roles.length : 0,
      systemSettingsUpdatedAt: (st.systemSettings && st.systemSettings.updatedAt) || 0,
      lastBillPaidAlert: st.lastBillPaidAlert || null,
      lastFoodReadyAlert: st.lastFoodReadyAlert || null,
      pendingFloorOrderAlert: st.pendingFloorOrderAlert || null,
      activeStaffSessions: (st.activeStaffSessions || []).map(s => `${s.sessionId}:${s.deviceId}:${s.staffId}:${s.loginTime}`),
      revokedDeviceIds: Object.keys(st.revokedDeviceIds || {}).sort().join(','),
      shiftsCount: Array.isArray(st.shifts) ? st.shifts.length : 0,
      activeShiftId: st.activeShiftId || null,
    });
  } catch (_) {
    return String(Date.now());
  }
}

function applyStateUpdate(partialState, senderId, originWs = null) {
  if (!partialState || typeof partialState !== 'object') return;

  const prevFingerprint = lastStateFingerprint || computeStateFingerprint(serverState);

  // Merge state keys safely (deletedTicketIds, tickets, and tables MUST be processed first in order)
  const allowedKeys = ['deletedTicketIds', 'tickets', 'tables', 'onlineOrders', 'pendingFloorOrderAlert', 'appUsers', 'appUserLogs', 'invoices', 'menuItems', 'categories', 'regions', 'zones', 'staff', 'customers', 'reservations', 'lastBillPaidAlert', 'lastFoodReadyAlert', 'serviceRequests', 'playlandTickets', 'playlandRides', 'inventory', 'stockMovements', 'expenses', 'feedback', 'unavailableItemIds', 'suppliers', 'purchaseOrders', 'supplierPayments', 'recipes', 'kitchenSessions', 'kitchenConsumption', 'kitchenManualUsage', 'kitchenCash', 'kitchenSettings', 'assets', 'damageRecords', 'shifts', 'activeShiftId', 'roles', 'systemSettings', 'activeStaffSessions', 'revokedDeviceIds'];
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

            // Merge station-level statuses station by station
            const mergedStationStatuses = {
              ...(ext.stationStatuses || {}),
              ...(inc.stationStatuses || {})
            };
            for (const st of ['main', 'juice']) {
              const extStRank = ext.stationStatuses && ext.stationStatuses[st] ? (STATUS_RANK[ext.stationStatuses[st]] ?? 0) : -1;
              const incStRank = inc.stationStatuses && inc.stationStatuses[st] ? (STATUS_RANK[inc.stationStatuses[st]] ?? 0) : -1;
              if (extStRank >= 0 || incStRank >= 0) {
                mergedStationStatuses[st] = extStRank >= incStRank ? ext.stationStatuses[st] : inc.stationStatuses[st];
              }
            }
            chosen.stationStatuses = mergedStationStatuses;

            const activeStVals = Object.values(mergedStationStatuses).filter(Boolean);
            if (activeStVals.length > 0) {
              if (activeStVals.every(s => s === 'served')) {
                chosen.status = 'served';
              } else if (activeStVals.every(s => s === 'ready' || s === 'served')) {
                chosen.status = 'ready';
              } else if (activeStVals.some(s => s === 'cooking')) {
                chosen.status = 'cooking';
              }
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

        // Deduplicate tickets by order key to prevent duplicate KOT cards across client-server sync
        const seenMergedOrders = new Set();
        const deduplicatedMerged = [];
        for (const t of mergedList) {
          const orderKey = t.orderId ? `ord_${t.orderId}` : (t.orderNumber ? `num_${t.orderNumber}` : null);
          if (orderKey) {
            if (seenMergedOrders.has(orderKey)) {
              continue;
            }
            seenMergedOrders.add(orderKey);
          }
          deduplicatedMerged.push(t);
        }

        serverState.tickets = deduplicatedMerged;

        // Auto-print newly placed incoming tickets to POS-80 thermal printer
        for (const inc of incomingTickets) {
          if (!inc || !inc.id) continue;
          if (deletedSet.has(inc.id)) continue;
          if ((inc.status === 'pending' || inc.isAddOn) && Array.isArray(inc.items) && inc.items.length > 0) {
            queueAutoPrintTicket(inc, 'all');
          }
        }

        // Auto-synchronize online orders status with ticket cooking/ready/served state
        if (Array.isArray(serverState.onlineOrders)) {
          for (const tk of deduplicatedMerged) {
            if (!tk || (!tk.orderId && !tk.orderNumber)) continue;
            const ord = serverState.onlineOrders.find(o =>
              (tk.orderId && o.id === tk.orderId) ||
              (tk.orderNumber && o.orderNumber === tk.orderNumber)
            );
            if (!ord) continue;

            const isTicketCooking = tk.status === 'cooking' ||
              (tk.stationStatuses && (tk.stationStatuses.main === 'cooking' || tk.stationStatuses.juice === 'cooking'));
            const isTicketReady = tk.status === 'ready' ||
              (tk.stationStatuses && tk.stationStatuses.main === 'ready' && tk.stationStatuses.juice === 'ready');
            const isTicketServed = tk.status === 'served' ||
              (tk.stationStatuses && tk.stationStatuses.main === 'served' && tk.stationStatuses.juice === 'served');

            let targetStatus = null;
            if (isTicketServed && ord.status !== 'SERVED' && ord.status !== 'DELIVERED') {
              targetStatus = 'SERVED';
            } else if (isTicketReady && ord.status !== 'READY' && ord.status !== 'SERVED' && ord.status !== 'DELIVERED') {
              targetStatus = 'READY';
            } else if (isTicketCooking && ord.status === 'CONFIRMED') {
              targetStatus = 'PREPARING';
            }

            if (targetStatus && ord.status !== targetStatus) {
              ord.status = targetStatus;
              ord.updatedAt = Date.now();
              console.log(`[Sultan Hub Auto-Sync] Updated order ${ord.orderNumber} status to ${targetStatus} based on ticket ${tk.id}`);
              broadcastToClients({
                type: 'ORDER_STATUS_CHANGED',
                orderId: ord.id,
                orderNumber: ord.orderNumber,
                status: targetStatus,
                riderName: ord.riderName,
                riderPhone: ord.riderPhone,
                assignedWaiter: ord.assignedWaiter,
                timestamp: Date.now()
              });
            }
          }
        }
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
        const incoming = Array.isArray(partialState.menuItems) ? partialState.menuItems.filter(m => !isLegacyDummyDish(m)) : [];
        if (incoming.length > 0) {
          serverState.menuItems = incoming;
          modified = true;
        }
      } else if (key === 'categories') {
        const usedCats = new Set((serverState.menuItems || []).map(m => m.category).filter(Boolean));
        serverState.categories = ['All', ...Array.from(usedCats)];
        modified = true;
      } else if (key === 'regions') {
        const incomingRegs = Array.isArray(partialState.regions) ? partialState.regions : [];
        if (incomingRegs.length > 0) {
          serverState.regions = Array.from(new Set([...(serverState.regions || []), ...incomingRegs]));
          modified = true;
        }
      } else if (key === 'systemSettings') {
        const incSettings = partialState.systemSettings;
        if (incSettings && typeof incSettings === 'object') {
          const currUpdated = (serverState.systemSettings && serverState.systemSettings.updatedAt) || 0;
          const incUpdated = typeof incSettings.updatedAt === 'number' ? incSettings.updatedAt : 0;
          if (currUpdated === 0 || incUpdated >= currUpdated) {
            serverState.systemSettings = {
              ...(serverState.systemSettings || {}),
              ...incSettings,
            };
            modified = true;
          }
        }
      } else if (key === 'revokedDeviceIds') {
        if (partialState.revokedDeviceIds && typeof partialState.revokedDeviceIds === 'object') {
          serverState.revokedDeviceIds = {
            ...(serverState.revokedDeviceIds || {}),
            ...partialState.revokedDeviceIds,
          };
          modified = true;
        }
      } else if (key === 'activeStaffSessions') {
        if (Array.isArray(partialState.activeStaffSessions)) {
          serverState.activeStaffSessions = partialState.activeStaffSessions;
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
    if (partialState.revokedDeviceIds && Object.keys(partialState.revokedDeviceIds).length > 0) {
      broadcastToClients({
        type: 'FORCE_LOGOUT_DEVICE',
        revokedDeviceIds: serverState.revokedDeviceIds,
        timestamp: Date.now()
      });
    }
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

let lastProcessedCloudTimestamp = 0;
let lastProcessedCloudUpdateTime = '';
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
          systemSettings: serverState.systemSettings,
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
    if (doc.updateTime && doc.updateTime === lastProcessedCloudUpdateTime) return;
    const fields = doc.fields || {};
    const senderId = fields.senderId?.stringValue;
    if (senderId === 'SERVER_POS_HUB') return;
    const timestamp = Number(fields.timestamp?.integerValue || 0);
    if (timestamp && timestamp === lastProcessedCloudTimestamp) return;

    if (fields.state?.mapValue?.fields) {
      const decodedState = decodeFirestoreValue(fields.state);
      if (decodedState && typeof decodedState === 'object') {
        isApplyingCloudUpdate = true;
        lastProcessedCloudTimestamp = timestamp || Date.now();
        if (doc.updateTime) lastProcessedCloudUpdateTime = doc.updateTime;
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
        const ticketCount = Array.isArray(data.state.tickets) ? data.state.tickets.length : '?';
        console.log(`[Sultan Hub] WS CLIENT_UPDATE from ${data.senderId || 'CLIENT'} tickets=${ticketCount}`);
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
    console.log(`SULTAN RESTAURANT CENTRAL POS & API HUB ONLINE`);
    console.log(`Port: ${PORT} (Dual-Stack IPv4 0.0.0.0 + IPv6 ::)`);
    console.log(`Auth API: http://localhost:${PORT}/api/auth/login`);
    console.log(`Admin Users API: http://localhost:${PORT}/api/admin/app-users`);
    console.log(`Public Menu: http://localhost:${PORT}/api/public/menu`);
    console.log(`Online Orders: http://localhost:${PORT}/api/public/orders`);
    console.log(`WebSocket URL: ws://localhost:${PORT}`);
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
    console.log(`Sultan POS Hub also active on Port 5000 (Firewall-Friendly LAN Range)`);
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
      console.log(`Sultan POS Hub also active on Port 80 (Standard WWW HTTP)`);
    },
    (err) => {
      console.log('[Sultan Hub] Port 80 listener:', err.message);
    }
  );
}

if (server8081 && PORT !== 8081 && !process.env.SKIP_8081) {
  listenDualStack(
    server8081,
    8081,
    () => {
      console.log(`Sultan Web POS & Fast Hub active on Port 8081 (Instant Launch)`);
    },
    (err) => {
      console.log('[Sultan Hub] Port 8081 in use (e.g. by Metro bundler) — primary hub active on 5050 & 5000');
    }
  );
}
