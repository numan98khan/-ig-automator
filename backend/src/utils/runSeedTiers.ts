import dotenv from 'dotenv';
import { connectDB } from '../config/database';
import { seedBaselineTiers } from './seedTiers';

dotenv.config();

const run = async () => {
  try {
    await connectDB();
    await seedBaselineTiers();
    console.log('✅ Seeded baseline tiers');
  } catch (error) {
    console.error('❌ Failed to seed tiers', error);
  } finally {
    process.exit(0);
  }
};

run();
