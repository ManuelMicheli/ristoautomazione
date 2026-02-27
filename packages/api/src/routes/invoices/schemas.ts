import { z } from 'zod';

export const listInvoicesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  status: z.string().optional(),
  supplierId: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export const invoiceLineSchema = z.object({
  description: z.string().optional(),
  productId: z.string().uuid().optional(),
  quantity: z.string().or(z.number().transform(String)).optional(),
  unitPrice: z.string().or(z.number().transform(String)).optional(),
  lineTotal: z.string().or(z.number().transform(String)).optional(),
  vatRate: z.string().or(z.number().transform(String)).optional(),
});

export const updateInvoiceSchema = z.object({
  supplierId: z.string().uuid().optional(),
  invoiceNumber: z.string().optional(),
  invoiceDate: z.string().optional(),
  dueDate: z.string().optional(),
  totalAmount: z.string().or(z.number().transform(String)).optional(),
  vatAmount: z.string().or(z.number().transform(String)).optional(),
  lines: z.array(invoiceLineSchema).optional(),
});

export const contestInvoiceSchema = z.object({
  notes: z.string().min(1, 'Le note di contestazione sono obbligatorie'),
});

export const markPaidSchema = z.object({
  paymentReference: z.string().min(1, 'Il riferimento di pagamento e obbligatorio'),
});

export const reconcileSchema = z.object({
  orderId: z.string().uuid().optional(),
  receivingId: z.string().uuid().optional(),
});

export const discrepancyReportQuerySchema = z.object({
  period: z.enum(['week', 'month', 'quarter', 'year']).optional().default('month'),
  supplierId: z.string().uuid().optional(),
});

export const paymentScheduleQuerySchema = z.object({
  weeksAhead: z.coerce.number().int().min(1).max(52).optional().default(8),
});
