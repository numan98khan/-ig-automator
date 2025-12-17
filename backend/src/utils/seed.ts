import Conversation from '../models/Conversation';
import Message from '../models/Message';

export const seedConversations = async (workspaceId: string, instagramAccountId: string) => {
  try {
    // Demo conversations
    const demoConversations = [
      {
        participantName: 'Sarah Johnson',
        participantHandle: '@sarah_j',
        messages: [
          { text: 'Hi! Do you offer international shipping?', from: 'customer' as const },
          { text: 'Yes, we do! We ship worldwide.', from: 'user' as const },
          { text: 'Great! How long does it usually take?', from: 'customer' as const },
          { text: 'Usually 7-14 business days depending on the destination.', from: 'user' as const },
        ],
      },
      {
        participantName: 'Mike Chen',
        participantHandle: '@mikechen',
        messages: [
          { text: 'What are your business hours?', from: 'customer' as const },
          { text: 'We\'re open Monday to Friday, 9 AM to 6 PM EST.', from: 'user' as const },
          { text: 'Perfect, thank you!', from: 'customer' as const },
        ],
      },
      {
        participantName: 'Emma Davis',
        participantHandle: '@emmadavis',
        messages: [
          { text: 'I love your products! Do you have a loyalty program?', from: 'customer' as const },
          { text: 'Thank you! Yes, we do. You earn points with every purchase.', from: 'user' as const },
          { text: 'How do I sign up?', from: 'customer' as const },
        ],
      },
      {
        participantName: 'Alex Rodriguez',
        participantHandle: '@alex_rod',
        messages: [
          { text: 'Hi, I have a question about my recent order #12345', from: 'customer' as const },
          { text: 'Hello! I\'d be happy to help. What\'s your question?', from: 'user' as const },
          { text: 'When will it be shipped?', from: 'customer' as const },
          { text: 'Let me check that for you. It should ship within 2 business days.', from: 'user' as const },
        ],
      },
      {
        participantName: 'Jessica Lee',
        participantHandle: '@jess_lee',
        messages: [
          { text: 'Do you accept returns?', from: 'customer' as const },
        ],
      },
    ];

    // Create conversations and messages
    for (const demo of demoConversations) {
      const conversation = await Conversation.create({
        participantName: demo.participantName,
        participantHandle: demo.participantHandle,
        workspaceId,
        instagramAccountId,
        lastMessageAt: new Date(),
      });

      // Create messages for this conversation
      for (const msg of demo.messages) {
        await Message.create({
          conversationId: conversation._id,
          workspaceId,
          text: msg.text,
          from: msg.from,
        });
      }
    }

    console.log('Demo conversations seeded successfully');
  } catch (error) {
    console.error('Error seeding conversations:', error);
    throw error;
  }
};
