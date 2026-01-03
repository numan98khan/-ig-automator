import { createUser, getUserByEmail, updateUser } from '../repositories/core/userRepository';

const DEFAULT_ADMIN_EMAIL = 'admin@sendfx.ai';
const DEFAULT_ADMIN_PASSWORD = 'Rentto@123';

export const ensureDefaultAdmin = async () => {
  try {
    const existing = await getUserByEmail(DEFAULT_ADMIN_EMAIL.toLowerCase(), { includePassword: true });
    if (existing) {
      const updates: Record<string, any> = {};
      if (existing.role !== 'admin') {
        updates.role = 'admin';
      }
      if (!existing.password) {
        updates.password = DEFAULT_ADMIN_PASSWORD;
      }
      if (!existing.emailVerified) {
        updates.emailVerified = true;
      }
      if (existing.isProvisional) {
        updates.isProvisional = false;
      }
      if (Object.keys(updates).length > 0) {
        await updateUser(existing._id, updates);
        console.log('✅ Default admin ensured (updated existing)');
      }
      return;
    }

    await createUser({
      email: DEFAULT_ADMIN_EMAIL.toLowerCase(),
      password: DEFAULT_ADMIN_PASSWORD,
      role: 'admin',
      emailVerified: true,
      isProvisional: false,
    });
    console.log('✅ Default admin created');
  } catch (error) {
    console.error('❌ Failed to ensure default admin', error);
  }
};
