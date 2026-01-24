// src/data/shopsData.js
export const deliveryServices = {
  negadras: {
    id: 'negadras',
    name: 'Negadras Express',
    logo: '🚚',
    description: 'Fast and reliable delivery service',
    services: [
      {
        id: 'standard',
        name: 'Standard Delivery',
        description: ' 1-2 business days',
        baseCost: 50,
        costPerKm: 2,
        estimatedDays: '1-2'
      },
      {
        id: 'express', 
        name: 'Express Delivery',
        description: ' Same Day',
        baseCost: 100,
        costPerKm: 5,
        estimatedDays: ' Same Day'
      }
    ]
  },
  pickup: {
    id: 'pickup',
    name: 'Store Pickup',
    logo: '🏪',
    description: 'Pick up from the store',
    services: [
      {
        id: 'pickup',
        name: 'Store Pickup',
        description: 'Pick up your order from the store',
        baseCost: 0,
        costPerKm: 0,
        estimatedDays: '0'
      }
    ]
  }
};

export const shops = [
  {
    id: 1,
    name: "Abebe Electronics",
    category: "Electronics",
    address: "Bole, Addis Ababa - Near Bole Medhanealem",
    deliveryFee: 150,
    deliveryServices: ['negadras', 'pickup'],
    owner: {
      username: "abebe",
      password: "electronics123"
    },
    products: [
      { 
        id: 1,
        name: "Smartphone",
        price: 5000,
        image: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&h=300&fit=crop",
        description: "Latest model smartphone",
        inStock: true,
        rating: 4.5,
        reviewCount: 23
      },
      { 
        id: 2,
        name: "Laptop",
        price: 15000,
        image: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=400&h=300&fit=crop",
        description: "High-performance laptop",
        inStock: false,
        rating: 4.2,
        reviewCount: 15
      },
    ],
  },
  {
    id: 2,
    name: "Selam Grocery",
    category: "Grocery",
    address: "Merkato, Addis Ababa - Opposite Merkato Market",
    deliveryFee: 50,
    deliveryServices: ['negadras', 'pickup'],
    owner: {
      username: "selam",
      password: "grocery123"
    },
    products: [
      { 
        id: 3,
        name: "Rice",
        price: 150,
        image: "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&h=300&fit=crop",
        description: "Premium quality rice",
        inStock: true,
        rating: 4.0,
        reviewCount: 45
      },
      { 
        id: 4,
        name: "Cooking Oil",
        price: 200,
        image: "https://images.unsplash.com/photo-1573408301185-9146fe634ad0?w=400&h=300&fit=crop",
        description: "Pure cooking oil",
        inStock: true,
        rating: 4.3,
        reviewCount: 32
      },
    ],
  },
];

export const categories = ["All", "Electronics", "Grocery", "Clothing", "Furniture", "Books" ,"Stationary", "Food"];