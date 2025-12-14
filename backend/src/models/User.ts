import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  instagramUserId?: string; // Instagram user ID for OAuth-only authentication
  instagramUsername?: string; // Instagram username
  isProvisional: boolean; // True if user created via Instagram only (no email/password yet)
  emailVerified: boolean; // True when email has been confirmed
  defaultWorkspaceId?: mongoose.Types.ObjectId; // Default workspace to open after login
  createdAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>({
  email: {
    type: String,
    unique: true,
    sparse: true, // Allow null/undefined while maintaining uniqueness
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
  },
  firstName: {
    type: String,
    trim: true,
  },
  lastName: {
    type: String,
    trim: true,
  },
  instagramUserId: {
    type: String,
    unique: true,
    sparse: true,
  },
  instagramUsername: {
    type: String,
  },
  isProvisional: {
    type: Boolean,
    default: true, // Default to true; becomes false after email/password setup
  },
  emailVerified: {
    type: Boolean,
    default: false,
  },
  defaultWorkspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method to compare password
userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model<IUser>('User', userSchema);
