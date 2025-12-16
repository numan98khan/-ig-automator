import mongoose, { Document, Schema } from 'mongoose';

export interface IBookingRequest extends Document {
  workspaceId: mongoose.Types.ObjectId;
  conversationId: mongoose.Types.ObjectId;
  bookingLink?: string;
  date?: string;
  time?: string;
  serviceType?: string;
  summary?: string;
  createdAt: Date;
  updatedAt: Date;
}

const bookingRequestSchema = new Schema<IBookingRequest>({
  workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
  bookingLink: { type: String },
  date: { type: String },
  time: { type: String },
  serviceType: { type: String },
  summary: { type: String },
}, { timestamps: true });

export default mongoose.model<IBookingRequest>('BookingRequest', bookingRequestSchema);
