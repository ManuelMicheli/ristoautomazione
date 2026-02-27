# Smart Shopping List Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a "Lista della Spesa Intelligente" feature where the restaurateur compiles a product list, the platform optimizes across suppliers (price + minimums + delivery + lead time), and generates draft orders split by supplier.

**Architecture:** New `shopping-list` API route + `ShoppingListService` with optimization algorithm. New `/spesa` wizard page (4 steps: input → optimize → review → confirm). New `shopping_templates` DB table for recurring lists. Reuses existing `purchaseOrders`/`orderLines` for final order generation.

**Tech Stack:** Drizzle ORM (PostgreSQL), Fastify routes, React 18 + TailwindCSS, Zod validation, existing UI components (Card, Button, SearchInput, DataTable, Modal, DatePicker, FileUpload, StatCard, EmptyState, Badge).

---

## Task 1: DB Schema — `shopping_templates` table

**Files:**
- Modify: `packages/db/src/schema/enums.ts` (add frequency enum after line 117)
- Create: `packages/db/src/schema/shopping.ts`
- Modify: `packages/db/src/schema/index.ts` (add export)

**Step 1: Add frequency enum to enums.ts**

In `packages/db/src/schema/enums.ts`, after the last enum (around line 117), add:

```typescript
export const shoppingFrequencyEnum = pgEnum('shopping_frequency', [
  'weekly',
  'biweekly',
  'monthly',
  'custom',
]);
```

**Step 2: Create shopping.ts schema file**

Create `packages/db/src/schema/shopping.ts`:

```typescript
import { pgTable, uuid, text, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { shoppingFrequencyEnum } from './enums';
import { tenants } from './tenants';
import { users } from './users';

export const shoppingTemplates = pgTable('shopping_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  name: text('name').notNull(),
  frequency: shoppingFrequencyEnum('frequency').default('weekly'),
  items: jsonb('items').notNull().$type<Array<{ productId: string; quantity: number }>>(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

export const shoppingTemplatesRelations = relations(shoppingTemplates, ({ one }) => ({
  tenant: one(tenants, {
    fields: [shoppingTemplates.tenantId],
    references: [tenants.id],
  }),
  creator: one(users, {
    fields: [shoppingTemplates.createdBy],
    references: [users.id],
  }),
}));
```

**Step 3: Export from index.ts**

In `packages/db/src/schema/index.ts`, add after the last export (line 9):

```typescript
export * from './shopping';
```

**Step 4: Verify typecheck**

Run: `pnpm --filter @cph/db exec tsc --noEmit`
Expected: no errors

**Step 5: Commit**

```bash
git add packages/db/src/schema/enums.ts packages/db/src/schema/shopping.ts packages/db/src/schema/index.ts
git commit -m "feat(db): add shopping_templates table and frequency enum"
```

---

## Task 2: Supabase Migration — create `shopping_templates` table

**Files:**
- None (uses Supabase MCP tool `apply_migration`)

**Step 1: Apply migration via Supabase**

Use the Supabase MCP `apply_migration` tool with this SQL:

```sql
-- Create shopping_frequency enum
CREATE TYPE shopping_frequency AS ENUM ('weekly', 'biweekly', 'monthly', 'custom');

-- Create shopping_templates table
CREATE TABLE shopping_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  frequency shopping_frequency DEFAULT 'weekly',
  items JSONB NOT NULL DEFAULT '[]',
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Index for tenant lookup
CREATE INDEX idx_shopping_templates_tenant ON shopping_templates(tenant_id) WHERE deleted_at IS NULL;

-- Enable RLS
ALTER TABLE shopping_templates ENABLE ROW LEVEL SECURITY;
```

**Step 2: Verify migration applied**

Use Supabase MCP `execute_sql` to verify: `SELECT count(*) FROM shopping_templates;`
Expected: count = 0 (table exists, no rows)

---

## Task 3: API — Shopping List Optimization Service

**Files:**
- Create: `packages/api/src/services/shopping-list-service.ts`

**Step 1: Create the service file with types and optimize method**

Create `packages/api/src/services/shopping-list-service.ts`:

```typescript
import { eq, and, isNull, inArray, asc } from 'drizzle-orm';
import {
  products,
  suppliers,
  supplierProducts,
  purchaseOrders,
  orderLines,
  shoppingTemplates,
} from '@cph/db';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

// ---------- Types ----------

export interface ShoppingItem {
  productId: string;
  quantity: number;
}

export interface OptimizeRequest {
  items: ShoppingItem[];
  desiredDeliveryDate?: string; // ISO date
}

export interface OptimizedLineItem {
  productId: string;
  productName: string;
  productUnit: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  supplierProductId: string;
}

export interface OptimizedOrder {
  supplierId: string;
  supplierName: string;
  minimumOrderAmount: number | null;
  items: OptimizedLineItem[];
  subtotal: number;
  warnings: string[];
}

export interface OptimizeResult {
  orders: OptimizedOrder[];
  totalAmount: number;
  totalSavings: number;
  unassignedItems: Array<{ productId: string; productName: string; reason: string }>;
}

// ---------- Service ----------

export class ShoppingListService {
  /**
   * Core optimization: assigns each item to cheapest supplier,
   * then rebalances for minimum order amounts, lead time, and delivery days.
   */
  async optimize(
    db: NodePgDatabase<any>,
    tenantId: string,
    request: OptimizeRequest,
  ): Promise<OptimizeResult> {
    const { items, desiredDeliveryDate } = request;
    const productIds = items.map((i) => i.productId);

    // 1. Fetch all active supplier-product links for requested products
    const spRows = await db
      .select({
        spId: supplierProducts.id,
        productId: supplierProducts.productId,
        supplierId: supplierProducts.supplierId,
        currentPrice: supplierProducts.currentPrice,
        supplierName: suppliers.businessName,
        minimumOrderAmount: suppliers.minimumOrderAmount,
        deliveryDays: suppliers.deliveryDays,
        leadTimeDays: suppliers.leadTimeDays,
        productName: products.name,
        productUnit: products.unit,
      })
      .from(supplierProducts)
      .innerJoin(suppliers, and(
        eq(supplierProducts.supplierId, suppliers.id),
        isNull(suppliers.deletedAt),
      ))
      .innerJoin(products, eq(supplierProducts.productId, products.id))
      .where(and(
        inArray(supplierProducts.productId, productIds),
        eq(supplierProducts.isActive, true),
        isNull(supplierProducts.deletedAt),
        eq(suppliers.tenantId, tenantId),
      ))
      .orderBy(asc(supplierProducts.currentPrice));

    // 2. Build a map: productId -> sorted supplier options
    const optionsMap = new Map<string, typeof spRows>();
    for (const row of spRows) {
      const existing = optionsMap.get(row.productId) ?? [];
      existing.push(row);
      optionsMap.set(row.productId, existing);
    }

    // 3. Filter suppliers by delivery constraints if date specified
    let excludedSupplierIds = new Set<string>();
    if (desiredDeliveryDate) {
      const deliveryDate = new Date(desiredDeliveryDate);
      const today = new Date();
      const daysUntilDelivery = Math.ceil(
        (deliveryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );
      const deliveryDayOfWeek = deliveryDate.getDay(); // 0=Sun, 1=Mon...

      // Check each supplier
      const allSupplierIds = new Set(spRows.map((r) => r.supplierId));
      for (const sid of allSupplierIds) {
        const sample = spRows.find((r) => r.supplierId === sid)!;
        const lead = sample.leadTimeDays ?? 0;
        const days = (sample.deliveryDays as number[]) ?? [];

        if (lead > daysUntilDelivery) {
          excludedSupplierIds.add(sid);
          continue;
        }
        if (days.length > 0 && !days.includes(deliveryDayOfWeek)) {
          excludedSupplierIds.add(sid);
        }
      }
    }

    // 4. Initial assignment: cheapest supplier per product
    const assignments = new Map<string, {
      supplierId: string;
      supplierName: string;
      minimumOrderAmount: number | null;
      spId: string;
      productId: string;
      productName: string;
      productUnit: string | null;
      quantity: number;
      unitPrice: number;
    }>();

    const unassigned: OptimizeResult['unassignedItems'] = [];

    for (const item of items) {
      const options = (optionsMap.get(item.productId) ?? [])
        .filter((o) => !excludedSupplierIds.has(o.supplierId));

      if (options.length === 0) {
        // Try without delivery filter for name
        const anyOption = optionsMap.get(item.productId);
        const name = anyOption?.[0]?.productName ?? item.productId;
        unassigned.push({
          productId: item.productId,
          productName: name,
          reason: options.length === 0 && excludedSupplierIds.size > 0
            ? 'Nessun fornitore disponibile per la data richiesta'
            : 'Nessun fornitore ha questo prodotto a catalogo',
        });
        continue;
      }

      const best = options[0]!;
      assignments.set(item.productId, {
        supplierId: best.supplierId,
        supplierName: best.supplierName,
        minimumOrderAmount: best.minimumOrderAmount ? parseFloat(best.minimumOrderAmount as any) : null,
        spId: best.spId,
        productId: best.productId,
        productName: best.productName,
        productUnit: best.productUnit,
        quantity: item.quantity,
        unitPrice: parseFloat(best.currentPrice as any),
      });
    }

    // 5. Build virtual orders per supplier
    const buildOrders = (): Map<string, OptimizedOrder> => {
      const orderMap = new Map<string, OptimizedOrder>();
      for (const a of assignments.values()) {
        let order = orderMap.get(a.supplierId);
        if (!order) {
          order = {
            supplierId: a.supplierId,
            supplierName: a.supplierName,
            minimumOrderAmount: a.minimumOrderAmount,
            items: [],
            subtotal: 0,
            warnings: [],
          };
          orderMap.set(a.supplierId, order);
        }
        const lineTotal = Math.round(a.quantity * a.unitPrice * 100) / 100;
        order.items.push({
          productId: a.productId,
          productName: a.productName,
          productUnit: a.productUnit,
          quantity: a.quantity,
          unitPrice: a.unitPrice,
          lineTotal,
          supplierProductId: a.spId,
        });
        order.subtotal = Math.round((order.subtotal + lineTotal) * 100) / 100;
      }
      return orderMap;
    };

    // 6. Rebalance for minimum order amounts
    let orderMap = buildOrders();

    for (const [supplierId, order] of orderMap) {
      if (order.minimumOrderAmount && order.subtotal < order.minimumOrderAmount) {
        const gap = order.minimumOrderAmount - order.subtotal;

        // Try to pull items from other suppliers if this supplier sells them cheaper or within gap
        let moved = false;
        for (const [otherSupplierId, otherOrder] of orderMap) {
          if (otherSupplierId === supplierId) continue;

          for (const otherItem of otherOrder.items) {
            // Does this supplier also sell this product?
            const altOptions = (optionsMap.get(otherItem.productId) ?? [])
              .filter((o) => o.supplierId === supplierId && !excludedSupplierIds.has(o.supplierId));

            if (altOptions.length === 0) continue;

            const altPrice = parseFloat(altOptions[0]!.currentPrice as any);
            const priceDiff = (altPrice - otherItem.unitPrice) * otherItem.quantity;

            // Move if the extra cost is less than the gap penalty
            if (priceDiff < gap * 0.5) {
              assignments.set(otherItem.productId, {
                supplierId,
                supplierName: order.supplierName,
                minimumOrderAmount: order.minimumOrderAmount,
                spId: altOptions[0]!.spId,
                productId: otherItem.productId,
                productName: otherItem.productName,
                productUnit: otherItem.productUnit,
                quantity: otherItem.quantity,
                unitPrice: altPrice,
              });
              moved = true;
              break;
            }
          }
          if (moved) break;
        }

        // Rebuild after moves
        if (moved) {
          orderMap = buildOrders();
        }
      }
    }

    // 7. Add warnings for remaining under-minimum orders
    for (const order of orderMap.values()) {
      if (order.minimumOrderAmount && order.subtotal < order.minimumOrderAmount) {
        order.warnings.push(
          `Ordine sotto il minimo di €${order.minimumOrderAmount.toFixed(2)} (mancano €${(order.minimumOrderAmount - order.subtotal).toFixed(2)})`,
        );
      }
    }

    // 8. Calculate savings (vs worst-case: most expensive supplier for each item)
    let worstCaseTotal = 0;
    for (const item of items) {
      const options = optionsMap.get(item.productId) ?? [];
      if (options.length > 0) {
        const worstPrice = parseFloat(options[options.length - 1]!.currentPrice as any);
        worstCaseTotal += worstPrice * item.quantity;
      }
    }

    const totalAmount = Array.from(orderMap.values()).reduce((s, o) => s + o.subtotal, 0);
    const totalSavings = Math.round((worstCaseTotal - totalAmount) * 100) / 100;

    return {
      orders: Array.from(orderMap.values()).filter((o) => o.items.length > 0),
      totalAmount: Math.round(totalAmount * 100) / 100,
      totalSavings: Math.max(0, totalSavings),
      unassignedItems: unassigned,
    };
  }

  /**
   * Generate draft purchase orders from an optimized result.
   */
  async generateOrders(
    db: NodePgDatabase<any>,
    tenantId: string,
    userId: string,
    locationId: string,
    optimizedOrders: OptimizedOrder[],
    deliveryDate?: string,
    notes?: string,
  ): Promise<string[]> {
    const orderIds: string[] = [];

    await db.transaction(async (tx) => {
      for (const opt of optimizedOrders) {
        const [order] = await tx
          .insert(purchaseOrders)
          .values({
            tenantId,
            locationId,
            supplierId: opt.supplierId,
            status: 'draft',
            totalAmount: opt.subtotal.toFixed(2),
            notes: notes ?? 'Generato da Lista della Spesa',
            expectedDeliveryDate: deliveryDate ?? null,
            isUrgent: false,
            isRecurringTemplate: false,
            createdBy: userId,
          })
          .returning();
        if (!order) throw new Error('Failed to create order');

        for (const item of opt.items) {
          await tx.insert(orderLines).values({
            orderId: order.id,
            productId: item.productId,
            supplierProductId: item.supplierProductId,
            quantity: item.quantity.toFixed(3),
            unitPrice: item.unitPrice.toFixed(4),
            lineTotal: item.lineTotal.toFixed(2),
          });
        }

        orderIds.push(order.id);
      }
    });

    return orderIds;
  }

  // ---------- Templates CRUD ----------

  async listTemplates(db: NodePgDatabase<any>, tenantId: string) {
    return db
      .select()
      .from(shoppingTemplates)
      .where(and(
        eq(shoppingTemplates.tenantId, tenantId),
        isNull(shoppingTemplates.deletedAt),
      ));
  }

  async createTemplate(
    db: NodePgDatabase<any>,
    tenantId: string,
    userId: string,
    data: { name: string; frequency: string; items: ShoppingItem[] },
  ) {
    const [template] = await db
      .insert(shoppingTemplates)
      .values({
        tenantId,
        name: data.name,
        frequency: data.frequency as any,
        items: data.items,
        createdBy: userId,
      })
      .returning();
    return template;
  }

  async updateTemplate(
    db: NodePgDatabase<any>,
    templateId: string,
    data: { name?: string; frequency?: string; items?: ShoppingItem[] },
  ) {
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (data.name) updates.name = data.name;
    if (data.frequency) updates.frequency = data.frequency;
    if (data.items) updates.items = data.items;

    const [updated] = await db
      .update(shoppingTemplates)
      .set(updates)
      .where(eq(shoppingTemplates.id, templateId))
      .returning();
    return updated;
  }

  async deleteTemplate(db: NodePgDatabase<any>, templateId: string) {
    await db
      .update(shoppingTemplates)
      .set({ deletedAt: new Date() })
      .where(eq(shoppingTemplates.id, templateId));
  }

  async getTemplate(db: NodePgDatabase<any>, templateId: string) {
    const [template] = await db
      .select()
      .from(shoppingTemplates)
      .where(and(
        eq(shoppingTemplates.id, templateId),
        isNull(shoppingTemplates.deletedAt),
      ));
    return template;
  }

  /**
   * Parse a CSV shopping list (product name/code + quantity).
   * Returns items matched to product IDs.
   */
  async parseCSV(
    db: NodePgDatabase<any>,
    tenantId: string,
    csvContent: string,
  ): Promise<{
    matched: ShoppingItem[];
    unmatched: Array<{ row: number; name: string; quantity: number }>;
  }> {
    const lines = csvContent.trim().split('\n');
    const delimiter = lines[0]?.includes(';') ? ';' : ',';

    const matched: ShoppingItem[] = [];
    const unmatched: Array<{ row: number; name: string; quantity: number }> = [];

    // Fetch all products for this tenant
    const allProducts = await db
      .select({ id: products.id, name: products.name, internalCode: products.internalCode })
      .from(products)
      .where(and(eq(products.tenantId, tenantId), isNull(products.deletedAt)));

    const nameMap = new Map(allProducts.map((p) => [p.name.toLowerCase(), p.id]));
    const codeMap = new Map(
      allProducts.filter((p) => p.internalCode).map((p) => [p.internalCode!.toLowerCase(), p.id]),
    );

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i]!.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ''));
      if (cols.length < 2) continue;

      const nameOrCode = cols[0]!;
      const quantity = parseFloat(cols[1]!);
      if (isNaN(quantity) || quantity <= 0) continue;

      // Try match by code first, then by name (case insensitive)
      const productId =
        codeMap.get(nameOrCode.toLowerCase()) ??
        nameMap.get(nameOrCode.toLowerCase());

      if (productId) {
        matched.push({ productId, quantity });
      } else {
        unmatched.push({ row: i + 1, name: nameOrCode, quantity });
      }
    }

    return { matched, unmatched };
  }
}
```

**Step 2: Verify typecheck**

Run: `pnpm --filter @cph/api exec tsc --noEmit`
Expected: no errors

**Step 3: Commit**

```bash
git add packages/api/src/services/shopping-list-service.ts
git commit -m "feat(api): add ShoppingListService with optimization algorithm"
```

---

## Task 4: API — Shopping List Zod Schemas

**Files:**
- Create: `packages/api/src/routes/shopping-list/schemas.ts`

**Step 1: Create schemas file**

Create `packages/api/src/routes/shopping-list/schemas.ts`:

```typescript
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
  orders: z.array(z.object({
    supplierId: z.string().uuid(),
    supplierName: z.string(),
    minimumOrderAmount: z.number().nullable(),
    items: z.array(z.object({
      productId: z.string().uuid(),
      productName: z.string(),
      productUnit: z.string().nullable(),
      quantity: z.number(),
      unitPrice: z.number(),
      lineTotal: z.number(),
      supplierProductId: z.string().uuid(),
    })),
    subtotal: z.number(),
    warnings: z.array(z.string()),
  })),
  locationId: z.string().uuid(),
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
```

**Step 2: Commit**

```bash
git add packages/api/src/routes/shopping-list/schemas.ts
git commit -m "feat(api): add Zod schemas for shopping list endpoints"
```

---

## Task 5: API — Shopping List Routes

**Files:**
- Create: `packages/api/src/routes/shopping-list/index.ts`
- Modify: `packages/api/src/index.ts` (register route, around line 71)

**Step 1: Create the route file**

Create `packages/api/src/routes/shopping-list/index.ts`:

```typescript
import { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/require-permission';
import { ShoppingListService } from '../../services/shopping-list-service';
import {
  optimizeRequestSchema,
  generateOrdersSchema,
  createTemplateSchema,
  updateTemplateSchema,
} from './schemas';

const service = new ShoppingListService();

export async function shoppingListRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // POST /shopping-list/optimize
  app.post('/optimize', {
    preHandler: [requirePermission('orders', 'create')],
    handler: async (request, reply) => {
      const body = optimizeRequestSchema.parse(request.body);
      const user = request.user!;

      const result = await service.optimize(app.db, user.tenantId, body);
      return reply.send({ data: result });
    },
  });

  // POST /shopping-list/generate-orders
  app.post('/generate-orders', {
    preHandler: [requirePermission('orders', 'create')],
    handler: async (request, reply) => {
      const body = generateOrdersSchema.parse(request.body);
      const user = request.user!;

      const orderIds = await service.generateOrders(
        app.db,
        user.tenantId,
        user.id,
        body.locationId,
        body.orders,
        body.deliveryDate,
        body.notes,
      );

      return reply.code(201).send({ data: { orderIds } });
    },
  });

  // POST /shopping-list/from-csv
  app.post('/from-csv', {
    preHandler: [requirePermission('orders', 'create')],
    handler: async (request, reply) => {
      const data = await request.file();
      if (!data) return reply.code(400).send({ error: 'Nessun file caricato' });

      const buffer = await data.toBuffer();
      const csvContent = buffer.toString('utf-8');
      const user = request.user!;

      const result = await service.parseCSV(app.db, user.tenantId, csvContent);
      return reply.send({ data: result });
    },
  });

  // ---------- Templates ----------

  // GET /shopping-list/templates
  app.get('/templates', {
    handler: async (request, reply) => {
      const user = request.user!;
      const templates = await service.listTemplates(app.db, user.tenantId);
      return reply.send({ data: templates });
    },
  });

  // POST /shopping-list/templates
  app.post('/templates', {
    handler: async (request, reply) => {
      const body = createTemplateSchema.parse(request.body);
      const user = request.user!;
      const template = await service.createTemplate(app.db, user.tenantId, user.id, body);
      return reply.code(201).send({ data: template });
    },
  });

  // PUT /shopping-list/templates/:id
  app.put('/templates/:id', {
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = updateTemplateSchema.parse(request.body);
      const template = await service.updateTemplate(app.db, id, body);
      return reply.send({ data: template });
    },
  });

  // DELETE /shopping-list/templates/:id
  app.delete('/templates/:id', {
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      await service.deleteTemplate(app.db, id);
      return reply.code(204).send();
    },
  });

  // POST /shopping-list/templates/:id/launch
  app.post('/templates/:id/launch', {
    preHandler: [requirePermission('orders', 'create')],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = request.user!;
      const template = await service.getTemplate(app.db, id);
      if (!template) return reply.code(404).send({ error: 'Template non trovato' });

      const body = request.body as { desiredDeliveryDate?: string } | undefined;

      const result = await service.optimize(app.db, user.tenantId, {
        items: template.items as Array<{ productId: string; quantity: number }>,
        desiredDeliveryDate: body?.desiredDeliveryDate,
      });

      return reply.send({ data: { template, optimization: result } });
    },
  });
}
```

**Step 2: Register route in index.ts**

In `packages/api/src/index.ts`, add the import at the top with the other route imports:

```typescript
import { shoppingListRoutes } from './routes/shopping-list';
```

Then inside the route registration block (after line 71, the analytics line), add:

```typescript
  await api.register(shoppingListRoutes, { prefix: '/shopping-list' });
```

**Step 3: Verify typecheck**

Run: `pnpm --filter @cph/api exec tsc --noEmit`
Expected: no errors

**Step 4: Commit**

```bash
git add packages/api/src/routes/shopping-list/ packages/api/src/index.ts
git commit -m "feat(api): add shopping-list routes with optimize, CSV, templates"
```

---

## Task 6: Web — Shopping List Page (Wizard)

**Files:**
- Create: `packages/web/src/pages/shopping/ShoppingListPage.tsx`
- Modify: `packages/web/src/App.tsx` (add route + lazy import)

This is the largest task. The page is a 4-step wizard:
1. **Input** — search products + add quantities, OR upload CSV
2. **Optimize** — loading state, calls API
3. **Review** — shows optimized orders by supplier, totals, savings, warnings
4. **Confirm** — generates orders, shows success

**Step 1: Create the ShoppingListPage**

Create `packages/web/src/pages/shopping/ShoppingListPage.tsx`:

```tsx
import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Badge,
  Button,
  Card,
  DatePicker,
  EmptyState,
  FileUpload,
  Input,
  Modal,
  SearchInput,
  StatCard,
  TextArea,
  useToast,
} from '@/components/ui';
import { apiClient } from '@/services/api-client';
import {
  ShoppingCart,
  Upload,
  Sparkles,
  CheckCircle,
  AlertTriangle,
  Trash2,
  Plus,
  Minus,
  TrendingDown,
  Package,
  Truck,
  FileText,
  ChevronRight,
  ChevronLeft,
  Save,
} from 'lucide-react';

// ---------- Types ----------

interface ShoppingItem {
  productId: string;
  productName: string;
  productUnit: string | null;
  category: string | null;
  quantity: number;
  priceRange?: { min: number; max: number };
}

interface OptimizedLineItem {
  productId: string;
  productName: string;
  productUnit: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  supplierProductId: string;
}

interface OptimizedOrder {
  supplierId: string;
  supplierName: string;
  minimumOrderAmount: number | null;
  items: OptimizedLineItem[];
  subtotal: number;
  warnings: string[];
}

interface OptimizeResult {
  orders: OptimizedOrder[];
  totalAmount: number;
  totalSavings: number;
  unassignedItems: Array<{ productId: string; productName: string; reason: string }>;
}

// ---------- Steps ----------

const STEPS = [
  { num: 1, label: 'Lista', icon: ShoppingCart },
  { num: 2, label: 'Ottimizzazione', icon: Sparkles },
  { num: 3, label: 'Riepilogo', icon: FileText },
  { num: 4, label: 'Conferma', icon: CheckCircle },
];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        const isActive = s.num === current;
        const isDone = s.num < current;
        return (
          <React.Fragment key={s.num}>
            {i > 0 && (
              <div className={`h-px w-8 ${isDone ? 'bg-green-500' : 'bg-slate-700'}`} />
            )}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              isActive ? 'bg-green-500/20 text-green-400 ring-1 ring-green-500/50' :
              isDone ? 'bg-green-500/10 text-green-500' :
              'bg-slate-800 text-slate-500'
            }`}>
              <Icon size={16} />
              <span className="hidden sm:inline">{s.label}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ---------- Main Page ----------

export default function ShoppingListPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  // Wizard state
  const [step, setStep] = useState(1);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [deliveryDate, setDeliveryDate] = useState<Date | null>(null);
  const [notes, setNotes] = useState('');
  const [optimizeResult, setOptimizeResult] = useState<OptimizeResult | null>(null);
  const [createdOrderIds, setCreatedOrderIds] = useState<string[]>([]);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateFrequency, setTemplateFrequency] = useState('weekly');
  const [inputMode, setInputMode] = useState<'search' | 'csv'>('search');

  // Product search query
  const { data: searchResults } = useQuery({
    queryKey: ['products-search', productSearch],
    queryFn: () => apiClient.get<any>('/products', { q: productSearch, pageSize: 20 }),
    enabled: productSearch.length >= 2,
  });

  // Optimize mutation
  const optimizeMutation = useMutation({
    mutationFn: (data: { items: Array<{ productId: string; quantity: number }>; desiredDeliveryDate?: string }) =>
      apiClient.post<OptimizeResult>('/shopping-list/optimize', data),
    onSuccess: (res) => {
      setOptimizeResult(res.data);
      setStep(3);
    },
    onError: () => {
      toast({ title: 'Errore durante l\'ottimizzazione', variant: 'destructive' });
    },
  });

  // Generate orders mutation
  const generateMutation = useMutation({
    mutationFn: (data: any) => apiClient.post<{ orderIds: string[] }>('/shopping-list/generate-orders', data),
    onSuccess: (res) => {
      setCreatedOrderIds(res.data.orderIds);
      setStep(4);
    },
    onError: () => {
      toast({ title: 'Errore nella creazione degli ordini', variant: 'destructive' });
    },
  });

  // CSV upload mutation
  const csvMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiClient.upload<{ matched: Array<{ productId: string; quantity: number }>; unmatched: any[] }>('/shopping-list/from-csv', formData);
    },
    onSuccess: async (res) => {
      // Enrich matched items with product info
      const enriched: ShoppingItem[] = [];
      for (const m of res.data.matched) {
        const prod = await apiClient.get<any>(`/products/${m.productId}`);
        enriched.push({
          productId: m.productId,
          productName: prod.data.name,
          productUnit: prod.data.unit,
          category: prod.data.category,
          quantity: m.quantity,
        });
      }
      setItems((prev) => [...prev, ...enriched]);

      if (res.data.unmatched.length > 0) {
        toast({
          title: `${res.data.unmatched.length} prodotti non trovati nel catalogo`,
          variant: 'warning',
        });
      }
      toast({ title: `${res.data.matched.length} prodotti aggiunti dalla lista` });
    },
  });

  // Save template mutation
  const saveTemplateMutation = useMutation({
    mutationFn: (data: { name: string; frequency: string; items: Array<{ productId: string; quantity: number }> }) =>
      apiClient.post('/shopping-list/templates', data),
    onSuccess: () => {
      setShowSaveTemplate(false);
      toast({ title: 'Template salvato' });
    },
  });

  // ---------- Handlers ----------

  const addItem = useCallback((product: any) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [...prev, {
        productId: product.id,
        productName: product.name,
        productUnit: product.unit,
        category: product.category,
        quantity: 1,
        priceRange: product.bestPrice ? { min: product.bestPrice, max: product.bestPrice } : undefined,
      }];
    });
    setProductSearch('');
  }, []);

  const updateQuantity = useCallback((productId: string, delta: number) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.productId !== productId) return i;
        const newQty = Math.max(0, i.quantity + delta);
        return { ...i, quantity: newQty };
      }).filter((i) => i.quantity > 0),
    );
  }, []);

  const removeItem = useCallback((productId: string) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  }, []);

  const handleOptimize = () => {
    setStep(2);
    optimizeMutation.mutate({
      items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      desiredDeliveryDate: deliveryDate?.toISOString().split('T')[0],
    });
  };

  const handleGenerate = () => {
    if (!optimizeResult) return;
    generateMutation.mutate({
      orders: optimizeResult.orders,
      locationId: undefined, // Will use default location
      deliveryDate: deliveryDate?.toISOString().split('T')[0],
      notes,
    });
  };

  const handleSaveTemplate = () => {
    saveTemplateMutation.mutate({
      name: templateName,
      frequency: templateFrequency,
      items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
    });
  };

  // ---------- Render ----------

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Lista della Spesa</h1>
          <p className="text-slate-400 mt-1">
            Aggiungi i prodotti, la piattaforma trova i prezzi migliori
          </p>
        </div>
      </div>

      <StepIndicator current={step} />

      <AnimatePresence mode="wait">
        {/* ---- STEP 1: Input ---- */}
        {step === 1 && (
          <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            {/* Input mode toggle */}
            <div className="flex gap-2 mb-4">
              <Button
                variant={inputMode === 'search' ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setInputMode('search')}
              >
                <SearchInput className="w-4 h-4 mr-1" /> Cerca prodotti
              </Button>
              <Button
                variant={inputMode === 'csv' ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setInputMode('csv')}
              >
                <Upload size={16} className="mr-1" /> Carica CSV
              </Button>
            </div>

            {inputMode === 'search' ? (
              /* Search input */
              <Card className="p-4 mb-4">
                <SearchInput
                  value={productSearch}
                  onChange={setProductSearch}
                  placeholder="Cerca prodotto per nome o codice..."
                />
                {searchResults?.data?.items && productSearch.length >= 2 && (
                  <div className="mt-2 max-h-60 overflow-y-auto divide-y divide-slate-800">
                    {searchResults.data.items.map((p: any) => (
                      <button
                        key={p.id}
                        onClick={() => addItem(p)}
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-800/50 rounded transition-colors text-left"
                      >
                        <div>
                          <span className="text-white font-medium">{p.name}</span>
                          {p.category && (
                            <Badge variant="outline" className="ml-2 text-xs">{p.category}</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          {p.bestPrice && (
                            <span className="text-green-400">€{p.bestPrice.toFixed(2)}/{p.unit}</span>
                          )}
                          <Plus size={16} className="text-slate-400" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </Card>
            ) : (
              /* CSV upload */
              <Card className="p-4 mb-4">
                <p className="text-sm text-slate-400 mb-3">
                  Carica un file CSV con colonne: nome prodotto (o codice), quantità
                </p>
                <FileUpload
                  accept=".csv,.txt"
                  onUpload={(files) => files[0] && csvMutation.mutate(files[0])}
                  loading={csvMutation.isPending}
                />
              </Card>
            )}

            {/* Current list */}
            {items.length > 0 ? (
              <Card className="divide-y divide-slate-800">
                <div className="px-4 py-3 flex items-center justify-between">
                  <h3 className="font-semibold text-white">
                    <ShoppingCart size={18} className="inline mr-2" />
                    {items.length} prodotti nella lista
                  </h3>
                  <Button variant="ghost" size="sm" onClick={() => setShowSaveTemplate(true)}>
                    <Save size={14} className="mr-1" /> Salva template
                  </Button>
                </div>
                {items.map((item) => (
                  <div key={item.productId} className="px-4 py-3 flex items-center justify-between">
                    <div className="flex-1">
                      <span className="text-white">{item.productName}</span>
                      {item.category && (
                        <Badge variant="outline" className="ml-2 text-xs">{item.category}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => updateQuantity(item.productId, -1)}
                          className="p-1 rounded hover:bg-slate-700 text-slate-400"
                        >
                          <Minus size={14} />
                        </button>
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val) && val > 0) {
                              setItems((prev) =>
                                prev.map((i) =>
                                  i.productId === item.productId ? { ...i, quantity: val } : i,
                                ),
                              );
                            }
                          }}
                          className="w-20 text-center"
                        />
                        <button
                          onClick={() => updateQuantity(item.productId, 1)}
                          className="p-1 rounded hover:bg-slate-700 text-slate-400"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <span className="text-xs text-slate-500 w-8">{item.productUnit ?? ''}</span>
                      <button
                        onClick={() => removeItem(item.productId)}
                        className="p-1 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </Card>
            ) : (
              <EmptyState
                icon={<ShoppingCart size={48} />}
                title="Lista vuota"
                description="Cerca un prodotto o carica un CSV per iniziare"
              />
            )}

            {/* Delivery date + Optimize button */}
            {items.length > 0 && (
              <div className="mt-6 flex items-end justify-between gap-4">
                <div className="flex-1 max-w-xs">
                  <label className="block text-sm text-slate-400 mb-1">
                    <Truck size={14} className="inline mr-1" />
                    Data consegna desiderata (opzionale)
                  </label>
                  <DatePicker value={deliveryDate} onChange={setDeliveryDate} />
                </div>
                <Button onClick={handleOptimize} size="lg">
                  <Sparkles size={18} className="mr-2" />
                  Ottimizza ({items.length} prodotti)
                </Button>
              </div>
            )}
          </motion.div>
        )}

        {/* ---- STEP 2: Optimizing ---- */}
        {step === 2 && (
          <motion.div key="step2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-20"
          >
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mb-4" />
            <p className="text-white text-lg font-medium">Ottimizzazione in corso...</p>
            <p className="text-slate-400 mt-1">
              Analizzo {items.length} prodotti tra tutti i fornitori
            </p>
          </motion.div>
        )}

        {/* ---- STEP 3: Review ---- */}
        {step === 3 && optimizeResult && (
          <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            {/* Summary stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <StatCard
                title="Totale Spesa"
                value={`€${optimizeResult.totalAmount.toFixed(2)}`}
                icon={<Package size={20} />}
              />
              <StatCard
                title="Risparmio"
                value={`€${optimizeResult.totalSavings.toFixed(2)}`}
                icon={<TrendingDown size={20} />}
                trend={optimizeResult.totalSavings > 0 ? 'up' : undefined}
              />
              <StatCard
                title="Fornitori"
                value={String(optimizeResult.orders.length)}
                icon={<Truck size={20} />}
              />
            </div>

            {/* Unassigned items warning */}
            {optimizeResult.unassignedItems.length > 0 && (
              <Card className="p-4 mb-4 border-amber-500/30 bg-amber-500/5">
                <h4 className="text-amber-400 font-medium flex items-center gap-2">
                  <AlertTriangle size={16} />
                  {optimizeResult.unassignedItems.length} prodotti non assegnabili
                </h4>
                <ul className="mt-2 space-y-1">
                  {optimizeResult.unassignedItems.map((u) => (
                    <li key={u.productId} className="text-sm text-slate-400">
                      <span className="text-white">{u.productName}</span> — {u.reason}
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {/* Orders by supplier */}
            <div className="space-y-4">
              {optimizeResult.orders.map((order) => (
                <Card key={order.supplierId} className="overflow-hidden">
                  <div className="px-4 py-3 bg-slate-800/50 flex items-center justify-between">
                    <div>
                      <h3 className="text-white font-semibold">{order.supplierName}</h3>
                      <span className="text-sm text-slate-400">
                        {order.items.length} prodotti
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-bold text-white">
                        €{order.subtotal.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {order.warnings.length > 0 && (
                    <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20">
                      {order.warnings.map((w, i) => (
                        <p key={i} className="text-sm text-amber-400 flex items-center gap-1">
                          <AlertTriangle size={12} /> {w}
                        </p>
                      ))}
                    </div>
                  )}

                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-slate-500 border-b border-slate-800">
                        <th className="px-4 py-2 text-left">Prodotto</th>
                        <th className="px-4 py-2 text-right">Qtà</th>
                        <th className="px-4 py-2 text-right">Prezzo</th>
                        <th className="px-4 py-2 text-right">Totale</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {order.items.map((item) => (
                        <tr key={item.productId}>
                          <td className="px-4 py-2 text-white">{item.productName}</td>
                          <td className="px-4 py-2 text-right text-slate-300">
                            {item.quantity} {item.productUnit ?? ''}
                          </td>
                          <td className="px-4 py-2 text-right text-slate-300">
                            €{item.unitPrice.toFixed(2)}
                          </td>
                          <td className="px-4 py-2 text-right text-white font-medium">
                            €{item.lineTotal.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              ))}
            </div>

            {/* Notes + actions */}
            <div className="mt-6">
              <label className="block text-sm text-slate-400 mb-1">Note (opzionali)</label>
              <TextArea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Note per gli ordini..."
                rows={2}
              />
            </div>

            <div className="mt-6 flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>
                <ChevronLeft size={16} className="mr-1" /> Modifica lista
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowSaveTemplate(true)}>
                  <Save size={16} className="mr-1" /> Salva template
                </Button>
                <Button onClick={handleGenerate} disabled={generateMutation.isPending}>
                  <CheckCircle size={16} className="mr-1" />
                  Genera {optimizeResult.orders.length} ordini
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ---- STEP 4: Confirmation ---- */}
        {step === 4 && (
          <motion.div key="step4" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="text-center py-16"
          >
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20 text-green-400 mb-4">
              <CheckCircle size={32} />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Ordini creati!</h2>
            <p className="text-slate-400 mb-6">
              {createdOrderIds.length} ordini in bozza pronti per essere inviati
            </p>
            <div className="flex justify-center gap-3">
              <Button variant="outline" onClick={() => navigate('/orders')}>
                Vai agli Ordini
              </Button>
              <Button onClick={() => {
                setStep(1);
                setItems([]);
                setOptimizeResult(null);
                setCreatedOrderIds([]);
                setNotes('');
              }}>
                Nuova Lista
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Save Template Modal */}
      <Modal
        isOpen={showSaveTemplate}
        onClose={() => setShowSaveTemplate(false)}
        title="Salva come Template"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Nome template</label>
            <Input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="es. Ordine settimanale cucina"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Frequenza</label>
            <select
              value={templateFrequency}
              onChange={(e) => setTemplateFrequency(e.target.value)}
              className="w-full rounded-lg bg-slate-800 border-slate-700 text-white px-3 py-2"
            >
              <option value="weekly">Settimanale</option>
              <option value="biweekly">Bisettimanale</option>
              <option value="monthly">Mensile</option>
              <option value="custom">Personalizzata</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowSaveTemplate(false)}>Annulla</Button>
            <Button
              onClick={handleSaveTemplate}
              disabled={!templateName || saveTemplateMutation.isPending}
            >
              Salva
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
```

**Step 2: Register route in App.tsx**

In `packages/web/src/App.tsx`, add lazy import after the other imports (around line 98):

```typescript
const ShoppingListPage = React.lazy(() => import('@/pages/shopping/ShoppingListPage'));
const ShoppingTemplatesPage = React.lazy(() => import('@/pages/shopping/ShoppingTemplatesPage'));
```

Add route inside the `<Route path="/" element={<AppLayout />}>` block (after orders routes, around line 147):

```tsx
<Route path="spesa" element={<ShoppingListPage />} />
<Route path="spesa/templates" element={<ShoppingTemplatesPage />} />
```

**Step 3: Verify build**

Run: `pnpm --filter @cph/web run build`
Expected: build succeeds (ShoppingTemplatesPage will be created in next task)

**Step 4: Commit**

```bash
git add packages/web/src/pages/shopping/ShoppingListPage.tsx packages/web/src/App.tsx
git commit -m "feat(web): add Shopping List wizard page with 4-step flow"
```

---

## Task 7: Web — Shopping Templates Page

**Files:**
- Create: `packages/web/src/pages/shopping/ShoppingTemplatesPage.tsx`

**Step 1: Create the templates page**

Create `packages/web/src/pages/shopping/ShoppingTemplatesPage.tsx`:

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  Badge,
  Modal,
  EmptyState,
  useToast,
} from '@/components/ui';
import { apiClient } from '@/services/api-client';
import {
  FileText,
  Play,
  Trash2,
  Clock,
  ShoppingCart,
  Plus,
} from 'lucide-react';

interface Template {
  id: string;
  name: string;
  frequency: string;
  items: Array<{ productId: string; quantity: number }>;
  createdAt: string;
}

const FREQ_LABELS: Record<string, string> = {
  weekly: 'Settimanale',
  biweekly: 'Bisettimanale',
  monthly: 'Mensile',
  custom: 'Personalizzata',
};

export default function ShoppingTemplatesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['shopping-templates'],
    queryFn: () => apiClient.get<Template[]>('/shopping-list/templates'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.del(`/shopping-list/templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shopping-templates'] });
      setDeleteId(null);
      toast({ title: 'Template eliminato' });
    },
  });

  const templates = data?.data ?? [];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Template Ordini</h1>
          <p className="text-slate-400 mt-1">
            I tuoi ordini ricorrenti salvati
          </p>
        </div>
        <Button onClick={() => navigate('/spesa')}>
          <Plus size={16} className="mr-1" /> Nuova Lista
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-20 animate-pulse bg-slate-800/50" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={<FileText size={48} />}
          title="Nessun template"
          description="Crea una lista della spesa e salvala come template per riutilizzarla"
        />
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <Card key={t.id} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-slate-800">
                  <ShoppingCart size={20} className="text-green-400" />
                </div>
                <div>
                  <h3 className="text-white font-semibold">{t.name}</h3>
                  <div className="flex items-center gap-3 mt-1 text-sm text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock size={12} /> {FREQ_LABELS[t.frequency] ?? t.frequency}
                    </span>
                    <span>{t.items.length} prodotti</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    // Navigate to shopping list with template items preloaded
                    navigate('/spesa', { state: { templateId: t.id, items: t.items } });
                  }}
                >
                  <Play size={14} className="mr-1" /> Lancia ordine
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteId(t.id)}
                >
                  <Trash2 size={14} className="text-slate-500" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <Modal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Elimina template"
      >
        <p className="text-slate-300 mb-4">Sei sicuro di voler eliminare questo template?</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleteId(null)}>Annulla</Button>
          <Button
            variant="destructive"
            onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            disabled={deleteMutation.isPending}
          >
            Elimina
          </Button>
        </div>
      </Modal>
    </div>
  );
}
```

**Step 2: Verify build**

Run: `pnpm --filter @cph/web run build`
Expected: build succeeds

**Step 3: Commit**

```bash
git add packages/web/src/pages/shopping/ShoppingTemplatesPage.tsx
git commit -m "feat(web): add Shopping Templates page with launch/delete"
```

---

## Task 8: Web — Add Sidebar Navigation for "Spesa"

**Files:**
- Modify: `packages/web/src/components/layout/Sidebar.tsx` (add navigation items)

**Step 1: Find the sidebar nav items and add "Spesa" section**

Look for the navigation items array in `Sidebar.tsx`. Add after the "Ordini" section:

```typescript
{ label: 'Lista della Spesa', path: '/spesa', icon: ShoppingCart },
{ label: 'Template Ordini', path: '/spesa/templates', icon: FileText },
```

Import `ShoppingCart` and `FileText` from `lucide-react` if not already imported.

**Step 2: Verify build**

Run: `pnpm --filter @cph/web run build`
Expected: build succeeds

**Step 3: Commit**

```bash
git add packages/web/src/components/layout/Sidebar.tsx
git commit -m "feat(web): add Spesa navigation items to sidebar"
```

---

## Task 9: Template Launch Integration in ShoppingListPage

**Files:**
- Modify: `packages/web/src/pages/shopping/ShoppingListPage.tsx`

**Step 1: Handle template preload from navigation state**

In `ShoppingListPage.tsx`, at the top of the component function, add handling for `useLocation` state passed from the templates page:

```typescript
import { useNavigate, useLocation } from 'react-router-dom';

// Inside the component:
const location = useLocation();

// On mount, if template data is passed, preload items
React.useEffect(() => {
  const state = location.state as { templateId?: string; items?: Array<{ productId: string; quantity: number }> } | null;
  if (state?.items && state.items.length > 0) {
    // Fetch product details for each item and populate
    const loadItems = async () => {
      const enriched: ShoppingItem[] = [];
      for (const m of state.items!) {
        try {
          const prod = await apiClient.get<any>(`/products/${m.productId}`);
          enriched.push({
            productId: m.productId,
            productName: prod.data.name,
            productUnit: prod.data.unit,
            category: prod.data.category,
            quantity: m.quantity,
          });
        } catch {
          // Product may have been deleted, skip it
        }
      }
      setItems(enriched);
    };
    loadItems();
    // Clear the state so refreshing doesn't re-trigger
    window.history.replaceState({}, '');
  }
}, []);
```

**Step 2: Verify build**

Run: `pnpm --filter @cph/web run build`
Expected: build succeeds

**Step 3: Commit**

```bash
git add packages/web/src/pages/shopping/ShoppingListPage.tsx
git commit -m "feat(web): handle template preload in ShoppingListPage"
```

---

## Task 10: Final Integration — Typecheck + Build Verification

**Step 1: Typecheck DB package**

Run: `pnpm --filter @cph/db exec tsc --noEmit`
Expected: no errors

**Step 2: Typecheck API package**

Run: `pnpm --filter @cph/api exec tsc --noEmit`
Expected: no errors

**Step 3: Build web package**

Run: `pnpm --filter @cph/web run build`
Expected: build succeeds

**Step 4: Final commit with any fixes**

If any fixes were needed, commit them:

```bash
git add -A
git commit -m "fix: resolve build issues for smart shopping list feature"
```
