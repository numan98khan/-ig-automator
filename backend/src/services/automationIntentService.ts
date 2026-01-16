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
    value: 'greeting',
    description:
      'Hello/hi/emoji-only or opening message with no clear request yet.',
  },
  {
    value: 'faq',
    description:
      'General store/service info: hours, location, services offered, pricing basics, policies, or how it works.',
  },
  {
    value: 'product_inquiry',
    description:
      'Asking about products/services: price, availability, sizes, colors, variants, materials, or options.',
  },
  {
    value: 'quote_request',
    description:
      'Requesting a quote/estimate for a specific job or custom requirement (often needs photos/sizes/scope).',
  },
  {
    value: 'book_appointment',
    description:
      'Scheduling or booking a service, appointment, visit, or measurement.',
  },
  {
    value: 'order_request',
    description:
      'Ready to buy now: proceed to checkout, place an order, reserve an item, confirm quantity/payment.',
  },
  {
    value: 'delivery_shipping',
    description:
      'Delivery/shipping questions: fees, areas covered, COD, delivery time/ETA, tracking method, logistics.',
  },
  {
    value: 'order_status',
    description:
      'Order tracking/status: where is my order, delivery updates, past order follow-up.',
  },
  {
    value: 'refund_return',
    description:
      'Refund, exchange, return, cancellation, replacement, or warranty requests.',
  },
  {
    value: 'support_issue',
    description:
      'Problems or complaints not covered above: damaged item, wrong item, service issue, payment issue, general support.',
  },
  {
    value: 'lead_capture',
    description:
      'Asking to be contacted or leaving contact details: request a call/WhatsApp/email, “contact me”, “call me”.',
  },
  {
    value: 'human_handoff',
    description:
      'Explicitly requesting a human/agent/representative or asking to switch to WhatsApp/call.',
  },
  {
    value: 'spam',
    description:
      'Spam/abuse/irrelevant promos, suspicious links, or attempts to exploit the bot.',
  },
  {
    value: 'other',
    description:
      'Does not clearly match any intent above; ambiguous or mixed message needing a clarifying question.',
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
