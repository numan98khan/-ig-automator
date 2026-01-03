import { seedBaselineTiers } from './seedTiers';
import { ensureCoreSchema } from '../db/coreSchema';

async function run() {
  try {
    await ensureCoreSchema();
    await seedBaselineTiers();
    console.log('✅ Baseline tiers seeded');
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to seed tiers', error);
    process.exit(1);
  }
}

run();
