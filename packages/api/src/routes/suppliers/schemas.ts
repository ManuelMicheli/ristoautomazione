import { z } from 'zod';

export const createSupplierContactSchema = z.object({
  name: z.string().min(1, 'Nome obbligatorio'),
  role: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Email non valida').optional().or(z.literal('')),
  isPrimary: z.boolean().optional().default(false),
});

export const createSupplierSchema = z.object({
  businessName: z.string().min(1, 'Ragione sociale obbligatoria'),
  vatNumber: z.string().optional(),
  paymentTerms: z.string().optional(),
  deliveryDays: z.array(z.number().min(0).max(6)).optional().default([]),
  leadTimeDays: z.number().int().min(0).optional(),
  minimumOrderAmount: z.number().min(0).optional(),
  notes: z.string().optional(),
  category: z
    .enum([
      'ortofrutta',
      'ittico',
      'carni',
      'latticini',
      'beverage',
      'secco',
      'non_food',
      'altro',
    ])
    .optional(),
  contacts: z.array(createSupplierContactSchema).optional().default([]),
});

export const updateSupplierSchema = z.object({
  businessName: z.string().min(1).optional(),
  vatNumber: z.string().optional(),
  paymentTerms: z.string().optional(),
  deliveryDays: z.array(z.number().min(0).max(6)).optional(),
  leadTimeDays: z.number().int().min(0).optional(),
  minimumOrderAmount: z.number().min(0).optional(),
  notes: z.string().optional(),
  category: z
    .enum([
      'ortofrutta',
      'ittico',
      'carni',
      'latticini',
      'beverage',
      'secco',
      'non_food',
      'altro',
    ])
    .optional(),
});

export const updateContactSchema = createSupplierContactSchema.partial();

export const listSuppliersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  q: z.string().optional(),
  category: z.string().optional(),
  sortBy: z
    .enum(['businessName', 'createdAt', 'category'])
    .optional()
    .default('businessName'),
  sortDir: z.enum(['asc', 'desc']).optional().default('asc'),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type CreateContactInput = z.infer<typeof createSupplierContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
export type ListSuppliersQuery = z.infer<typeof listSuppliersQuerySchema>;
