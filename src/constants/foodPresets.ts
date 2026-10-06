export interface FoodPreset {
  id: string;
  name: string;
  category: string;
  imageUri: string;
  icon: string;
  defaultPrice: number;
  defaultCost: number;
  badge?: string;
  description: string;
}

export const FOOD_PRESETS: FoodPreset[] = [
  // BBQ & Kebabs
  {
    id: 'kebab-seekh',
    name: 'Sultan Seekh Kebab',
    category: 'Mains',
    imageUri: 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=600&q=80',
    icon: 'flame-outline',
    defaultPrice: 1450,
    defaultCost: 650,
    badge: 'Chef Special',
    description: 'Tender minced mutton & beef grilled with royal Sultan spices on open charcoal.'
  },
  {
    id: 'chicken-karahi',
    name: 'Desi Murgh Karahi',
    category: 'Mains',
    imageUri: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=600&q=80',
    icon: 'restaurant-outline',
    defaultPrice: 1850,
    defaultCost: 820,
    badge: 'Best Seller',
    description: 'Fresh chicken cooked in pure desi ghee, fresh tomatoes, ginger and green chillies.'
  },
  {
    id: 'mutton-ribs',
    name: 'Smoked Mutton Ribs',
    category: 'Mains',
    imageUri: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&q=80',
    icon: 'flame-outline',
    defaultPrice: 3500,
    defaultCost: 1800,
    badge: 'Signature',
    description: 'Slow-smoked juicy mutton ribs marinated in Sultan royal rub.'
  },
  {
    id: 'biryani-special',
    name: 'Sultan Dum Biryani',
    category: 'Mains',
    imageUri: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&q=80',
    icon: 'nutrition-outline',
    defaultPrice: 950,
    defaultCost: 400,
    badge: 'Popular',
    description: 'Fragrant basmati rice layered with spiced meat and caramelized onions.'
  },
  // Fast Food & Pizzas
  {
    id: 'fajita-pizza',
    name: 'Fajita Supreme Pizza',
    category: 'Mains',
    imageUri: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&q=80',
    icon: 'pizza-outline',
    defaultPrice: 1400,
    defaultCost: 550,
    badge: 'Hot',
    description: 'Crispy crust loaded with fajita chicken, bell peppers, olives and mozzarella.'
  },
  {
    id: 'sultan-burger',
    name: 'Grand Sultan Angus Burger',
    category: 'Mains',
    imageUri: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&q=80',
    icon: 'fast-food-outline',
    defaultPrice: 1150,
    defaultCost: 480,
    badge: 'Chef Special',
    description: 'Juicy 200g beef patty, smoked cheese, caramelized onions and house sauce.'
  },
  // Appetizers
  {
    id: 'hummus-pita',
    name: 'Hummus with Warm Pita',
    category: 'Appetizers',
    imageUri: 'https://images.unsplash.com/photo-1577906096429-f73c2c312435?w=600&q=80',
    icon: 'leaf-outline',
    defaultPrice: 650,
    defaultCost: 220,
    badge: 'Healthy',
    description: 'Creamy chickpea dip with extra virgin olive oil and freshly baked pita bread.'
  },
  {
    id: 'loaded-fries',
    name: 'Cheesy Truffle Fries',
    category: 'Appetizers',
    imageUri: 'https://images.unsplash.com/photo-1585109649139-366815a0d713?w=600&q=80',
    icon: 'fast-food-outline',
    defaultPrice: 590,
    defaultCost: 190,
    badge: 'Snack',
    description: 'Golden crispy fries topped with melted cheddar, jalapenos and spicy garlic dip.'
  },
  // Desserts
  {
    id: 'kunafa-dessert',
    name: 'Royal Turkish Kunafa',
    category: 'Desserts',
    imageUri: 'https://images.unsplash.com/photo-1608836561226-d621b10a26e8?w=600&q=80',
    icon: 'ice-cream-outline',
    defaultPrice: 850,
    defaultCost: 320,
    badge: 'Signature',
    description: 'Crunchy golden pastry filled with sweet cheese, soaked in rose syrup & pistachios.'
  },
  {
    id: 'molten-cake',
    name: 'Choco Molten Lava Cake',
    category: 'Desserts',
    imageUri: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600&q=80',
    icon: 'cafe-outline',
    defaultPrice: 750,
    defaultCost: 260,
    badge: 'Sweet',
    description: 'Warm chocolate cake with a molten Belgian chocolate center served with vanilla ice cream.'
  },
  // Drinks & Beverages
  {
    id: 'mint-margarita',
    name: 'Fresh Mint Margarita',
    category: 'Drinks',
    imageUri: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&q=80',
    icon: 'wine-outline',
    defaultPrice: 450,
    defaultCost: 120,
    badge: 'Chilled',
    description: 'Blended fresh mint leaves, lemon juice, soda and crushed ice.'
  },
  {
    id: 'royal-shake',
    name: 'Mango Kulfa Shake',
    category: 'Drinks',
    imageUri: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=600&q=80',
    icon: 'beer-outline',
    defaultPrice: 550,
    defaultCost: 180,
    badge: 'Rich',
    description: 'Thick mango pulp blended with traditional kulfa ice cream and dry fruits.'
  },
  // Deals & Combos
  {
    id: 'family-feast-combo',
    name: 'Sultan Family Feast (4-5 Persons)',
    category: 'Deals',
    imageUri: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&q=80',
    icon: 'gift-outline',
    defaultPrice: 4999,
    defaultCost: 2300,
    badge: 'Family Deal',
    description: 'Includes 1x Chicken Karahi (Full), 4x Seekh Kebabs, 1x Large Pizza, 4x Roghani Naans, 4x Mint Margaritas, 1x Kunafa.'
  },
  {
    id: 'couple-platter-combo',
    name: 'Royal Couple Platter (2 Persons)',
    category: 'Deals',
    imageUri: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&q=80',
    icon: 'gift-outline',
    defaultPrice: 2850,
    defaultCost: 1250,
    badge: 'Couple Deal',
    description: 'Includes 2x Sultan Kebabs, 1x Hummus & Pita, 2x Margaritas, 1x Kunafa Dessert.'
  }
];

export const POPULAR_BADGES = [
  'Chef Special',
  'Best Seller',
  'Signature',
  'Family Deal',
  'Couple Deal',
  'Spicy 🌶️',
  'Vegetarian 🥬',
  'Discount 20%',
  'Limited Time',
  'New'
];
