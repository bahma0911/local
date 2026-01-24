import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';
import connectMongo from '../mongo.js';
import Shop from '../models/Shop.js';
import Order from '../models/Order.js';
import User from '../models/User.js';
import bcrypt from 'bcrypt';

const DATA_DIR = path.join(process.cwd(), 'data');
const SHOPS_FILE = path.join(DATA_DIR, 'shops.json');
const CUSTOMERS_FILE = path.join(DATA_DIR, 'customers.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');

const run = async () => {
  await connectMongo();
  console.log('Connected, starting migration...');

  // Shops
  try {
    const raw = fs.readFileSync(SHOPS_FILE, 'utf8');
    const shops = JSON.parse(raw || '[]');
    for (const s of shops) {
      const existing = await Shop.findOne({ legacyId: s.id }).exec();
      const owner = { ...(s.owner || {}) };
      if (owner.password && !owner.password.startsWith('$2')) {
        owner.password = await bcrypt.hash(String(owner.password), 10);
      }
      const doc = {
        legacyId: s.id,
        name: s.name,
        category: s.category,
        address: s.address,
        deliveryFee: s.deliveryFee,
        deliveryServices: s.deliveryServices,
        owner,
        products: s.products || [],
        orders: s.orders || []
      };
      if (existing) {
        await Shop.updateOne({ legacyId: s.id }, doc).exec();
        console.log('Updated shop', s.id);
      } else {
        await Shop.create(doc);
        console.log('Inserted shop', s.id);
      }
    }
  } catch (e) {
    console.error('Shops migration failed', e && e.message ? e.message : e);
  }

  // Orders
  try {
    const raw = fs.readFileSync(ORDERS_FILE, 'utf8');
    const orders = JSON.parse(raw || '[]');
    for (const o of orders) {
      const existing = await Order.findOne({ id: o.id }).exec();
      const doc = { id: o.id, shopId: o.shopId, items: o.items || [], total: o.total || 0, customer: o.customer || {}, status: o.status || 'new', createdAt: o.createdAt ? new Date(o.createdAt) : new Date() };
      if (existing) {
        await Order.updateOne({ id: o.id }, doc).exec();
        console.log('Updated order', o.id);
      } else {
        await Order.create(doc);
        console.log('Inserted order', o.id);
      }
    }
  } catch (e) {
    console.error('Orders migration failed', e && e.message ? e.message : e);
  }

  // Customers
  try {
    const raw = fs.readFileSync(CUSTOMERS_FILE, 'utf8');
    const customers = JSON.parse(raw || '[]');
    for (const c of customers) {
      const existing = await User.findOne({ username: c.username }).exec();
      const doc = { username: c.username, email: c.email || `${c.username}@example.com`, password: c.password || '', role: 'customer', name: c.name || '' };
      if (existing) {
        await User.updateOne({ username: c.username }, doc).exec();
        console.log('Updated customer', c.username);
      } else {
        await User.create(doc);
        console.log('Inserted customer', c.username);
      }
    }
  } catch (e) {
    console.error('Customers migration failed', e && e.message ? e.message : e);
  }

  console.log('Migration complete.');
  process.exit(0);
};

run().catch(err => { console.error(err); process.exit(1); });
