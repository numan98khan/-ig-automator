import mongoose from 'mongoose';
import { connectDB } from '../config/database';
import { closePostgresPool, postgresQuery } from '../db/postgres';

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? 'admin@sendfx.ai').toLowerCase();

const resetPostgres = async () => {
  const adminUser = await postgresQuery<{ id: string }>(
    'SELECT id FROM core.users WHERE email = $1 LIMIT 1',
    [ADMIN_EMAIL]
  );
  const adminId = adminUser.rows[0]?.id;

  if (!adminId) {
    throw new Error(`Admin user with email ${ADMIN_EMAIL} not found in Postgres`);
  }

  await postgresQuery('BEGIN');
  try {
    await postgresQuery(
      `UPDATE core.users
      SET default_workspace_id = NULL,
          billing_account_id = NULL,
          tier_id = NULL,
          tier_limit_overrides = NULL
      WHERE id = $1`,
      [adminId]
    );

    await postgresQuery('DELETE FROM core.workspace_members');
    await postgresQuery('DELETE FROM core.workspaces');
    await postgresQuery('DELETE FROM core.subscriptions');
    await postgresQuery('DELETE FROM core.usage_counters');
    await postgresQuery('DELETE FROM core.openai_usage');
    await postgresQuery('DELETE FROM core.billing_accounts');
    await postgresQuery('DELETE FROM core.tiers');
    await postgresQuery('DELETE FROM core.users WHERE id <> $1', [adminId]);
    await postgresQuery('COMMIT');
  } catch (error) {
    await postgresQuery('ROLLBACK');
    throw error;
  }
};

const resetMongo = async () => {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('MongoDB not connected');
  }

  const collections = await db.listCollections().toArray();
  for (const collection of collections) {
    const name = collection.name;
    if (name === 'adminlogsettings') {
      continue;
    }
    
    if (name === 'adminlogsettings') {
      continue;
    }

    if (name === 'users') {
      await db.collection(name).deleteMany({ email: { $ne: ADMIN_EMAIL } });
      continue;
    }

    await db.collection(name).deleteMany({});
  }
};

const resetFactoryData = async () => {
  await resetPostgres();
  await connectDB();
  try {
    await resetMongo();
  } finally {
    await mongoose.disconnect();
  }
};

resetFactoryData()
  .then(async () => {
    await closePostgresPool();
    console.log('✅ Factory reset complete');
    process.exit(0);
  })
  .catch(async (error) => {
    await closePostgresPool();
    console.error('❌ Factory reset failed', error);
    process.exit(1);
  });
