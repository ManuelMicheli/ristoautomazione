import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
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
  // Done
  // -----------------------------------------------------------------------
  console.log('\nSeed completed successfully!');
  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
