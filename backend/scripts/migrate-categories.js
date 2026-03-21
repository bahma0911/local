import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Category from '../models/Category.js';
import Product from '../models/Product.js';

// Load environment variables
dotenv.config();

async function migrateCategories() {
  try {
    console.log('Connecting to MongoDB...');

    // Use the same connection logic as the main app
    const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/negadras';
    const dbName = process.env.MONGODB_DB || 'negadras';

    await mongoose.connect(MONGODB_URI, { dbName });
    console.log('Connected to MongoDB successfully');

    // Get all distinct categories from products
    const existingCategories = await Product.distinct('category');
    console.log('Found categories in products:', existingCategories);

    // Create categories for each unique category found
    const categoriesToCreate = [];
    const categoryMap = {
      'Electronics': { icon: '📱', description: 'Electronic devices and gadgets' },
      'Food': { icon: '🍕', description: 'Food and beverages' },
      'Books': { icon: '📚', description: 'Books and educational materials' },
      'Stationary': { icon: '✏️', description: 'Stationary and office supplies' },
      'Clothing': { icon: '👕', description: 'Clothing and fashion' },
      'Furniture': { icon: '🪑', description: 'Furniture and home decor' }
    };

    for (const categoryName of existingCategories) {
      if (categoryName && categoryName.trim()) {
        // Check if category already exists
        const existing = await Category.findOne({ name: categoryName.trim() });
        if (!existing) {
          const categoryData = categoryMap[categoryName.trim()] || { icon: '📦', description: '' };
          categoriesToCreate.push({
            name: categoryName.trim(),
            ...categoryData,
            isActive: true,
            sortOrder: categoriesToCreate.length
          });
        }
      }
    }

    if (categoriesToCreate.length > 0) {
      console.log('Creating categories:', categoriesToCreate.map(c => c.name));
      await Category.insertMany(categoriesToCreate);
      console.log(`Created ${categoriesToCreate.length} categories`);
    } else {
      console.log('No new categories to create');
    }

    // List all categories
    const allCategories = await Category.find().sort({ sortOrder: 1 });
    console.log('All categories in database:');
    allCategories.forEach(cat => console.log(`- ${cat.name} (${cat.icon}) - ${cat.isActive ? 'Active' : 'Inactive'}`));

    await mongoose.disconnect();
    console.log('Migration completed successfully');

  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

migrateCategories();