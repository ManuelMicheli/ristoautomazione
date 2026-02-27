import { z } from 'zod';

export const shoppingItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive(),
});

export const optimizeRequestSchema = z.object({
  items: z.array(shoppingItemSchema).min(1),
  desiredDeliveryDate: z.string().optional(),
});

export const generateOrdersSchema = z.object({
  orders: z.array(
    z.object({
      supplierId: z.string().uuid(),
      supplierName: z.string(),
      minimumOrderAmount: z.number().nullable(),
      items: z.array(
        z.object({
          productId: z.string().uuid(),
          productName: z.string(),
          productUnit: z.string().nullable(),
          quantity: z.number(),
          unitPrice: z.number(),
          lineTotal: z.number(),
          supplierProductId: z.string().uuid(),
        }),
      ),
      subtotal: z.number(),
      warnings: z.array(z.string()),
    }),
  ),
  locationId: z.string().uuid().optional(),
  deliveryDate: z.string().optional(),
  notes: z.string().optional(),
});

export const createTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  frequency: z.enum(['weekly', 'biweekly', 'monthly', 'custom']),
  items: z.array(shoppingItemSchema).min(1),
});

export const updateTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  frequency: z.enum(['weekly', 'biweekly', 'monthly', 'custom']).optional(),
  items: z.array(shoppingItemSchema).min(1).optional(),
});
