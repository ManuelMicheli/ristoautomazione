import { z } from 'zod';

export const createProductSchema = z.object({
  name: z.string().min(1, 'Nome prodotto obbligatorio'),
  category: z.string().optional(),
  unit: z.enum(['kg', 'lt', 'pz', 'cartone']).optional(),
  weightFormat: z.string().optional(),
  internalCode: z.string().optional(),
  allergens: z.array(z.string()).optional().default([]),
  isBio: z.boolean().optional().default(false),
  isDop: z.boolean().optional().default(false),
  isIgp: z.boolean().optional().default(false),
});

export const updateProductSchema = createProductSchema.partial();

export const linkSupplierProductSchema = z.object({
  supplierId: z.string().uuid(),
  supplierCode: z.string().optional(),
  currentPrice: z.number().positive('Prezzo deve essere positivo'),
  minQuantity: z.number().min(0).optional(),
  priceValidFrom: z.string().optional(),
  priceValidTo: z.string().optional(),
});

export const updatePriceSchema = z.object({
  currentPrice: z.number().positive(),
  minQuantity: z.number().min(0).optional(),
  priceValidFrom: z.string().optional(),
  priceValidTo: z.string().optional(),
});

export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  q: z.string().optional(),
  category: z.string().optional(),
  supplierId: z.string().uuid().optional(),
  isBio: z.coerce.boolean().optional(),
  isDop: z.coerce.boolean().optional(),
  isIgp: z.coerce.boolean().optional(),
  sortBy: z.enum(['name', 'createdAt', 'category']).optional().default('name'),
  sortDir: z.enum(['asc', 'desc']).optional().default('asc'),
});

export const confirmPriceListSchema = z.object({
  supplierId: z.string().uuid(),
  columnMapping: z.record(z.number()),
  data: z.array(z.record(z.string())),
});
