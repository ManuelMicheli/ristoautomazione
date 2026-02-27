import pg from 'pg';
const { Client } = pg;

const DB_NAME = 'cph';
const DB_USER = 'postgres';
const DB_PASS = process.env.PGPASSWORD || 'postgres';
const DB_HOST = 'localhost';
const DB_PORT = 5432;

async function main() {
  // Connect to default 'postgres' database to create our DB
  const client = new Client({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASS,
    database: 'postgres',
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL');

    // Check if database exists
    const res = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [DB_NAME]
    );

    if (res.rowCount === 0) {
      await client.query(`CREATE DATABASE ${DB_NAME}`);
      console.log(`Database '${DB_NAME}' created`);
    } else {
      console.log(`Database '${DB_NAME}' already exists`);
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
