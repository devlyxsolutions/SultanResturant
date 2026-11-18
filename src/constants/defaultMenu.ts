export interface MenuVariant {
  name: string;
  price: number;
}

export interface ComboItem {
  menuItemId: string;
  name: string;
  qty: number;
  price?: number;
  variantName?: string;
}

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  region?: string;
  variants?: MenuVariant[];
  station?: 'main' | 'juice';
  prepTimeMin?: number;
  imageUri?: string;
  description?: string;
  badge?: string;
  costPrice?: number;
  trackStock?: boolean;
  stockQty?: number;
  lowStockThreshold?: number;
  isDeal?: boolean;
  dealItems?: ComboItem[];
  dealOriginalPrice?: number;
}

export const SULTAN_DEFAULT_CATEGORIES = [
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
];

export const SULTAN_DEFAULT_REGIONS = [
  "Pakistani",
  "Continental",
  "Chinese",
  "Italian",
  "Fast Food",
  "Turkish",
  "Arabic",
  "BBQ",
  "Beverages",
  "Bakery & Desserts"
];

export const SULTAN_DEFAULT_MENU: MenuItem[] = [
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
];
