import { z } from 'zod';
import { warn } from './logger.js';

export const schemas = {
  authLogin: z.object({ username: z.string().min(1), password: z.string().min(1) }),
  authRegister: z.object({
    username: z.string().min(1),
    password: z.string().min(6),
    email: z.string().email(),
    phone: z.string().optional(),
    address: z.string().optional(),
  }),
  resetPassword: z.object({ email: z.string().email(), newPassword: z.string().min(6) }),
  orderCreate: z.object({
    shopId: z.union([z.string(), z.number()]),
    customer: z.object({ username: z.string().optional(), email: z.string().email().optional() }).optional(),
    items: z.array(z.object({
      productId: z.union([z.string(), z.number()]).optional(),
      id: z.union([z.string(), z.number()]).optional(),
      quantity: z.number().int().min(1).optional(),
      qty: z.number().int().min(1).optional(),
      price: z.number().nonnegative().optional(),
      name: z.string().optional()
    }).refine(obj => (obj.productId !== undefined || obj.id !== undefined) && (obj.quantity !== undefined || obj.qty !== undefined), { message: 'Each item must include id/productId and quantity/qty' })),
    total: z.number(),
    paymentMethod: z.string().optional(),
  }),
  shopCreate: z.object({
    name: z.string().min(1),
    owner: z.object({ username: z.string().min(1), password: z.string().min(6).optional() }).optional(),
    address: z.string().optional(),
  }),
  shopUpdate: z.object({
    name: z.string().min(1).optional(),
    owner: z.object({ username: z.string().min(1).optional(), password: z.string().min(6).optional() }).optional(),
    address: z.string().optional(),
  }),
  productCreate: z.object({
    name: z.string().min(1),
    price: z.union([
      z.number().int().nonnegative(),
      z.object({ amount: z.number().int().nonnegative(), currency: z.string().optional() })
    ]).optional(),
    description: z.string().optional(),
    images: z.array(z.string()).optional(),
    shopId: z.union([z.number(), z.string()]).optional(),
    category: z.string().optional(),
    stock: z.number().int().nonnegative().optional(),
    status: z.enum(['active', 'draft', 'archived']).optional(),
    attributes: z.record(z.string()).optional()
  }),
  shopOrderNotify: z.object({ orderId: z.union([z.string(), z.number()]), items: z.array(z.any()).optional(), total: z.number().optional(), customer: z.object({ username: z.string().optional(), email: z.string().optional() }).optional() }),
  orderStatusUpdate: z.object({ status: z.enum(['new', 'confirmed', 'delivered', 'picked_up', 'cancelled']) }),
};

export const validate = (schema) => (req, res, next) => {
  try {
    const parsed = schema.parse(req.body || {});
    req.body = parsed;
    return next();
  } catch (err) {
    const details = (err && err.errors && Array.isArray(err.errors))
      ? err.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
      : undefined;
    try { warn('Validation failed', { requestId: req && req.id ? req.id : undefined, errors: details }); } catch (e) {}
    return res.status(400).json({ success: false, message: 'Validation failed', errors: details });
  }
};

export default { schemas, validate };
