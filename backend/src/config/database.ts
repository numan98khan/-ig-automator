import mongoose from 'mongoose';
import { requireEnv } from '../utils/requireEnv';

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(requireEnv('MONGODB_URI'));
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error}`);
    process.exit(1);
  }
};
