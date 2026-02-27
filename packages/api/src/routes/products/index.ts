import { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/rbac';
import { logAudit } from '../../middleware/audit';
import { ProductService } from '../../services/product-service';
import {
  createProductSchema,
  updateProductSchema,
  linkSupplierProductSchema,
  updatePriceSchema,
  listProductsQuerySchema,
  confirmPriceListSchema,
} from './schemas';
import {
  products,
  supplierProducts,
  priceHistory,
} from '@cph/db';
import {
  eq,
  and,
  isNull,
  ilike,
} from 'drizzle-orm';

const productService = new ProductService();

export async function productRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // -------------------------------------------------------------------------
  // GET /products - list with filters and pagination
  // -------------------------------------------------------------------------
  app.get('/', async (request, reply) => {
    const filters = listProductsQuerySchema.parse(request.query);
    const tenantId = request.user.tenantId;

    const result = await productService.list(app.db, tenantId, filters);

    return {
      success: true,
      data: result.data,
      pagination: result.pagination,
    };
  });

  // -------------------------------------------------------------------------
  // POST /products - create product
  // -------------------------------------------------------------------------
  app.post(
    '/',
    { preHandler: [requirePermission('products', 'create')] },
    async (request, reply) => {
      const data = createProductSchema.parse(request.body);
      const tenantId = request.user.tenantId;

      const product = await productService.create(app.db, tenantId, data);

      await logAudit(app.db, request, {
        action: 'create',
        entityType: 'product',
        entityId: product.id,
        newValues: data as Record<string, unknown>,
      });

      return reply.status(201).send({
        success: true,
        data: product,
      });
    },
  );

  // -------------------------------------------------------------------------
  // GET /products/price-alerts - recent price alerts
  // (must be before /:id to avoid route conflict)
  // -------------------------------------------------------------------------
  app.get('/price-alerts', async (request, reply) => {
    const tenantId = request.user.tenantId;
    const query = request.query as any;
    const page = parseInt(query.page || '1', 10);
    const pageSize = parseInt(query.pageSize || '20', 10);

    const result = await productService.getPriceAlerts(
      app.db,
      tenantId,
      page,
      pageSize,
    );

    return {
      success: true,
      data: result.data,
      pagination: result.pagination,
    };
  });

  // -------------------------------------------------------------------------
  // GET /products/:id - product detail with supplier prices
  // -------------------------------------------------------------------------
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const tenantId = request.user.tenantId;
    const { id } = request.params;

    const product = await productService.getById(app.db, tenantId, id);
    if (!product) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Prodotto non trovato',
        },
      });
    }

    return {
      success: true,
      data: product,
    };
  });

  // -------------------------------------------------------------------------
  // PUT /products/:id - update product
  // -------------------------------------------------------------------------
  app.put<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [requirePermission('products', 'update')] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const { id } = request.params;
      const data = updateProductSchema.parse(request.body);

      // Get old values for audit
      const existing = await productService.getById(app.db, tenantId, id);
      if (!existing) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Prodotto non trovato',
          },
        });
      }

      const updated = await productService.update(app.db, tenantId, id, data);

      await logAudit(app.db, request, {
        action: 'update',
        entityType: 'product',
        entityId: id,
        oldValues: existing as Record<string, unknown>,
        newValues: data as Record<string, unknown>,
      });

      return {
        success: true,
        data: updated,
      };
    },
  );

  // -------------------------------------------------------------------------
  // DELETE /products/:id - soft delete
  // -------------------------------------------------------------------------
  app.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [requirePermission('products', 'delete')] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const { id } = request.params;

      const deleted = await productService.softDelete(app.db, tenantId, id);
      if (!deleted) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Prodotto non trovato',
          },
        });
      }

      await logAudit(app.db, request, {
        action: 'delete',
        entityType: 'product',
        entityId: id,
      });

      return {
        success: true,
        data: { id, deleted: true },
      };
    },
  );

  // -------------------------------------------------------------------------
  // GET /products/:id/prices - all suppliers for this product (comparator)
  // -------------------------------------------------------------------------
  app.get<{ Params: { id: string } }>(
    '/:id/prices',
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const { id } = request.params;

      // Verify product belongs to tenant
      const product = await productService.getById(app.db, tenantId, id);
      if (!product) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Prodotto non trovato',
          },
        });
      }

      const prices = await productService.getProductPrices(app.db, id);

      return {
        success: true,
        data: prices,
      };
    },
  );

  // -------------------------------------------------------------------------
  // GET /products/:id/price-history - price time series
  // Optional query: ?supplierProductId=...&from=...&to=...
  // -------------------------------------------------------------------------
  app.get<{ Params: { id: string } }>(
    '/:id/price-history',
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const { id } = request.params;
      const query = request.query as any;

      // Verify product belongs to tenant
      const product = await productService.getById(app.db, tenantId, id);
      if (!product) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Prodotto non trovato',
          },
        });
      }

      // If supplierProductId is specified, get history for that specific link
      if (query.supplierProductId) {
        const history = await productService.getPriceHistory(
          app.db,
          query.supplierProductId,
          { from: query.from, to: query.to },
        );
        return { success: true, data: history };
      }

      // Otherwise, get history for all supplier products of this product
      const spRows = await app.db
        .select({ id: supplierProducts.id })
        .from(supplierProducts)
        .where(
          and(
            eq(supplierProducts.productId, id),
            isNull(supplierProducts.deletedAt),
          ),
        );

      const allHistory: any[] = [];
      for (const sp of spRows) {
        const history = await productService.getPriceHistory(app.db, sp.id, {
          from: query.from,
          to: query.to,
        });
        allHistory.push(...history);
      }

      // Sort by date
      allHistory.sort(
        (a, b) =>
          new Date(a.date).getTime() - new Date(b.date).getTime(),
      );

      return {
        success: true,
        data: allHistory,
      };
    },
  );

  // -------------------------------------------------------------------------
  // POST /products/:id/suppliers - link product to supplier with price
  // -------------------------------------------------------------------------
  app.post<{ Params: { id: string } }>(
    '/:id/suppliers',
    { preHandler: [requirePermission('products', 'create')] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const { id } = request.params;
      const data = linkSupplierProductSchema.parse(request.body);

      // Verify product belongs to tenant
      const product = await productService.getById(app.db, tenantId, id);
      if (!product) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Prodotto non trovato',
          },
        });
      }

      const sp = await productService.linkSupplierProduct(app.db, id, data);

      await logAudit(app.db, request, {
        action: 'create',
        entityType: 'supplier_product',
        entityId: sp.id,
        newValues: { productId: id, ...data } as Record<string, unknown>,
      });

      return reply.status(201).send({
        success: true,
        data: sp,
      });
    },
  );

  // -------------------------------------------------------------------------
  // PUT /products/:id/suppliers/:supplierProductId - update price
  // -------------------------------------------------------------------------
  app.put<{ Params: { id: string; supplierProductId: string } }>(
    '/:id/suppliers/:supplierProductId',
    { preHandler: [requirePermission('products', 'update')] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const { id, supplierProductId } = request.params;
      const data = updatePriceSchema.parse(request.body);

      // Verify product belongs to tenant
      const product = await productService.getById(app.db, tenantId, id);
      if (!product) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Prodotto non trovato',
          },
        });
      }

      const result = await productService.updatePrice(
        app.db,
        supplierProductId,
        data,
        request.user.id,
        tenantId,
      );

      if (!result) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Listino fornitore non trovato',
          },
        });
      }

      await logAudit(app.db, request, {
        action: 'update',
        entityType: 'supplier_product',
        entityId: supplierProductId,
        newValues: data as Record<string, unknown>,
      });

      return {
        success: true,
        data: result.updated,
        priceAlert: result.priceAlert || null,
      };
    },
  );

  // -------------------------------------------------------------------------
  // POST /products/price-lists/import - CSV file upload, parse and preview
  // -------------------------------------------------------------------------
  app.post(
    '/price-lists/import',
    { preHandler: [requirePermission('products', 'create')] },
    async (request, reply) => {
      const file = await request.file();
      if (!file) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'File CSV richiesto',
          },
        });
      }

      const buffer = await file.toBuffer();
      const content = buffer.toString('utf-8');

      // Parse CSV
      const lines = content
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0);
      if (lines.length < 2) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Il file CSV deve contenere almeno un header e una riga di dati',
          },
        });
      }

      // Detect delimiter
      const firstLine = lines[0]!;
      const semicolonCount = (firstLine.match(/;/g) || []).length;
      const commaCount = (firstLine.match(/,/g) || []).length;
      const delimiter = semicolonCount > commaCount ? ';' : ',';

      // Parse lines into cells
      const parseLine = (line: string): string[] => {
        const cells: string[] = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            inQuotes = !inQuotes;
          } else if (ch === delimiter && !inQuotes) {
            cells.push(current.trim());
            current = '';
          } else {
            current += ch;
          }
        }
        cells.push(current.trim());
        return cells;
      };

      const headers = parseLine(lines[0]!);
      const rows = lines.slice(1).map((line) => {
        const cells = parseLine(line);
        const row: Record<string, string> = {};
        headers.forEach((header, idx) => {
          row[header] = cells[idx] || '';
        });
        return row;
      });

      // Auto-detect column mapping based on Italian keywords
      const columnMapping: Record<string, number> = {};
      const headerLower = headers.map((h) => h.toLowerCase().trim());

      for (let i = 0; i < headerLower.length; i++) {
        const h = headerLower[i];
        if (!h) continue;
        if (
          h.includes('nome') ||
          h.includes('prodotto') ||
          h.includes('descrizione') ||
          h.includes('articolo')
        ) {
          if (!columnMapping.product_name) columnMapping.product_name = i;
        }
        if (h.includes('codice') || h.includes('cod') || h.includes('sku')) {
          if (!columnMapping.supplier_code) columnMapping.supplier_code = i;
        }
        if (
          h.includes('prezzo') ||
          h.includes('costo') ||
          h.includes('importo') ||
          h.includes('price')
        ) {
          if (!columnMapping.price) columnMapping.price = i;
        }
        if (h.includes('unita') || h.includes('um') || h === 'u.m.') {
          if (!columnMapping.unit) columnMapping.unit = i;
        }
      }

      return {
        success: true,
        data: {
          headers,
          columnMapping,
          preview: rows.slice(0, 10),
          totalRows: rows.length,
          allData: rows,
        },
      };
    },
  );

  // -------------------------------------------------------------------------
  // POST /products/price-lists/confirm - apply parsed price list
  // -------------------------------------------------------------------------
  app.post(
    '/price-lists/confirm',
    { preHandler: [requirePermission('products', 'create')] },
    async (request, reply) => {
      const body = confirmPriceListSchema.parse(request.body);
      const tenantId = request.user.tenantId;
      const userId = request.user.id;
      const { supplierId, columnMapping, data: rows } = body;

      const results: {
        created: number;
        updated: number;
        skipped: number;
        alerts: any[];
        errors: any[];
      } = {
        created: 0,
        updated: 0,
        skipped: 0,
        alerts: [],
        errors: [],
      };

      const headers = Object.keys(rows[0] || {});

      for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
        const row = rows[rowIdx];
        const rowValues = Object.values(row ?? {});

        try {
          // Extract values using column mapping
          const productName =
            columnMapping.product_name !== undefined
              ? rowValues[columnMapping.product_name]
              : null;
          const supplierCode =
            columnMapping.supplier_code !== undefined
              ? rowValues[columnMapping.supplier_code]
              : null;
          const priceStr =
            columnMapping.price !== undefined
              ? rowValues[columnMapping.price]
              : null;

          if (!priceStr) {
            results.skipped++;
            continue;
          }

          // Parse price (handle comma as decimal separator)
          const price = parseFloat(
            String(priceStr).replace(',', '.').replace(/[^\d.]/g, ''),
          );
          if (isNaN(price) || price <= 0) {
            results.skipped++;
            continue;
          }

          // Find product by supplierCode or name
          let productRow: any = null;

          if (supplierCode) {
            // Try to find by supplier code in supplierProducts
            const [spMatch] = await app.db
              .select({
                productId: supplierProducts.productId,
              })
              .from(supplierProducts)
              .innerJoin(
                products,
                eq(supplierProducts.productId, products.id),
              )
              .where(
                and(
                  eq(supplierProducts.supplierId, supplierId),
                  eq(supplierProducts.supplierCode, String(supplierCode)),
                  eq(products.tenantId, tenantId),
                  isNull(products.deletedAt),
                  isNull(supplierProducts.deletedAt),
                ),
              )
              .limit(1);

            if (spMatch) {
              const [p] = await app.db
                .select()
                .from(products)
                .where(eq(products.id, spMatch.productId))
                .limit(1);
              productRow = p;
            }
          }

          if (!productRow && productName) {
            // Try to find by name (exact match first, then ilike)
            const [byName] = await app.db
              .select()
              .from(products)
              .where(
                and(
                  eq(products.tenantId, tenantId),
                  ilike(products.name, String(productName)),
                  isNull(products.deletedAt),
                ),
              )
              .limit(1);
            productRow = byName || null;
          }

          if (!productRow) {
            // If we have a product name, create the product
            if (productName) {
              const [newProduct] = await app.db
                .insert(products)
                .values({
                  tenantId,
                  name: String(productName),
                })
                .returning();
              productRow = newProduct;
            } else {
              results.skipped++;
              continue;
            }
          }

          // Check if supplierProduct already exists
          const [existingSp] = await app.db
            .select()
            .from(supplierProducts)
            .where(
              and(
                eq(supplierProducts.productId, productRow.id),
                eq(supplierProducts.supplierId, supplierId),
                isNull(supplierProducts.deletedAt),
              ),
            )
            .limit(1);

          if (existingSp) {
            // Update price
            const oldPrice = parseFloat(existingSp.currentPrice);

            // Record old price in history
            await app.db.insert(priceHistory).values({
              supplierProductId: existingSp.id,
              price: existingSp.currentPrice,
              recordedAt: new Date(),
              changedBy: userId,
            });

            // Update the supplier product
            await app.db
              .update(supplierProducts)
              .set({
                currentPrice: String(price),
                supplierCode: supplierCode
                  ? String(supplierCode)
                  : existingSp.supplierCode,
                updatedAt: new Date(),
              })
              .where(eq(supplierProducts.id, existingSp.id));

            results.updated++;

            // Check for price alert
            if (oldPrice > 0 && price > oldPrice) {
              const changePercent =
                ((price - oldPrice) / oldPrice) * 100;
              const threshold = parseFloat(
                process.env.PRICE_ALERT_THRESHOLD || '5',
              );
              if (changePercent > threshold) {
                results.alerts.push({
                  productName: productRow.name,
                  supplierProductId: existingSp.id,
                  oldPrice,
                  newPrice: price,
                  changePercent:
                    Math.round(changePercent * 100) / 100,
                });
              }
            }
          } else {
            // Create new supplier product
            const [newSp] = await app.db
              .insert(supplierProducts)
              .values({
                productId: productRow.id,
                supplierId,
                supplierCode: supplierCode
                  ? String(supplierCode)
                  : null,
                currentPrice: String(price),
                isActive: true,
              })
              .returning();

            // Record initial price history
            await app.db.insert(priceHistory).values({
              supplierProductId: newSp!.id,
              price: String(price),
              recordedAt: new Date(),
              changedBy: userId,
            });

            results.created++;
          }
        } catch (err: any) {
          results.errors.push({
            row: rowIdx + 1,
            message: err.message || 'Errore sconosciuto',
          });
        }
      }

      await logAudit(app.db, request, {
        action: 'import',
        entityType: 'price_list',
        entityId: supplierId,
        newValues: {
          created: results.created,
          updated: results.updated,
          skipped: results.skipped,
          alertCount: results.alerts.length,
          errorCount: results.errors.length,
        },
      });

      return {
        success: true,
        data: results,
      };
    },
  );
}
