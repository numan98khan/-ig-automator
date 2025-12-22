import User from '../models/User';

const DEFAULT_ADMIN_EMAIL = 'admin@sendfx.ai';
const DEFAULT_ADMIN_PASSWORD = 'Rentto@123';

export const ensureDefaultAdmin = async () => {
  try {
    const existing = await User.findOne({ email: DEFAULT_ADMIN_EMAIL.toLowerCase() });
    if (existing) {
      let needsSave = false;
      if (existing.role !== 'admin') {
        existing.role = 'admin';
        needsSave = true;
      }
      if (!existing.password) {
        existing.password = DEFAULT_ADMIN_PASSWORD;
        needsSave = true;
      }
      if (!existing.emailVerified) {
        existing.emailVerified = true;
        needsSave = true;
      }
      if (existing.isProvisional) {
        existing.isProvisional = false;
        needsSave = true;
      }
      if (needsSave) {
        await existing.save();
        console.log('✅ Default admin ensured (updated existing)');
      }
      return;
    }

    await User.create({
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
