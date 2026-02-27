import { z } from 'zod';

export const createOrderSchema = z.object({
  supplierId: z.string().uuid(),
  locationId: z.string().uuid().optional(),
  lines: z.array(z.object({
    productId: z.string().uuid(),
    supplierProductId: z.string().uuid().optional(),
    quantity: z.number().positive('Quantita deve essere positiva'),
  })).min(1, 'Almeno un prodotto richiesto'),
  notes: z.string().optional(),
  isUrgent: z.boolean().optional().default(false),
  expectedDeliveryDate: z.string().optional(),
});

export const updateOrderSchema = z.object({
  notes: z.string().optional(),
  isUrgent: z.boolean().optional(),
  expectedDeliveryDate: z.string().optional(),
});

export const addOrderLineSchema = z.object({
  productId: z.string().uuid(),
  supplierProductId: z.string().uuid().optional(),
  quantity: z.number().positive(),
});

export const updateOrderLineSchema = z.object({
  quantity: z.number().positive().optional(),
  notes: z.string().optional(),
});

export const listOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  status: z.string().optional(), // comma-separated statuses
  supplierId: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  isUrgent: z.coerce.boolean().optional(),
  sortBy: z.enum(['createdAt', 'orderNumber', 'totalAmount']).optional().default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
});

export const rejectOrderSchema = z.object({
  reason: z.string().min(1, 'Motivo del rifiuto obbligatorio'),
});
