#!/usr/bin/env node
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import connectMongo from '../mongo.js';
import mongoose from 'mongoose';
import ShopModel from '../models/Shop.js';
import ProductModel from '../models/Product.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const SHOPS_FILE = path.join(DATA_DIR, 'shops.json');

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run') || argv.includes('-n');
const commit = argv.includes('--commit') || argv.includes('-c');
const clear = argv.includes('--clear');

const readShops = () => {
  try {
    const raw = fs.readFileSync(SHOPS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to read shops.json', e && e.message ? e.message : e);
    return [];
  }
};

const ensureShop = async (s) => {
  const legacyId = Number(s.id);
  let doc = await ShopModel.findOne({ legacyId }).exec();
  if (!doc) {
    const payload = {
      legacyId,
      name: s.name || `shop-${legacyId}`,
      category: s.category || '',
      address: s.address || '',
      deliveryFee: Number(s.deliveryFee || 0),
      deliveryServices: Array.isArray(s.deliveryServices) ? s.deliveryServices : [],
      owner: s.owner || {},
      products: [],
      orders: s.orders || []
    };
    if (dryRun) {
      console.log('[DRY] Would create ShopModel', { legacyId, name: payload.name });
      return null;
    }
    doc = await ShopModel.create(payload);
    console.log('Created ShopModel legacyId=', legacyId);
  }
  return doc;
};

const importProducts = async () => {
  await connectMongo();
  if (!mongoose.connection || mongoose.connection.readyState !== 1) {
    console.error('MongoDB not connected; aborting');
    process.exit(1);
  }

  if (clear && !dryRun) {
    console.log('Clearing Product collection...');
    await ProductModel.deleteMany({}).exec();
  }

  const shops = readShops();
  let created = 0;
  let skipped = 0;

  for (const s of shops) {
    const shopDoc = await ensureShop(s);
    const shopObjId = shopDoc ? shopDoc._id : null;
    const shopLegacyId = Number(s.id);
    const products = Array.isArray(s.products) ? s.products : [];

    for (const p of products) {
      const priceAmount = Math.floor(Number(p.price || 0));
      // check existing product by name + shopLegacyId + price
      const exists = await ProductModel.findOne({ name: p.name, shopLegacyId: shopLegacyId, 'price.amount': priceAmount }).lean().exec();
      if (exists) {
        skipped++;
        if (dryRun) console.log('[DRY] Skip existing:', p.name, 'shop', shopLegacyId);
        continue;
      }

      const doc = {
        name: p.name || `product-${Date.now()}`,
        description: p.description || '',
        price: { amount: priceAmount, currency: 'ETB' },
        images: p.image ? [p.image] : [],
        shopId: shopObjId,
        shopLegacyId: shopLegacyId,
        category: p.category || s.category || null,
        stock: (typeof p.inStock !== 'undefined') ? (p.inStock ? 1 : 0) : 0,
        status: 'active',
        attributes: {}
      };

      if (dryRun) {
        console.log('[DRY] Would create product:', doc.name, 'shopLegacyId=', shopLegacyId);
        created++;
        continue;
      }

      await ProductModel.create(doc);
      created++;
      console.log('Imported product', doc.name, 'for shop', shopLegacyId);
    }
  }

  console.log('Import complete. created=', created, 'skipped=', skipped);
  process.exit(0);
};

importProducts().catch(err => {
  console.error('Import failed', err && err.stack ? err.stack : err);
  process.exit(2);
});
