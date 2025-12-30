import AutomationIntent from '../models/AutomationIntent';

export type AutomationIntentDefinition = {
  value: string;
  description: string;
};

export type AutomationIntentRecord = AutomationIntentDefinition & {
  _id?: any;
  createdAt?: Date;
  updatedAt?: Date;
};

export const DEFAULT_AUTOMATION_INTENTS: AutomationIntentDefinition[] = [
  {
    value: 'product_inquiry',
    description: 'Asking about price, availability, sizes, colors, or variants.',
  },
  {
    value: 'delivery',
    description: 'Shipping, COD, delivery time, ETA, or logistics questions.',
  },
  {
    value: 'order_now',
    description: 'Ready to buy now, proceed to checkout, or place an order.',
  },
  {
    value: 'order_status',
    description: 'Order tracking, status, where is my order, or past order update.',
  },
  {
    value: 'refund_exchange',
    description: 'Refund, exchange, return, or replacement requests.',
  },
  {
    value: 'human',
    description: 'Asking for a human agent, representative, or handoff.',
  },
  {
    value: 'handle_support',
    description: 'Problems, complaints, cancellations, or support requests not covered above.',
  },
  {
    value: 'capture_lead',
    description: 'Asking for a quote, requesting a call/email, or leaving contact details.',
  },
  {
    value: 'book_appointment',
    description: 'Scheduling or booking a service, appointment, or reservation.',
  },
  {
    value: 'none',
    description: 'Greeting, unclear, or does not match any intent.',
  },
];

export async function listAutomationIntents(): Promise<AutomationIntentRecord[]> {
  let intents = await AutomationIntent.find({}).sort({ value: 1 }).lean();
  if (intents.length > 0) return intents;

  try {
    await AutomationIntent.insertMany(DEFAULT_AUTOMATION_INTENTS, { ordered: false });
  } catch (error: any) {
    if (error?.code !== 11000) {
      console.warn('Failed to seed automation intents:', error?.message || error);
    }
  }

  intents = await AutomationIntent.find({}).sort({ value: 1 }).lean();
  return intents;
}

export async function listAutomationIntentLabels(): Promise<AutomationIntentDefinition[]> {
  const intents = await listAutomationIntents();
  return intents.map((intent) => ({
    value: String(intent.value || '').trim(),
    description: String(intent.description || '').trim(),
  })).filter((intent) => intent.value);
}
