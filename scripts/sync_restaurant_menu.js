const fs = require('fs');
const path = require('path');

const FIREBASE_REST_URL = 'https://sultan-resturant-default-rtdb.firebaseio.com/sultan_restaurant/live_state.json';
const FIREBASE_REST_LAST_UPDATED_URL = 'https://sultan-resturant-default-rtdb.firebaseio.com/sultan_restaurant/last_updated.json';

const SULTAN_CATEGORIES = [
  'Appetizers',
  'Mains',
  'Desserts',
  'Drinks',
  'Deals'
];

const SULTAN_MENU = [
  {
    id: 'm1',
    name: 'Sultan Seekh Kebab',
    price: 1450,
    costPrice: 650,
    category: 'Mains',
    imageUri: 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=600&q=80',
    description: 'Tender minced mutton & beef grilled with royal Sultan spices on open charcoal.',
    badge: 'Chef Special',
    trackStock: true,
    stockQty: 35,
    lowStockThreshold: 10,
    station: 'main',
    prepTimeMin: 20
  },
  {
    id: 'm2',
    name: 'Desi Murgh Karahi',
    price: 1850,
    costPrice: 820,
    category: 'Mains',
    imageUri: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=600&q=80',
    description: 'Fresh chicken cooked in pure desi ghee, fresh tomatoes, ginger and green chillies.',
    badge: 'Best Seller',
    trackStock: true,
    stockQty: 25,
    lowStockThreshold: 5,
    station: 'main',
    prepTimeMin: 25
  },
  {
    id: 'm3',
    name: 'Hummus with Warm Pita',
    price: 650,
    costPrice: 220,
    category: 'Appetizers',
    imageUri: 'https://images.unsplash.com/photo-1577906096429-f73c2c312435?w=600&q=80',
    description: 'Creamy chickpea dip with extra virgin olive oil and freshly baked pita bread.',
    badge: 'Healthy',
    trackStock: true,
    stockQty: 40,
    lowStockThreshold: 10,
    station: 'main',
    prepTimeMin: 8
  },
  {
    id: 'm4',
    name: 'Royal Turkish Kunafa',
    price: 850,
    costPrice: 320,
    category: 'Desserts',
    imageUri: 'https://images.unsplash.com/photo-1608836561226-d621b10a26e8?w=600&q=80',
    description: 'Crunchy golden pastry filled with stretchy sweet cheese, soaked in rose syrup & pistachios.',
    badge: 'Signature',
    trackStock: true,
    stockQty: 20,
    lowStockThreshold: 6,
    station: 'main',
    prepTimeMin: 12
  },
  {
    id: 'm5',
    name: 'Fresh Mint Margarita',
    price: 450,
    costPrice: 120,
    category: 'Drinks',
    imageUri: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&q=80',
    description: 'Blended fresh mint leaves, lemon juice, soda and crushed ice.',
    badge: 'Chilled',
    trackStock: true,
    stockQty: 50,
    lowStockThreshold: 15,
    station: 'juice',
    prepTimeMin: 5
  },
  {
    id: 'm6',
    name: 'Fajita Supreme Pizza',
    price: 1400,
    costPrice: 550,
    category: 'Mains',
    imageUri: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&q=80',
    description: 'Crispy crust loaded with fajita chicken, bell peppers, olives and mozzarella.',
    badge: 'Popular',
    trackStock: false,
    station: 'main',
    prepTimeMin: 18,
    variants: [
      { name: 'Small (7")', price: 850 },
      { name: 'Medium (10")', price: 1400 },
      { name: 'Large (13")', price: 1950 },
      { name: 'Family (16")', price: 2500 }
    ]
  },
  {
    id: 'm7',
    name: 'Smoked Mutton Ribs',
    price: 3500,
    costPrice: 1800,
    category: 'Mains',
    imageUri: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&q=80',
    description: 'Slow-smoked juicy mutton ribs marinated in Sultan royal rub.',
    badge: 'Signature',
    trackStock: true,
    stockQty: 10,
    lowStockThreshold: 4,
    station: 'main',
    prepTimeMin: 35,
    variants: [
      { name: 'Half KG', price: 3500 },
      { name: '1 KG', price: 6800 }
    ]
  },
  {
    id: 'm8',
    name: 'Sultan Dum Biryani',
    price: 950,
    costPrice: 400,
    category: 'Mains',
    imageUri: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&q=80',
    description: 'Fragrant basmati rice layered with spiced meat and caramelized onions.',
    badge: 'Popular',
    trackStock: true,
    stockQty: 30,
    lowStockThreshold: 8,
    station: 'main',
    prepTimeMin: 15
  },
  {
    id: 'm9',
    name: 'Grand Sultan Angus Burger',
    price: 1150,
    costPrice: 480,
    category: 'Mains',
    imageUri: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&q=80',
    description: 'Juicy 200g beef patty, smoked cheese, caramelized onions and house sauce.',
    badge: 'Chef Special',
    trackStock: true,
    stockQty: 20,
    lowStockThreshold: 5,
    station: 'main',
    prepTimeMin: 18
  },
  {
    id: 'm10',
    name: 'Cheesy Truffle Fries',
    price: 590,
    costPrice: 190,
    category: 'Appetizers',
    imageUri: 'https://images.unsplash.com/photo-1585109649139-366815a0d713?w=600&q=80',
    description: 'Golden crispy fries topped with melted cheddar, jalapenos and spicy garlic dip.',
    badge: 'Snack',
    trackStock: true,
    stockQty: 35,
    lowStockThreshold: 10,
    station: 'main',
    prepTimeMin: 10
  },
  {
    id: 'm11',
    name: 'Choco Molten Lava Cake',
    price: 750,
    costPrice: 260,
    category: 'Desserts',
    imageUri: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600&q=80',
    description: 'Warm chocolate cake with a molten Belgian chocolate center served with vanilla ice cream.',
    badge: 'Sweet',
    trackStock: true,
    stockQty: 15,
    lowStockThreshold: 5,
    station: 'main',
    prepTimeMin: 15
  },
  {
    id: 'm12',
    name: 'Mango Kulfa Shake',
    price: 550,
    costPrice: 180,
    category: 'Drinks',
    imageUri: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=600&q=80',
    description: 'Thick mango pulp blended with traditional kulfa ice cream and dry fruits.',
    badge: 'Rich',
    trackStock: true,
    stockQty: 40,
    lowStockThreshold: 10,
    station: 'juice',
    prepTimeMin: 6
  },
  {
    id: 'm13',
    name: 'Sultan Special Roghni Naan',
    price: 150,
    costPrice: 50,
    category: 'Appetizers',
    imageUri: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600&q=80',
    description: 'Traditional clay oven baked naan brushed with desi ghee and sesame seeds.',
    badge: 'Hot',
    trackStock: true,
    stockQty: 100,
    lowStockThreshold: 20,
    station: 'main',
    prepTimeMin: 5
  },
  {
    id: 'm14',
    name: 'Mutton Shinwari Karahi',
    price: 2800,
    costPrice: 1400,
    category: 'Mains',
    imageUri: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=600&q=80',
    description: 'Traditional Shinwari style tender mutton prepared with black pepper, salt and fresh tomatoes.',
    badge: 'Chef Special',
    trackStock: true,
    stockQty: 15,
    lowStockThreshold: 4,
    station: 'main',
    prepTimeMin: 35
  },
  {
    id: 'deal1',
    name: 'Sultan Family Feast (4-5 Persons)',
    price: 4999,
    costPrice: 2300,
    category: 'Deals',
    imageUri: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&q=80',
    description: 'Complete family banquet: 1x Desi Murgh Karahi + 2x Sultan Seekh Kebabs + 1x Medium Fajita Pizza + 2x Fresh Mint Margaritas + 1x Royal Turkish Kunafa.',
    badge: 'Family Deal',
    isDeal: true,
    dealOriginalPrice: 6050,
    prepTimeMin: 25,
    dealItems: [
      { menuItemId: 'm2', name: 'Desi Murgh Karahi', qty: 1, price: 1850 },
      { menuItemId: 'm1', name: 'Sultan Seekh Kebab', qty: 2, price: 1450 },
      { menuItemId: 'm6', name: 'Fajita Supreme Pizza (Medium)', qty: 1, price: 1400 },
      { menuItemId: 'm5', name: 'Fresh Mint Margarita', qty: 2, price: 450 },
      { menuItemId: 'm4', name: 'Royal Turkish Kunafa', qty: 1, price: 850 }
    ],
    trackStock: true,
    stockQty: 15,
    lowStockThreshold: 5,
    station: 'main'
  },
  {
    id: 'deal2',
    name: 'Royal Couple Platter (2 Persons)',
    price: 2850,
    costPrice: 1250,
    category: 'Deals',
    imageUri: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&q=80',
    description: 'Perfect for two: 2x Sultan Seekh Kebabs + 1x Hummus with Warm Pita + 2x Fresh Mint Margaritas + 1x Royal Turkish Kunafa.',
    badge: 'Couple Deal',
    isDeal: true,
    dealOriginalPrice: 3400,
    prepTimeMin: 20,
    dealItems: [
      { menuItemId: 'm1', name: 'Sultan Seekh Kebab', qty: 2, price: 1450 },
      { menuItemId: 'm3', name: 'Hummus with Warm Pita', qty: 1, price: 650 },
      { menuItemId: 'm5', name: 'Fresh Mint Margarita', qty: 2, price: 450 },
      { menuItemId: 'm4', name: 'Royal Turkish Kunafa', qty: 1, price: 850 }
    ],
    trackStock: true,
    stockQty: 20,
    lowStockThreshold: 5,
    station: 'main'
  }
];

async function run() {
  console.log('Fetching live_state from Firebase...');
  const res = await fetch(FIREBASE_REST_URL);
  const data = await res.json();

  if (!data || !data.state) {
    console.error('No state found in Firebase!');
    process.exit(1);
  }

  console.log('Existing menu count in Firebase:', data.state.menuItems?.length);
  console.log('Existing first menu item:', data.state.menuItems?.[0]?.name);

  // Replace menuItems and categories with authentic Sultan Restaurant data
  data.state.menuItems = SULTAN_MENU;
  data.state.categories = SULTAN_CATEGORIES;

  const now = Date.now();
  data.timestamp = now;
  data.packetId = `sync_script_${now}`;

  console.log('Uploading updated state to Firebase...');
  const putRes = await fetch(FIREBASE_REST_URL, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!putRes.ok) {
    console.error('Failed to update live_state.json:', putRes.status, await putRes.text());
    process.exit(1);
  }

  await fetch(FIREBASE_REST_LAST_UPDATED_URL, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(now),
  });

  console.log('Successfully updated Sultan Restaurant menu in Firebase Realtime Database!');
  console.log('Total items synced:', SULTAN_MENU.length);
}

run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
