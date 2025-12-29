export type GoalType =
  | 'none'
  | 'capture_lead'
  | 'book_appointment'
  | 'order_now'
  | 'product_inquiry'
  | 'delivery'
  | 'order_status'
  | 'refund_exchange'
  | 'human'
  | 'handle_support'
  ;

export interface LeadCaptureConfig {
  collectName: boolean;
  collectPhone: boolean;
  collectEmail: boolean;
  collectCustomNote: boolean;
}

export interface BookingGoalConfig {
  bookingLink?: string;
  collectDate: boolean;
  collectTime: boolean;
  collectServiceType: boolean;
}

export interface OrderGoalConfig {
  catalogUrl?: string;
  collectProductName: boolean;
  collectQuantity: boolean;
  collectVariant: boolean;
}

export interface SupportGoalConfig {
  askForOrderId: boolean;
  askForPhoto: boolean;
}

export type DriveTargetType = 'website' | 'WhatsApp' | 'store' | 'app';

export interface DriveGoalConfig {
  targetType: DriveTargetType;
  targetLink?: string;
}

export interface GoalConfigurations {
  leadCapture: LeadCaptureConfig;
  booking: BookingGoalConfig;
  order: OrderGoalConfig;
  support: SupportGoalConfig;
  drive: DriveGoalConfig;
}

export interface GoalProgressState {
  goalType?: GoalType;
  status?: 'idle' | 'collecting' | 'completed';
  collectedFields?: Record<string, any>;
  summary?: string;
  nextStep?: string;
  shouldCreateRecord?: boolean;
  targetLink?: string;
}
