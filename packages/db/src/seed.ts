import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import * as schema from './schema';

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://cph:cph@localhost:5432/cph';

async function seed() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool, { schema });

  console.log('Seeding database...');

  // -----------------------------------------------------------------------
  // 1. Tenant
  // -----------------------------------------------------------------------
  const [tenant] = await db
    .insert(schema.tenants)
    .values({
      name: 'Ristorante Demo',
      slug: 'demo',
      settings: {
        currency: 'EUR',
        language: 'it',
        timezone: 'Europe/Rome',
      },
    })
    .returning();
  if (!tenant) throw new Error('Failed to create tenant');

  console.log(`  Created tenant: ${tenant.name} (${tenant.id})`);

  // -----------------------------------------------------------------------
  // 2. Locations
  // -----------------------------------------------------------------------
  const [locCentrale, locNord] = await db
    .insert(schema.locations)
    .values([
      {
        tenantId: tenant.id,
        name: 'Sede Centrale',
        address: 'Via Roma 1, 20121 Milano MI',
        phone: '+39 02 1234567',
        email: 'sede@demo.it',
      },
      {
        tenantId: tenant.id,
        name: 'Filiale Nord',
        address: 'Corso Garibaldi 42, 20121 Milano MI',
        phone: '+39 02 7654321',
        email: 'nord@demo.it',
      },
    ])
    .returning();
  if (!locCentrale) throw new Error('Failed to create locCentrale');
  if (!locNord) throw new Error('Failed to create locNord');

  console.log(`  Created locations: ${locCentrale.name}, ${locNord.name}`);

  // -----------------------------------------------------------------------
  // 3. Owner user (bcrypt hash of "password123")
  // -----------------------------------------------------------------------
  // Pre-computed bcrypt hash for "password123" with cost factor 10
  const PASSWORD_HASH =
    '$2b$10$EIXe7eLkRz6yFN3UeEPKQuKJZz0dGx2vGsmw3OKYEUV9iDGLNFMOy';

  const [adminUser] = await db
    .insert(schema.users)
    .values({
      tenantId: tenant.id,
      locationId: locCentrale.id,
      email: 'admin@demo.it',
      passwordHash: PASSWORD_HASH,
      role: 'owner',
      firstName: 'Admin',
      lastName: 'Demo',
      isActive: true,
      notificationPreferences: {
        email: true,
        push: true,
        sms: false,
      },
    })
    .returning();
  if (!adminUser) throw new Error('Failed to create adminUser');

  console.log(`  Created admin user: ${adminUser.email}`);

  // -----------------------------------------------------------------------
  // 4. Suppliers (5 across categories)
  // -----------------------------------------------------------------------
  const supplierData = [
    {
      tenantId: tenant.id,
      businessName: 'Ortomercato Milano S.r.l.',
      vatNumber: 'IT01234567890',
      paymentTerms: '30 giorni fine mese',
      deliveryDays: [1, 3, 5],
      leadTimeDays: 1,
      minimumOrderAmount: '50.00',
      category: 'ortofrutta' as const,
      notes: 'Fornitore principale ortofrutta',
    },
    {
      tenantId: tenant.id,
      businessName: 'Pescheria Blu S.r.l.',
      vatNumber: 'IT09876543210',
      paymentTerms: '15 giorni',
      deliveryDays: [2, 4],
      leadTimeDays: 1,
      minimumOrderAmount: '100.00',
      category: 'ittico' as const,
      notes: 'Pesce fresco giornaliero',
    },
    {
      tenantId: tenant.id,
      businessName: 'Macelleria Rossi S.p.A.',
      vatNumber: 'IT11223344556',
      paymentTerms: '30 giorni',
      deliveryDays: [1, 2, 3, 4, 5],
      leadTimeDays: 2,
      minimumOrderAmount: '150.00',
      category: 'carni' as const,
      notes: 'Carni certificate italiane',
    },
    {
      tenantId: tenant.id,
      businessName: 'Latteria Alpina S.r.l.',
      vatNumber: 'IT55667788990',
      paymentTerms: '30 giorni fine mese',
      deliveryDays: [1, 3, 5],
      leadTimeDays: 2,
      minimumOrderAmount: '80.00',
      category: 'latticini' as const,
      notes: 'Latticini e formaggi DOP',
    },
    {
      tenantId: tenant.id,
      businessName: 'Bevande Italia S.r.l.',
      vatNumber: 'IT99887766554',
      paymentTerms: '60 giorni',
      deliveryDays: [2, 4],
      leadTimeDays: 3,
      minimumOrderAmount: '200.00',
      category: 'beverage' as const,
      notes: 'Vini, birre e bevande',
    },
  ];

  const createdSuppliers = await db
    .insert(schema.suppliers)
    .values(supplierData)
    .returning();

  console.log(
    `  Created ${createdSuppliers.length} suppliers`,
  );

  // -----------------------------------------------------------------------
  // 4b. Supplier contacts (2-3 per supplier)
  // -----------------------------------------------------------------------
  const contactData = [
    // Ortomercato
    { supplierId: createdSuppliers[0]!.id, name: 'Mario Verdi', role: 'Commerciale', phone: '+39 333 1111111', email: 'mario@ortomercato.it', isPrimary: true },
    { supplierId: createdSuppliers[0]!.id, name: 'Lucia Bianchi', role: 'Logistica', phone: '+39 333 1111112', email: 'lucia@ortomercato.it', isPrimary: false },
    // Pescheria Blu
    { supplierId: createdSuppliers[1]!.id, name: 'Paolo Marino', role: 'Titolare', phone: '+39 333 2222221', email: 'paolo@pescheriabl.it', isPrimary: true },
    { supplierId: createdSuppliers[1]!.id, name: 'Anna Pesce', role: 'Ordini', phone: '+39 333 2222222', email: 'anna@pescheriabl.it', isPrimary: false },
    { supplierId: createdSuppliers[1]!.id, name: 'Luca Costa', role: 'Consegne', phone: '+39 333 2222223', email: 'luca@pescheriabl.it', isPrimary: false },
    // Macelleria Rossi
    { supplierId: createdSuppliers[2]!.id, name: 'Giovanni Rossi', role: 'Titolare', phone: '+39 333 3333331', email: 'giovanni@macelleriarossi.it', isPrimary: true },
    { supplierId: createdSuppliers[2]!.id, name: 'Marco Rossi', role: 'Commerciale', phone: '+39 333 3333332', email: 'marco@macelleriarossi.it', isPrimary: false },
    // Latteria Alpina
    { supplierId: createdSuppliers[3]!.id, name: 'Elena Monti', role: 'Commerciale', phone: '+39 333 4444441', email: 'elena@latteriaalpina.it', isPrimary: true },
    { supplierId: createdSuppliers[3]!.id, name: 'Roberto Colle', role: 'Qualita', phone: '+39 333 4444442', email: 'roberto@latteriaalpina.it', isPrimary: false },
    { supplierId: createdSuppliers[3]!.id, name: 'Sara Neve', role: 'Logistica', phone: '+39 333 4444443', email: 'sara@latteriaalpina.it', isPrimary: false },
    // Bevande Italia
    { supplierId: createdSuppliers[4]!.id, name: 'Franco Vini', role: 'Agente', phone: '+39 333 5555551', email: 'franco@bevandeitalia.it', isPrimary: true },
    { supplierId: createdSuppliers[4]!.id, name: 'Chiara Birra', role: 'Ordini', phone: '+39 333 5555552', email: 'chiara@bevandeitalia.it', isPrimary: false },
  ];

  await db.insert(schema.supplierContacts).values(contactData);
  console.log(`  Created ${contactData.length} supplier contacts`);

  // -----------------------------------------------------------------------
  // 4c. Supplier documents
  // -----------------------------------------------------------------------
  const docData = [
    { supplierId: createdSuppliers[0]!.id, type: 'haccp' as const, filePath: '/docs/ortomercato_haccp.pdf', fileName: 'ortomercato_haccp.pdf', mimeType: 'application/pdf', expiryDate: '2027-06-30', uploadedBy: adminUser.id },
    { supplierId: createdSuppliers[0]!.id, type: 'bio' as const, filePath: '/docs/ortomercato_bio.pdf', fileName: 'ortomercato_bio.pdf', mimeType: 'application/pdf', expiryDate: '2027-12-31', uploadedBy: adminUser.id },
    { supplierId: createdSuppliers[1]!.id, type: 'haccp' as const, filePath: '/docs/pescheria_haccp.pdf', fileName: 'pescheria_haccp.pdf', mimeType: 'application/pdf', expiryDate: '2027-03-15', uploadedBy: adminUser.id },
    { supplierId: createdSuppliers[2]!.id, type: 'haccp' as const, filePath: '/docs/macelleria_haccp.pdf', fileName: 'macelleria_haccp.pdf', mimeType: 'application/pdf', expiryDate: '2027-09-30', uploadedBy: adminUser.id },
    { supplierId: createdSuppliers[2]!.id, type: 'durc' as const, filePath: '/docs/macelleria_durc.pdf', fileName: 'macelleria_durc.pdf', mimeType: 'application/pdf', expiryDate: '2026-08-15', uploadedBy: adminUser.id },
    { supplierId: createdSuppliers[3]!.id, type: 'dop' as const, filePath: '/docs/latteria_dop.pdf', fileName: 'latteria_dop.pdf', mimeType: 'application/pdf', expiryDate: '2028-01-01', uploadedBy: adminUser.id },
    { supplierId: createdSuppliers[4]!.id, type: 'visura' as const, filePath: '/docs/bevande_visura.pdf', fileName: 'bevande_visura.pdf', mimeType: 'application/pdf', expiryDate: '2026-12-31', uploadedBy: adminUser.id },
  ];

  await db.insert(schema.supplierDocuments).values(docData);
  console.log(`  Created ${docData.length} supplier documents`);

  // -----------------------------------------------------------------------
  // 5. Products (50 products across categories)
  // -----------------------------------------------------------------------
  const productValues = [
    // Ortofrutta (10)
    { tenantId: tenant.id, name: 'Pomodori San Marzano', category: 'Ortofrutta', unit: 'kg' as const, internalCode: 'ORT-001', isBio: true, isDop: true, isIgp: false, allergens: [] },
    { tenantId: tenant.id, name: 'Zucchine', category: 'Ortofrutta', unit: 'kg' as const, internalCode: 'ORT-002', isBio: false, isDop: false, isIgp: false, allergens: [] },
    { tenantId: tenant.id, name: 'Insalata mista', category: 'Ortofrutta', unit: 'kg' as const, internalCode: 'ORT-003', isBio: true, isDop: false, isIgp: false, allergens: [] },
    { tenantId: tenant.id, name: 'Basilico fresco', category: 'Ortofrutta', unit: 'pz' as const, internalCode: 'ORT-004', isBio: true, isDop: false, isIgp: false, allergens: [] },
    { tenantId: tenant.id, name: 'Patate', category: 'Ortofrutta', unit: 'kg' as const, internalCode: 'ORT-005', isBio: false, isDop: false, isIgp: false, allergens: [] },
    { tenantId: tenant.id, name: 'Cipolle dorate', category: 'Ortofrutta', unit: 'kg' as const, internalCode: 'ORT-006', isBio: false, isDop: false, isIgp: false, allergens: [] },
    { tenantId: tenant.id, name: 'Peperoni rossi', category: 'Ortofrutta', unit: 'kg' as const, internalCode: 'ORT-007', isBio: false, isDop: false, isIgp: false, allergens: [] },
    { tenantId: tenant.id, name: 'Limoni di Sorrento', category: 'Ortofrutta', unit: 'kg' as const, internalCode: 'ORT-008', isBio: false, isDop: false, isIgp: true, allergens: [] },
    { tenantId: tenant.id, name: 'Funghi porcini', category: 'Ortofrutta', unit: 'kg' as const, internalCode: 'ORT-009', isBio: false, isDop: false, isIgp: false, allergens: [] },
    { tenantId: tenant.id, name: 'Rucola', category: 'Ortofrutta', unit: 'kg' as const, internalCode: 'ORT-010', isBio: true, isDop: false, isIgp: false, allergens: [] },
    // Ittico (10)
    { tenantId: tenant.id, name: 'Branzino fresco', category: 'Ittico', unit: 'kg' as const, internalCode: 'ITT-001', isBio: false, isDop: false, isIgp: false, allergens: ['pesce'] },
    { tenantId: tenant.id, name: 'Gamberi rossi', category: 'Ittico', unit: 'kg' as const, internalCode: 'ITT-002', isBio: false, isDop: false, isIgp: false, allergens: ['crostacei'] },
    { tenantId: tenant.id, name: 'Tonno rosso', category: 'Ittico', unit: 'kg' as const, internalCode: 'ITT-003', isBio: false, isDop: false, isIgp: false, allergens: ['pesce'] },
    { tenantId: tenant.id, name: 'Vongole veraci', category: 'Ittico', unit: 'kg' as const, internalCode: 'ITT-004', isBio: false, isDop: false, isIgp: false, allergens: ['molluschi'] },
    { tenantId: tenant.id, name: 'Calamari', category: 'Ittico', unit: 'kg' as const, internalCode: 'ITT-005', isBio: false, isDop: false, isIgp: false, allergens: ['molluschi'] },
    { tenantId: tenant.id, name: 'Orata fresca', category: 'Ittico', unit: 'kg' as const, internalCode: 'ITT-006', isBio: false, isDop: false, isIgp: false, allergens: ['pesce'] },
    { tenantId: tenant.id, name: 'Salmone norvegese', category: 'Ittico', unit: 'kg' as const, internalCode: 'ITT-007', isBio: false, isDop: false, isIgp: false, allergens: ['pesce'] },
    { tenantId: tenant.id, name: 'Polpo', category: 'Ittico', unit: 'kg' as const, internalCode: 'ITT-008', isBio: false, isDop: false, isIgp: false, allergens: ['molluschi'] },
    { tenantId: tenant.id, name: 'Cozze', category: 'Ittico', unit: 'kg' as const, internalCode: 'ITT-009', isBio: false, isDop: false, isIgp: false, allergens: ['molluschi'] },
    { tenantId: tenant.id, name: 'Scampi', category: 'Ittico', unit: 'kg' as const, internalCode: 'ITT-010', isBio: false, isDop: false, isIgp: false, allergens: ['crostacei'] },
    // Carni (10)
    { tenantId: tenant.id, name: 'Filetto di manzo', category: 'Carni', unit: 'kg' as const, internalCode: 'CAR-001', isBio: false, isDop: false, isIgp: false, allergens: [] },
    { tenantId: tenant.id, name: 'Costata di manzo', category: 'Carni', unit: 'kg' as const, internalCode: 'CAR-002', isBio: false, isDop: false, isIgp: false, allergens: [] },
    { tenantId: tenant.id, name: 'Petto di pollo', category: 'Carni', unit: 'kg' as const, internalCode: 'CAR-003', isBio: true, isDop: false, isIgp: false, allergens: [] },
    { tenantId: tenant.id, name: 'Agnello cosciotto', category: 'Carni', unit: 'kg' as const, internalCode: 'CAR-004', isBio: false, isDop: false, isIgp: false, allergens: [] },
    { tenantId: tenant.id, name: 'Maiale lombo', category: 'Carni', unit: 'kg' as const, internalCode: 'CAR-005', isBio: false, isDop: false, isIgp: false, allergens: [] },
    { tenantId: tenant.id, name: 'Vitello fesa', category: 'Carni', unit: 'kg' as const, internalCode: 'CAR-006', isBio: false, isDop: false, isIgp: false, allergens: [] },
    { tenantId: tenant.id, name: 'Salsiccia artigianale', category: 'Carni', unit: 'kg' as const, internalCode: 'CAR-007', isBio: false, isDop: false, isIgp: false, allergens: ['solfiti'] },
    { tenantId: tenant.id, name: 'Prosciutto crudo Parma', category: 'Carni', unit: 'kg' as const, internalCode: 'CAR-008', isBio: false, isDop: true, isIgp: false, allergens: [] },
    { tenantId: tenant.id, name: 'Guanciale', category: 'Carni', unit: 'kg' as const, internalCode: 'CAR-009', isBio: false, isDop: false, isIgp: false, allergens: [] },
    { tenantId: tenant.id, name: 'Ossobuco', category: 'Carni', unit: 'kg' as const, internalCode: 'CAR-010', isBio: false, isDop: false, isIgp: false, allergens: [] },
    // Latticini (10)
    { tenantId: tenant.id, name: 'Parmigiano Reggiano 24 mesi', category: 'Latticini', unit: 'kg' as const, internalCode: 'LAT-001', isBio: false, isDop: true, isIgp: false, allergens: ['latte'] },
    { tenantId: tenant.id, name: 'Mozzarella di bufala', category: 'Latticini', unit: 'kg' as const, internalCode: 'LAT-002', isBio: false, isDop: true, isIgp: false, allergens: ['latte'] },
    { tenantId: tenant.id, name: 'Burrata', category: 'Latticini', unit: 'pz' as const, internalCode: 'LAT-003', isBio: false, isDop: false, isIgp: false, allergens: ['latte'] },
    { tenantId: tenant.id, name: 'Gorgonzola DOP', category: 'Latticini', unit: 'kg' as const, internalCode: 'LAT-004', isBio: false, isDop: true, isIgp: false, allergens: ['latte'] },
    { tenantId: tenant.id, name: 'Ricotta fresca', category: 'Latticini', unit: 'kg' as const, internalCode: 'LAT-005', isBio: false, isDop: false, isIgp: false, allergens: ['latte'] },
    { tenantId: tenant.id, name: 'Burro', category: 'Latticini', unit: 'kg' as const, internalCode: 'LAT-006', isBio: false, isDop: false, isIgp: false, allergens: ['latte'] },
    { tenantId: tenant.id, name: 'Panna fresca', category: 'Latticini', unit: 'lt' as const, internalCode: 'LAT-007', isBio: false, isDop: false, isIgp: false, allergens: ['latte'] },
    { tenantId: tenant.id, name: 'Pecorino Romano DOP', category: 'Latticini', unit: 'kg' as const, internalCode: 'LAT-008', isBio: false, isDop: true, isIgp: false, allergens: ['latte'] },
    { tenantId: tenant.id, name: 'Mascarpone', category: 'Latticini', unit: 'kg' as const, internalCode: 'LAT-009', isBio: false, isDop: false, isIgp: false, allergens: ['latte'] },
    { tenantId: tenant.id, name: 'Stracchino', category: 'Latticini', unit: 'kg' as const, internalCode: 'LAT-010', isBio: false, isDop: false, isIgp: false, allergens: ['latte'] },
    // Bevande (10)
    { tenantId: tenant.id, name: 'Chianti Classico DOCG', category: 'Bevande', unit: 'pz' as const, internalCode: 'BEV-001', isBio: false, isDop: false, isIgp: false, allergens: ['solfiti'] },
    { tenantId: tenant.id, name: 'Prosecco Valdobbiadene', category: 'Bevande', unit: 'pz' as const, internalCode: 'BEV-002', isBio: false, isDop: false, isIgp: false, allergens: ['solfiti'] },
    { tenantId: tenant.id, name: 'Barolo DOCG', category: 'Bevande', unit: 'pz' as const, internalCode: 'BEV-003', isBio: false, isDop: false, isIgp: false, allergens: ['solfiti'] },
    { tenantId: tenant.id, name: 'Acqua minerale naturale', category: 'Bevande', unit: 'cartone' as const, internalCode: 'BEV-004', isBio: false, isDop: false, isIgp: false, allergens: [] },
    { tenantId: tenant.id, name: 'Acqua minerale frizzante', category: 'Bevande', unit: 'cartone' as const, internalCode: 'BEV-005', isBio: false, isDop: false, isIgp: false, allergens: [] },
    { tenantId: tenant.id, name: 'Birra artigianale IPA', category: 'Bevande', unit: 'pz' as const, internalCode: 'BEV-006', isBio: false, isDop: false, isIgp: false, allergens: ['glutine'] },
    { tenantId: tenant.id, name: 'Limoncello', category: 'Bevande', unit: 'pz' as const, internalCode: 'BEV-007', isBio: false, isDop: false, isIgp: false, allergens: [] },
    { tenantId: tenant.id, name: 'Grappa di Nebbiolo', category: 'Bevande', unit: 'pz' as const, internalCode: 'BEV-008', isBio: false, isDop: false, isIgp: false, allergens: [] },
    { tenantId: tenant.id, name: 'Vermentino di Sardegna', category: 'Bevande', unit: 'pz' as const, internalCode: 'BEV-009', isBio: true, isDop: false, isIgp: false, allergens: ['solfiti'] },
    { tenantId: tenant.id, name: 'Coca-Cola 33cl', category: 'Bevande', unit: 'cartone' as const, internalCode: 'BEV-010', isBio: false, isDop: false, isIgp: false, allergens: [] },
  ];

  const createdProducts = await db
    .insert(schema.products)
    .values(productValues)
    .returning();

  console.log(`  Created ${createdProducts.length} products`);

  // -----------------------------------------------------------------------
  // 5b. Supplier-product links with prices
  // -----------------------------------------------------------------------
  // Map: supplier index -> product index range
  // Ortomercato (0) -> products 0-9 (ortofrutta)
  // Pescheria (1) -> products 10-19 (ittico)
  // Macelleria (2) -> products 20-29 (carni)
  // Latteria (3) -> products 30-39 (latticini)
  // Bevande (4) -> products 40-49 (bevande)
  const prices: Record<number, string[]> = {
    0: ['3.5000', '2.2000', '4.0000', '1.5000', '1.2000', '1.0000', '3.0000', '2.8000', '18.0000', '5.0000'],
    1: ['22.0000', '35.0000', '55.0000', '12.0000', '15.0000', '18.0000', '28.0000', '16.0000', '6.0000', '42.0000'],
    2: ['45.0000', '32.0000', '9.5000', '18.0000', '12.0000', '25.0000', '8.5000', '28.0000', '14.0000', '15.0000'],
    3: ['18.0000', '14.0000', '3.5000', '12.0000', '5.0000', '8.0000', '4.5000', '22.0000', '7.0000', '6.5000'],
    4: ['12.0000', '9.5000', '35.0000', '4.0000', '4.0000', '6.0000', '15.0000', '22.0000', '10.0000', '18.0000'],
  };

  const supplierProductValues: Array<{
    supplierId: string;
    productId: string;
    supplierCode: string;
    currentPrice: string;
    currency: string;
    isActive: boolean;
    priceValidFrom: string;
    priceValidTo: string;
  }> = [];

  for (let si = 0; si < 5; si++) {
    for (let pi = 0; pi < 10; pi++) {
      const productIdx = si * 10 + pi;
      supplierProductValues.push({
        supplierId: createdSuppliers[si]!.id,
        productId: createdProducts[productIdx]!.id,
        supplierCode: `SUP${si + 1}-${String(pi + 1).padStart(3, '0')}`,
        currentPrice: prices[si]![pi]!,
        currency: 'EUR',
        isActive: true,
        priceValidFrom: '2026-01-01',
        priceValidTo: '2026-12-31',
      });
    }
  }

  const createdSupplierProducts = await db
    .insert(schema.supplierProducts)
    .values(supplierProductValues)
    .returning();

  console.log(
    `  Created ${createdSupplierProducts.length} supplier-product links`,
  );

  // -----------------------------------------------------------------------
  // 6. Purchase orders (10 in various states)
  // -----------------------------------------------------------------------
  const orderStatuses: Array<{
    status: 'draft' | 'pending_approval' | 'approved' | 'sent' | 'confirmed' | 'received' | 'closed' | 'cancelled';
    supplierIdx: number;
    locationId: string;
    isUrgent: boolean;
  }> = [
    { status: 'draft', supplierIdx: 0, locationId: locCentrale.id, isUrgent: false },
    { status: 'draft', supplierIdx: 1, locationId: locNord.id, isUrgent: false },
    { status: 'pending_approval', supplierIdx: 2, locationId: locCentrale.id, isUrgent: false },
    { status: 'approved', supplierIdx: 3, locationId: locCentrale.id, isUrgent: false },
    { status: 'sent', supplierIdx: 4, locationId: locNord.id, isUrgent: true },
    { status: 'confirmed', supplierIdx: 0, locationId: locCentrale.id, isUrgent: false },
    { status: 'confirmed', supplierIdx: 1, locationId: locNord.id, isUrgent: false },
    { status: 'received', supplierIdx: 2, locationId: locCentrale.id, isUrgent: false },
    { status: 'closed', supplierIdx: 3, locationId: locCentrale.id, isUrgent: false },
    { status: 'cancelled', supplierIdx: 4, locationId: locNord.id, isUrgent: false },
  ];

  const createdOrders = [];
  for (let i = 0; i < orderStatuses.length; i++) {
    const os = orderStatuses[i]!;
    const sup = createdSuppliers[os.supplierIdx]!;
    // Pick 3 products from that supplier
    const spStart = os.supplierIdx * 10;
    const sp1 = createdSupplierProducts[spStart]!;
    const sp2 = createdSupplierProducts[spStart + 1]!;
    const sp3 = createdSupplierProducts[spStart + 2]!;

    const q1 = 5, q2 = 3, q3 = 2;
    const p1 = parseFloat(sp1.currentPrice);
    const p2 = parseFloat(sp2.currentPrice);
    const p3 = parseFloat(sp3.currentPrice);
    const total = (q1 * p1 + q2 * p2 + q3 * p3).toFixed(2);

    const approvedAt =
      ['approved', 'sent', 'confirmed', 'received', 'closed'].includes(os.status)
        ? new Date('2026-02-20T10:00:00Z')
        : null;
    const sentAt =
      ['sent', 'confirmed', 'received', 'closed'].includes(os.status)
        ? new Date('2026-02-21T08:00:00Z')
        : null;

    const [order] = await db
      .insert(schema.purchaseOrders)
      .values({
        tenantId: tenant.id,
        locationId: os.locationId,
        supplierId: sup.id,
        status: os.status,
        totalAmount: total,
        notes: `Ordine demo #${i + 1}`,
        approvedBy: approvedAt ? adminUser.id : null,
        approvedAt,
        sentAt,
        sentVia: sentAt ? 'email' : null,
        expectedDeliveryDate: '2026-02-25',
        isUrgent: os.isUrgent,
        isRecurringTemplate: false,
        createdBy: adminUser.id,
      })
      .returning();
    if (!order) throw new Error(`Failed to create order #${i + 1}`);

    // Order lines
    await db.insert(schema.orderLines).values([
      {
        orderId: order.id,
        productId: createdProducts[spStart]!.id,
        supplierProductId: sp1.id,
        quantity: q1.toFixed(3),
        unitPrice: sp1.currentPrice,
        lineTotal: (q1 * p1).toFixed(2),
      },
      {
        orderId: order.id,
        productId: createdProducts[spStart + 1]!.id,
        supplierProductId: sp2.id,
        quantity: q2.toFixed(3),
        unitPrice: sp2.currentPrice,
        lineTotal: (q2 * p2).toFixed(2),
      },
      {
        orderId: order.id,
        productId: createdProducts[spStart + 2]!.id,
        supplierProductId: sp3.id,
        quantity: q3.toFixed(3),
        unitPrice: sp3.currentPrice,
        lineTotal: (q3 * p3).toFixed(2),
      },
    ]);

    createdOrders.push(order);
  }

  console.log(`  Created ${createdOrders.length} purchase orders with lines`);

  // -----------------------------------------------------------------------
  // 7. Receivings (3 with non-conformities)
  // -----------------------------------------------------------------------
  // We'll create receivings for orders 6 (confirmed), 7 (received), 8 (closed)
  const receivingOrders = [
    { orderIdx: 6, supplierIdx: 1, status: 'in_progress' as const },
    { orderIdx: 7, supplierIdx: 2, status: 'completed' as const },
    { orderIdx: 8, supplierIdx: 3, status: 'completed' as const },
  ];

  for (const ro of receivingOrders) {
    const order = createdOrders[ro.orderIdx]!;
    const sup = createdSuppliers[ro.supplierIdx]!;
    const spStart = ro.supplierIdx * 10;

    const [receiving] = await db
      .insert(schema.receivings)
      .values({
        tenantId: tenant.id,
        orderId: order.id,
        supplierId: sup.id,
        receivedBy: adminUser.id,
        notes: `Ricezione per ordine #${ro.orderIdx + 1}`,
        status: ro.status,
      })
      .returning();
    if (!receiving) throw new Error('Failed to create receiving');

    // Query order lines for this order using drizzle eq
    const orderLineRows = await db
      .select()
      .from(schema.orderLines)
      .where(eq(schema.orderLines.orderId, order.id));

    if (orderLineRows.length >= 3) {
      // Receiving lines: first is conforming, second has wrong quantity, third has temperature issue
      const [_rl1, rl2, rl3] = await db
        .insert(schema.receivingLines)
        .values([
          {
            receivingId: receiving.id,
            orderLineId: orderLineRows[0]!.id,
            productId: orderLineRows[0]!.productId,
            quantityOrdered: '5.000',
            quantityReceived: '5.000',
            isConforming: true,
            temperature: '4.00',
          },
          {
            receivingId: receiving.id,
            orderLineId: orderLineRows[1]!.id,
            productId: orderLineRows[1]!.productId,
            quantityOrdered: '3.000',
            quantityReceived: '2.000',
            isConforming: false,
            temperature: '3.50',
            notes: 'Manca 1 kg',
          },
          {
            receivingId: receiving.id,
            orderLineId: orderLineRows[2]!.id,
            productId: orderLineRows[2]!.productId,
            quantityOrdered: '2.000',
            quantityReceived: '2.000',
            isConforming: false,
            temperature: '12.00',
            notes: 'Temperatura fuori range',
          },
        ])
        .returning();
      if (!rl2 || !rl3) throw new Error('Failed to create receiving lines');

      // Non-conformities for lines 2 and 3
      await db.insert(schema.nonConformities).values([
        {
          receivingLineId: rl2.id,
          type: 'wrong_quantity',
          severity: 'medium',
          description: 'Ricevuti 2 kg invece di 3 kg ordinati',
          photoPaths: [],
          resolved: ro.status === 'completed',
          resolvedAt:
            ro.status === 'completed'
              ? new Date('2026-02-24T14:00:00Z')
              : null,
          resolvedBy: ro.status === 'completed' ? adminUser.id : null,
          resolutionNotes:
            ro.status === 'completed'
              ? 'Nota di credito ricevuta dal fornitore'
              : null,
        },
        {
          receivingLineId: rl3.id,
          type: 'temperature',
          severity: 'high',
          description:
            'Temperatura rilevata 12C, limite massimo 4C per questo prodotto',
          photoPaths: ['/photos/nc_temp_001.jpg'],
          resolved: false,
        },
      ]);
    }
  }

  console.log('  Created 3 receivings with non-conformities');

  // -----------------------------------------------------------------------
  // Done
  // -----------------------------------------------------------------------
  console.log('\nSeed completed successfully!');
  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
