export type SimulationExpectation = {
  intent?: string
  mode?: 'intent' | 'info_desk'
  replyIncludes?: string[]
  replyExcludes?: string[]
  maxSentences?: number
  maxQuestions?: number
  allowNoReply?: boolean
}

export type SimulationMessage = {
  text: string
  expect?: SimulationExpectation
}

export type SimulationScenario = {
  id: string
  name: string
  messages: SimulationMessage[]
  persona?: {
    name: string
    handle?: string
    userId?: string
    avatarUrl?: string
  }
}

export type SimulationScenarioGroup = {
  id: string
  label: string
  description?: string
  scenarios: SimulationScenario[]
}

export const SIMULATION_SCENARIO_GROUPS: SimulationScenarioGroup[] = [
  {
    id: 'branches',
    label: 'Intent branches',
    description: 'Covers the detect-intent router branches for the info desk flow.',
    scenarios: [
      {
        id: 'branch-human-handoff',
        name: 'Human handoff request',
        messages: [
          {
            text: 'Can I talk to a human agent?',
            expect: {
              intent: 'human_handoff',
              mode: 'intent',
              replyIncludes: ['human required'],
              maxSentences: 2,
            },
          },
        ],
        persona: {
          name: 'Test Handoff',
          handle: '@handoff',
        },
      },
      {
        id: 'branch-refund',
        name: 'Refund request',
        messages: [
          {
            text: 'I need to return my order, it arrived damaged.',
            expect: {
              intent: 'refund_return',
              mode: 'intent',
            },
          },
        ],
        persona: {
          name: 'Test Refund',
          handle: '@refund',
        },
      },
      {
        id: 'branch-support',
        name: 'Support issue',
        messages: [
          {
            text: 'My order was the wrong size, can you fix this?',
            expect: {
              intent: 'support_issue',
              mode: 'intent',
            },
          },
        ],
        persona: {
          name: 'Test Support',
          handle: '@support',
        },
      },
      {
        id: 'branch-order-status',
        name: 'Order status request',
        messages: [
          {
            text: 'Where is my order? It has been a week.',
            expect: {
              intent: 'order_status',
              mode: 'intent',
            },
          },
        ],
        persona: {
          name: 'Test Order Status',
          handle: '@orderstatus',
        },
      },
      {
        id: 'branch-order-request',
        name: 'Order placement request',
        messages: [
          {
            text: "I'd like to place an order for two items.",
            expect: {
              intent: 'order_request',
              mode: 'intent',
            },
          },
        ],
        persona: {
          name: 'Test Order Request',
          handle: '@orderrequest',
        },
      },
      {
        id: 'branch-booking',
        name: 'Booking request',
        messages: [
          {
            text: 'Can I book an appointment for next week?',
            expect: {
              intent: 'book_appointment',
              mode: 'intent',
            },
          },
        ],
        persona: {
          name: 'Test Booking',
          handle: '@booking',
        },
      },
    ],
  },
  {
    id: 'faq',
    label: 'FAQ',
    description: 'General info desk questions plus a burst-message test.',
    scenarios: [
      {
        id: 'faq-hours',
        name: 'Info desk FAQ',
        messages: [
          {
            text: 'What are your opening hours today?',
            expect: {
              mode: 'info_desk',
              maxSentences: 2,
              maxQuestions: 1,
              replyExcludes: ['bot', 'automation', 'workflow'],
            },
          },
        ],
        persona: {
          name: 'Test FAQ',
          handle: '@faq',
        },
      },
      {
        id: 'faq-hours-location',
        name: 'FAQ hours and location',
        messages: [
          {
            text: 'What time do you open and where are you located?',
            expect: {
              mode: 'info_desk',
              maxSentences: 2,
              maxQuestions: 1,
              replyExcludes: ['bot', 'automation', 'workflow'],
            },
          },
        ],
        persona: {
          name: 'Test Hours Location',
          handle: '@hourslocation',
        },
      },
      {
        id: 'faq-delivery',
        name: 'FAQ delivery area',
        messages: [
          {
            text: 'Do you deliver to downtown and nearby suburbs?',
            expect: {
              mode: 'info_desk',
              maxSentences: 2,
              maxQuestions: 1,
              replyExcludes: ['bot', 'automation', 'workflow'],
            },
          },
        ],
        persona: {
          name: 'Test Delivery',
          handle: '@delivery',
        },
      },
      {
        id: 'faq-payments',
        name: 'FAQ payment methods',
        messages: [
          {
            text: 'What payment methods do you accept?',
            expect: {
              mode: 'info_desk',
              maxSentences: 2,
              maxQuestions: 1,
              replyExcludes: ['bot', 'automation', 'workflow'],
            },
          },
        ],
        persona: {
          name: 'Test Payments',
          handle: '@payments',
        },
      },
      {
        id: 'faq-pricing',
        name: 'FAQ pricing basics',
        messages: [
          {
            text: 'What is the price range for your services?',
            expect: {
              mode: 'info_desk',
              maxSentences: 2,
              maxQuestions: 1,
              replyExcludes: ['bot', 'automation', 'workflow'],
            },
          },
        ],
        persona: {
          name: 'Test Pricing',
          handle: '@pricing',
        },
      },
      {
        id: 'faq-walkins',
        name: 'FAQ walk-ins',
        messages: [
          {
            text: 'Do I need an appointment or can I walk in?',
            expect: {
              mode: 'info_desk',
              maxSentences: 2,
              maxQuestions: 1,
              replyExcludes: ['bot', 'automation', 'workflow'],
            },
          },
        ],
        persona: {
          name: 'Test Walkins',
          handle: '@walkins',
        },
      },
      {
        id: 'faq-roman-urdu',
        name: 'FAQ roman urdu',
        messages: [
          {
            text: 'aap ke hours kya hain aur location kahan hai?',
            expect: {
              mode: 'info_desk',
              maxSentences: 2,
              maxQuestions: 1,
              replyExcludes: ['bot', 'automation', 'workflow'],
            },
          },
        ],
        persona: {
          name: 'Test Roman Urdu',
          handle: '@romanurdu',
        },
      },
      {
        id: 'faq-multi',
        name: 'FAQ multiple questions',
        messages: [
          {
            text: 'What are your hours, location, and delivery fees?',
            expect: {
              mode: 'info_desk',
              maxSentences: 2,
              maxQuestions: 1,
              replyExcludes: ['bot', 'automation', 'workflow'],
            },
          },
        ],
        persona: {
          name: 'Test Multiple Questions',
          handle: '@multi',
        },
      },
      {
        id: 'faq-burst',
        name: 'FAQ burst messages',
        messages: [
          {
            text: 'Hi',
            expect: {
              allowNoReply: true,
            },
          },
          {
            text: 'Are you open today?',
            expect: {
              allowNoReply: true,
            },
          },
          {
            text: 'Also what is your address?',
            expect: {
              mode: 'info_desk',
              maxSentences: 2,
              maxQuestions: 1,
              replyExcludes: ['bot', 'automation', 'workflow'],
            },
          },
        ],
        persona: {
          name: 'Test Burst',
          handle: '@burst',
        },
      },
    ],
  },
  {
    id: 'history',
    label: 'History',
    description: 'Multi-turn conversations to test memory and follow-ups.',
    scenarios: [
      {
        id: 'history-hours-location',
        name: 'History follow-up hours location',
        messages: [
          {
            text: 'What are your hours today?',
            expect: {
              mode: 'info_desk',
              maxSentences: 2,
              maxQuestions: 1,
              replyExcludes: ['bot', 'automation', 'workflow'],
            },
          },
          {
            text: 'Thanks. And where are you located?',
            expect: {
              mode: 'info_desk',
              maxSentences: 2,
              maxQuestions: 1,
              replyExcludes: ['bot', 'automation', 'workflow'],
            },
          },
          {
            text: 'Is that close to downtown?',
            expect: {
              mode: 'info_desk',
              maxSentences: 2,
              maxQuestions: 1,
              replyExcludes: ['bot', 'automation', 'workflow'],
            },
          },
        ],
        persona: {
          name: 'Test History Hours',
          handle: '@historyhours',
        },
      },
      {
        id: 'history-delivery',
        name: 'History delivery follow-up',
        messages: [
          {
            text: 'Do you deliver to DHA?',
            expect: {
              mode: 'info_desk',
              maxSentences: 2,
              maxQuestions: 1,
              replyExcludes: ['bot', 'automation', 'workflow'],
            },
          },
          {
            text: 'Great. What about Clifton?',
            expect: {
              mode: 'info_desk',
              maxSentences: 2,
              maxQuestions: 1,
              replyExcludes: ['bot', 'automation', 'workflow'],
            },
          },
          {
            text: 'Earlier I asked about delivery. Any delivery fees?',
            expect: {
              mode: 'info_desk',
              maxSentences: 2,
              maxQuestions: 1,
              replyExcludes: ['bot', 'automation', 'workflow'],
            },
          },
        ],
        persona: {
          name: 'Test History Delivery',
          handle: '@historydelivery',
        },
      },
      {
        id: 'history-payments',
        name: 'History payment follow-up',
        messages: [
          {
            text: 'Do you accept card payments?',
            expect: {
              mode: 'info_desk',
              maxSentences: 2,
              maxQuestions: 1,
              replyExcludes: ['bot', 'automation', 'workflow'],
            },
          },
          {
            text: 'Okay, do you also accept cash on delivery?',
            expect: {
              mode: 'info_desk',
              maxSentences: 2,
              maxQuestions: 1,
              replyExcludes: ['bot', 'automation', 'workflow'],
            },
          },
          {
            text: 'Any extra fees for cash on delivery?',
            expect: {
              mode: 'info_desk',
              maxSentences: 2,
              maxQuestions: 1,
              replyExcludes: ['bot', 'automation', 'workflow'],
            },
          },
        ],
        persona: {
          name: 'Test History Payments',
          handle: '@historypayments',
        },
      },
      {
        id: 'history-roman-urdu',
        name: 'History roman urdu follow-up',
        messages: [
          {
            text: 'aap ke hours kya hain?',
            expect: {
              mode: 'info_desk',
              maxSentences: 2,
              maxQuestions: 1,
              replyExcludes: ['bot', 'automation', 'workflow'],
            },
          },
          {
            text: 'theek hai, location bhi bata dein',
            expect: {
              mode: 'info_desk',
              maxSentences: 2,
              maxQuestions: 1,
              replyExcludes: ['bot', 'automation', 'workflow'],
            },
          },
          {
            text: 'wahi location jo pehle batayi thi?',
            expect: {
              mode: 'info_desk',
              maxSentences: 2,
              maxQuestions: 1,
              replyExcludes: ['bot', 'automation', 'workflow'],
            },
          },
        ],
        persona: {
          name: 'Test History Roman Urdu',
          handle: '@historyromanurdu',
        },
      },
      {
        id: 'history-blinds-consult',
        name: 'History blinds consult',
        messages: [
          {
            text: 'Hi, I need blinds for my living room. The window is 6 ft wide and 5 ft tall. Do you install?',
            expect: {
              mode: 'info_desk',
              maxSentences: 2,
              maxQuestions: 1,
              replyExcludes: ['bot', 'automation', 'workflow'],
            },
          },
          {
            text: 'I want blackout and white. What is best for heat and privacy?',
            expect: {
              mode: 'info_desk',
              maxSentences: 2,
              maxQuestions: 1,
              replyExcludes: ['bot', 'automation', 'workflow'],
            },
          },
          {
            text: 'Earlier I said 6 ft by 5 ft. Would roller blinds fit that?',
            expect: {
              mode: 'info_desk',
              maxSentences: 2,
              maxQuestions: 1,
              replyExcludes: ['bot', 'automation', 'workflow'],
            },
          },
          {
            text: 'Can you give me a quote for that?',
            expect: {
              mode: 'info_desk',
              maxSentences: 2,
              maxQuestions: 1,
              replyExcludes: ['bot', 'automation', 'workflow'],
            },
          },
        ],
        persona: {
          name: 'Test History Blinds',
          handle: '@historyblinds',
        },
      },
      {
        id: 'history-blinds-safety',
        name: 'History blinds safety',
        messages: [
          {
            text: 'We have kids at home. Do you offer cordless blinds?',
            expect: {
              mode: 'info_desk',
              maxSentences: 2,
              maxQuestions: 1,
              replyExcludes: ['bot', 'automation', 'workflow'],
            },
          },
          {
            text: 'Are cordless options more expensive? I just want a ballpark.',
            expect: {
              mode: 'info_desk',
              maxSentences: 2,
              maxQuestions: 1,
              replyExcludes: ['bot', 'automation', 'workflow'],
            },
          },
          {
            text: 'I prefer faux wood in the bedroom. Do they handle humidity?',
            expect: {
              mode: 'info_desk',
              maxSentences: 2,
              maxQuestions: 1,
              replyExcludes: ['bot', 'automation', 'workflow'],
            },
          },
          {
            text: 'Earlier I mentioned kids. Which option is safest?',
            expect: {
              mode: 'info_desk',
              maxSentences: 2,
              maxQuestions: 1,
              replyExcludes: ['bot', 'automation', 'workflow'],
            },
          },
        ],
        persona: {
          name: 'Test History Safety',
          handle: '@historysafety',
        },
      },
      {
        id: 'history-blinds-multi-room',
        name: 'History blinds multi-room',
        messages: [
          {
            text: 'I need blinds for two rooms: master and office. Office is 4 ft wide, master is 7 ft wide.',
            expect: {
              mode: 'info_desk',
              maxSentences: 2,
              maxQuestions: 1,
              replyExcludes: ['bot', 'automation', 'workflow'],
            },
          },
          {
            text: 'Can the office be zebra and master be blackout?',
            expect: {
              mode: 'info_desk',
              maxSentences: 2,
              maxQuestions: 1,
              replyExcludes: ['bot', 'automation', 'workflow'],
            },
          },
          {
            text: 'Do you remember the office width? Would zebra fit that size?',
            expect: {
              mode: 'info_desk',
              maxSentences: 2,
              maxQuestions: 1,
              replyExcludes: ['bot', 'automation', 'workflow'],
            },
          },
          {
            text: 'If I decide to book an installation, what is next?',
            expect: {
              mode: 'info_desk',
              maxSentences: 2,
              maxQuestions: 1,
              replyExcludes: ['bot', 'automation', 'workflow'],
            },
          },
        ],
        persona: {
          name: 'Test History Multi Room',
          handle: '@historymulti',
        },
      },
    ],
  },
]
