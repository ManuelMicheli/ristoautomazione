import { z } from 'zod';

export const createReceivingSchema = z.object({
  orderId: z.string().uuid('ID ordine non valido'),
});

export const updateReceivingLineSchema = z.object({
  quantityReceived: z.number().min(0, 'La quantita ricevuta non puo essere negativa'),
  isConforming: z.boolean(),
  temperature: z.number().optional(),
  notes: z.string().optional(),
});

export const createNonConformitySchema = z.object({
  type: z.enum([
    'wrong_quantity',
    'wrong_product',
    'temperature',
    'quality',
    'packaging',
    'expired',
  ]),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  description: z.string().optional(),
});

export const completeReceivingSchema = z.object({
  signatureData: z.string().min(1, 'La firma e obbligatoria'),
});

export const updateReceivingNotesSchema = z.object({
  notes: z.string().optional(),
});

export const listReceivingsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  supplierId: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  status: z.string().optional(), // comma-separated
  sortBy: z.enum(['createdAt', 'receivedAt', 'status']).optional().default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
});

export const discrepancyReportQuerySchema = z.object({
  period: z.enum(['week', 'month', 'quarter', 'year']).optional().default('month'),
  supplierId: z.string().uuid().optional(),
});
