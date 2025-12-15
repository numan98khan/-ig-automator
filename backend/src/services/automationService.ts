import mongoose from 'mongoose';
import WorkspaceSettings from '../models/WorkspaceSettings';
import MessageCategory from '../models/MessageCategory';
import Message from '../models/Message';
import Conversation from '../models/Conversation';
import InstagramAccount from '../models/InstagramAccount';
import CommentDMLog from '../models/CommentDMLog';
import FollowupTask from '../models/FollowupTask';
import {
  sendMessage as sendInstagramMessage,
  sendCommentReply,
} from '../utils/instagram-api';
import {
  categorizeMessage,
  getOrCreateCategory,
  incrementCategoryCount,
} from './aiCategorization';
import { generateAIReply } from './aiReplyService';
import { getActiveTicket, createTicket, addTicketUpdate } from './escalationService';

/**
 * Get or create workspace settings
 */
export async function getWorkspaceSettings(
  workspaceId: mongoose.Types.ObjectId | string
): Promise<any> {
  let settings = await WorkspaceSettings.findOne({ workspaceId });

  if (!settings) {
    settings = await WorkspaceSettings.create({ workspaceId });
  }

  return settings;
}

/**
 * Feature 1: Comment → DM Automation
 * Send DM to user who commented on a post
 */
export async function processCommentDMAutomation(
  comment: {
    commentId: string;
    commenterId: string;
    commenterUsername?: string;
    commentText: string;
    mediaId: string;
  },
  instagramAccountId: mongoose.Types.ObjectId | string,
  workspaceId: mongoose.Types.ObjectId | string
): Promise<{ success: boolean; message: string; dmMessageId?: string }> {
  try {
    // Check if comment was already processed
    const existingLog = await CommentDMLog.findOne({ commentId: comment.commentId });
    if (existingLog) {
      return { success: false, message: 'Comment already processed' };
    }

    // Get workspace settings
    const settings = await getWorkspaceSettings(workspaceId);

    // Check if comment DM automation is enabled
    if (!settings.commentDmEnabled) {
      // Log as skipped
      await CommentDMLog.create({
        workspaceId,
        instagramAccountId,
        commentId: comment.commentId,
        commenterId: comment.commenterId,
        commenterUsername: comment.commenterUsername,
        commentText: comment.commentText,
        mediaId: comment.mediaId,
        status: 'skipped',
        processedAt: new Date(),
      });
      return { success: false, message: 'Comment DM automation is disabled' };
    }

    // Get Instagram account with access token
    const igAccount = await InstagramAccount.findById(instagramAccountId).select('+accessToken');
    if (!igAccount || !igAccount.accessToken) {
      throw new Error('Instagram account not found or no access token');
    }

    // Create log entry as pending
    const logEntry = await CommentDMLog.create({
      workspaceId,
      instagramAccountId,
      commentId: comment.commentId,
      commenterId: comment.commenterId,
      commenterUsername: comment.commenterUsername,
      commentText: comment.commentText,
      mediaId: comment.mediaId,
      status: 'pending',
    });

    try {
      // Send DM using comment reply API (this works for comment DMs)
      const result = await sendCommentReply(
        igAccount.instagramAccountId!,
        comment.commentId,
        settings.commentDmTemplate,
        igAccount.accessToken!
      );

      // Update log entry with success
      logEntry.dmSent = true;
      logEntry.dmMessageId = result.message_id;
      logEntry.dmText = settings.commentDmTemplate;
      logEntry.status = 'sent';
      logEntry.processedAt = new Date();
      await logEntry.save();

      // Get or create conversation with commenter and save the DM as a message
      let conversation = await Conversation.findOne({
        instagramAccountId: igAccount._id,
        participantInstagramId: comment.commenterId,
      });

      if (!conversation) {
        conversation = await Conversation.create({
          workspaceId,
          instagramAccountId: igAccount._id,
          participantName: comment.commenterUsername || 'Unknown User',
          participantHandle: `@${comment.commenterUsername || 'unknown'}`,
          participantInstagramId: comment.commenterId,
          instagramConversationId: `${igAccount.instagramAccountId}_${comment.commenterId}`,
          platform: 'instagram',
          lastMessageAt: new Date(),
          lastMessage: settings.commentDmTemplate,
          lastBusinessMessageAt: new Date(),
        });
      } else {
        conversation.lastMessageAt = new Date();
        conversation.lastMessage = settings.commentDmTemplate;
        conversation.lastBusinessMessageAt = new Date();
        await conversation.save();
      }

      // Save the DM as a message in the conversation
      await Message.create({
        conversationId: conversation._id,
        text: settings.commentDmTemplate,
        from: 'ai',
        platform: 'instagram',
        instagramMessageId: result.message_id,
        automationSource: 'comment_dm',
      });

      return {
        success: true,
        message: 'DM sent successfully',
        dmMessageId: result.message_id,
      };
    } catch (sendError: any) {
      // Update log entry with failure
      logEntry.status = 'failed';
      logEntry.errorMessage = sendError.message;
      logEntry.processedAt = new Date();
      await logEntry.save();

      throw sendError;
    }
  } catch (error: any) {
    console.error('Error processing comment DM automation:', error);
    return {
      success: false,
      message: `Failed to send DM: ${error.message}`,
    };
  }
}

/**
 * Feature 2: Inbound DM Auto-Reply
 * Process incoming DM and send AI-generated reply
 */
export async function processAutoReply(
  conversationId: mongoose.Types.ObjectId | string,
  messageText: string,
  workspaceId: mongoose.Types.ObjectId | string
): Promise<{
  success: boolean;
  message: string;
  reply?: string;
  categoryId?: mongoose.Types.ObjectId;
  detectedLanguage?: string;
}> {
  try {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return { success: false, message: 'Conversation not found' };
    }

    // Check if auto-reply is disabled for this conversation
    if (conversation.autoReplyDisabled) {
      return { success: false, message: 'Auto-reply disabled for this conversation' };
    }

    // Get workspace settings
    const settings = await getWorkspaceSettings(workspaceId);

    // Check if DM auto-reply is enabled
    if (!settings.dmAutoReplyEnabled) {
      return { success: false, message: 'DM auto-reply is disabled' };
    }

    // Get Instagram account
    const igAccount = await InstagramAccount.findById(conversation.instagramAccountId).select('+accessToken');
    if (!igAccount || !igAccount.accessToken) {
      return { success: false, message: 'Instagram account not found' };
    }

    // Categorize the message
    const categorization = await categorizeMessage(messageText, workspaceId);

    // Get or create category
    const categoryId = await getOrCreateCategory(workspaceId, categorization.categoryName);

    // Increment category count
    await incrementCategoryCount(categoryId);

    const activeTicket = await getActiveTicket(conversation._id);
    const sameTopicTicket =
      activeTicket &&
      activeTicket.categoryId &&
      categoryId &&
      activeTicket.categoryId.toString() === categoryId.toString();

    // Check if auto-reply is enabled for this category
    const category = await MessageCategory.findById(categoryId);
    if (category && !category.autoReplyEnabled) {
      return {
        success: false,
        message: 'Auto-reply disabled for this category',
        categoryId,
        detectedLanguage: categorization.detectedLanguage,
      };
    }

    // Build AI context
    const aiReply = await generateAIReply({
      conversation,
      workspaceId,
      latestCustomerMessage: messageText,
      categoryId,
      categorization,
      historyLimit: 10,
    });

    if (!aiReply) {
      return {
        success: false,
        message: 'Failed to generate reply',
        categoryId,
        detectedLanguage: categorization.detectedLanguage,
      };
    }

    // If existing ticket for same topic, force follow-up behavior
    if (sameTopicTicket) {
      aiReply.shouldEscalate = true;
      aiReply.escalationReason = aiReply.escalationReason || activeTicket.reason || 'Escalation pending';
      aiReply.replyText = buildFollowupResponse(activeTicket.followUpCount || 0, aiReply.replyText);
      await addTicketUpdate(activeTicket._id, { from: 'customer', text: messageText });
    } else if (activeTicket && !sameTopicTicket) {
      // New topic while escalation pending: keep helping but remind briefly
      aiReply.replyText = appendPendingNote(aiReply.replyText);
    } else if (aiReply.shouldEscalate) {
      aiReply.replyText = buildInitialEscalationReply(aiReply.replyText);
    }

    // If AI wants escalation and no ticket exists, create one
    let escalationId: mongoose.Types.ObjectId | undefined;
    if (aiReply.shouldEscalate && !sameTopicTicket) {
      const ticket = await createTicket({
        conversationId: conversation._id,
        categoryId,
        topicSummary: (aiReply.escalationReason || messageText).slice(0, 140),
        reason: aiReply.escalationReason || 'Escalated by AI',
        createdBy: 'ai',
        customerMessage: messageText,
      });
      escalationId = ticket._id as mongoose.Types.ObjectId;
      conversation.humanRequired = true;
      conversation.humanRequiredReason = ticket.reason;
      conversation.humanTriggeredAt = ticket.createdAt;
      conversation.humanTriggeredByMessageId = undefined;
      conversation.humanHoldUntil = settings.humanEscalationBehavior === 'ai_silent'
        ? new Date(Date.now() + (settings.humanHoldMinutes || 60) * 60 * 1000)
        : undefined;
    }

    // Send the reply via Instagram API
    const result = await sendInstagramMessage(
      conversation.participantInstagramId!,
      aiReply.replyText,
      igAccount.accessToken
    );

    if (!result || (!result.message_id && !result.recipient_id)) {
      return {
        success: false,
        message: 'Failed to send reply to Instagram',
        categoryId,
        detectedLanguage: categorization.detectedLanguage,
      };
    }

    // Save the reply as a message
    const savedMessage = await Message.create({
      conversationId: conversation._id,
      text: aiReply.replyText,
      from: 'ai',
      platform: 'instagram',
      instagramMessageId: result.message_id,
      automationSource: 'auto_reply',
      aiTags: aiReply.tags,
      aiShouldEscalate: aiReply.shouldEscalate,
      aiEscalationReason: aiReply.escalationReason,
    });

    if (sameTopicTicket && activeTicket) {
      await addTicketUpdate(activeTicket._id, { from: 'ai', text: aiReply.replyText, messageId: savedMessage._id });
    } else if (escalationId) {
      await addTicketUpdate(escalationId, { from: 'ai', text: aiReply.replyText, messageId: savedMessage._id });
    }

    // Update conversation
    conversation.lastMessageAt = new Date();
    conversation.lastMessage = aiReply.replyText;
    conversation.lastBusinessMessageAt = new Date();
    if (aiReply.shouldEscalate) {
      const holdMinutes = settings.humanHoldMinutes || 60;
      conversation.humanRequired = true;
      conversation.humanRequiredReason = aiReply.escalationReason || 'Escalation requested by AI';
      conversation.humanTriggeredAt = new Date();
      conversation.humanTriggeredByMessageId = savedMessage._id;
      conversation.humanHoldUntil =
        settings.humanEscalationBehavior === 'ai_silent'
          ? new Date(Date.now() + holdMinutes * 60 * 1000)
          : undefined;
    }
    await conversation.save();

    return {
      success: true,
      message: 'Auto-reply sent successfully',
      reply: aiReply.replyText,
      categoryId,
      detectedLanguage: categorization.detectedLanguage,
    };
  } catch (error: any) {
    console.error('Error processing auto-reply:', error);
    return {
      success: false,
      message: `Auto-reply failed: ${error.message}`,
    };
  }
}

/**
 * Feature 3: 24h Follow-up Automation
 * Schedule or send follow-up messages
 */
export async function scheduleFollowup(
  conversationId: mongoose.Types.ObjectId | string,
  workspaceId: mongoose.Types.ObjectId | string
): Promise<{ success: boolean; message: string; taskId?: mongoose.Types.ObjectId }> {
  try {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return { success: false, message: 'Conversation not found' };
    }

    // Get workspace settings
    const settings = await getWorkspaceSettings(workspaceId);

    if (!settings.followupEnabled) {
      return { success: false, message: 'Follow-up automation is disabled' };
    }

    // Cancel any existing scheduled follow-ups for this conversation
    await FollowupTask.updateMany(
      {
        conversationId,
        status: 'scheduled',
      },
      { status: 'cancelled' }
    );

    // Calculate timing
    const lastCustomerMessageAt = conversation.lastCustomerMessageAt || conversation.createdAt;
    const windowExpiresAt = new Date(lastCustomerMessageAt.getTime() + 24 * 60 * 60 * 1000);
    const hoursBeforeExpiry = settings.followupHoursBeforeExpiry || 2;
    const scheduledFollowupAt = new Date(windowExpiresAt.getTime() - hoursBeforeExpiry * 60 * 60 * 1000);

    // Don't schedule if follow-up time is in the past
    if (scheduledFollowupAt <= new Date()) {
      return { success: false, message: 'Follow-up time would be in the past' };
    }

    // Create follow-up task
    const task = await FollowupTask.create({
      workspaceId,
      conversationId: conversation._id,
      instagramAccountId: conversation.instagramAccountId,
      participantInstagramId: conversation.participantInstagramId,
      lastCustomerMessageAt,
      lastBusinessMessageAt: conversation.lastBusinessMessageAt,
      windowExpiresAt,
      scheduledFollowupAt,
      status: 'scheduled',
    });

    return {
      success: true,
      message: `Follow-up scheduled for ${scheduledFollowupAt.toISOString()}`,
      taskId: task._id as mongoose.Types.ObjectId,
    };
  } catch (error: any) {
    console.error('Error scheduling follow-up:', error);
    return { success: false, message: `Failed to schedule follow-up: ${error.message}` };
  }
}

/**
 * Process due follow-up tasks
 * This should be called by a background job
 */
export async function processDueFollowups(): Promise<{
  processed: number;
  sent: number;
  failed: number;
  cancelled: number;
}> {
  const stats = { processed: 0, sent: 0, failed: 0, cancelled: 0 };

  try {
    // Find all scheduled follow-ups that are due
    const dueTasks = await FollowupTask.find({
      status: 'scheduled',
      scheduledFollowupAt: { $lte: new Date() },
    });

    for (const task of dueTasks) {
      stats.processed++;

      try {
        // Get conversation to check if customer replied
        const conversation = await Conversation.findById(task.conversationId);
        if (!conversation) {
          task.status = 'cancelled';
          task.errorMessage = 'Conversation not found';
          await task.save();
          stats.cancelled++;
          continue;
        }

        // Check if customer replied since we scheduled
        const customerMessageSince = await Message.findOne({
          conversationId: task.conversationId,
          from: 'customer',
          createdAt: { $gt: task.lastCustomerMessageAt },
        });

        if (customerMessageSince) {
          task.status = 'customer_replied';
          await task.save();
          stats.cancelled++;
          continue;
        }

        // Check if window expired
        if (new Date() > task.windowExpiresAt) {
          task.status = 'expired';
          await task.save();
          stats.cancelled++;
          continue;
        }

        // Get workspace settings for template
        const settings = await getWorkspaceSettings(task.workspaceId);

        // Get Instagram account
        const igAccount = await InstagramAccount.findById(task.instagramAccountId).select('+accessToken');
        if (!igAccount || !igAccount.accessToken) {
          task.status = 'cancelled';
          task.errorMessage = 'Instagram account not found';
          await task.save();
          stats.cancelled++;
          continue;
        }

        // Send follow-up message
        const result = await sendInstagramMessage(
          task.participantInstagramId,
          settings.followupTemplate,
          igAccount.accessToken
        );

        if (!result || (!result.message_id && !result.recipient_id)) {
          task.status = 'cancelled';
          task.errorMessage = 'Failed to send message';
          await task.save();
          stats.failed++;
          continue;
        }

        // Save the follow-up as a message
        await Message.create({
          conversationId: conversation._id,
          text: settings.followupTemplate,
          from: 'ai',
          platform: 'instagram',
          instagramMessageId: result.message_id,
          automationSource: 'followup',
        });

        // Update conversation
        conversation.lastMessageAt = new Date();
        conversation.lastMessage = settings.followupTemplate;
        conversation.lastBusinessMessageAt = new Date();
        await conversation.save();

        // Update task
        task.status = 'sent';
        task.followupMessageId = result.message_id;
        task.followupText = settings.followupTemplate;
        task.sentAt = new Date();
        await task.save();

        stats.sent++;
      } catch (taskError: any) {
        console.error(`Error processing follow-up task ${task._id}:`, taskError);
        task.status = 'cancelled';
        task.errorMessage = taskError.message;
        await task.save();
        stats.failed++;
      }
    }

    console.log(`Follow-up processing complete: ${JSON.stringify(stats)}`);
    return stats;
  } catch (error) {
    console.error('Error processing due follow-ups:', error);
    return stats;
  }
}

/**
 * Cancel follow-up when customer replies
 */
export async function cancelFollowupOnCustomerReply(
  conversationId: mongoose.Types.ObjectId | string
): Promise<void> {
  await FollowupTask.updateMany(
    {
      conversationId,
      status: 'scheduled',
    },
    { status: 'customer_replied' }
  );
}

/**
 * Generate varied responses for follow-up messages on the same escalated topic
 * Uses different phrasing each time to avoid sounding robotic
 */
function buildFollowupResponse(followUpCount: number, base: string): string {
  // If the AI generated a specific response, use it
  if (base && base.trim().length > 20) {
    return base;
  }

  // Otherwise, use varied templates that acknowledge the wait without making commitments
  const templates = [
    'I understand you\'re waiting on this. The request is with the team and they\'ll respond with the specific details. In the meantime, I can help clarify anything or answer other questions.',
    'Your request is still being reviewed by the team. They\'re the ones who can give you a definitive answer on this. Is there any additional information I can note for them?',
    'The team has this flagged and will get back to you. I can\'t make commitments on their behalf, but I\'m here if you have other questions or want to add more details for them to consider.',
    'Still with the team for review. They\'ll reach out directly about this specific matter. Let me know if there\'s anything else I can help with in the meantime.',
  ];

  // Rotate through templates based on follow-up count
  const variant = templates[followUpCount % templates.length];
  return variant;
}

/**
 * Generate initial escalation message - varies based on context
 */
function buildInitialEscalationReply(base: string): string {
  // If AI generated a good escalation response, use it
  if (base && base.trim().length > 20) {
    return base;
  }

  // Generic fallback if AI didn't provide one
  const templates = [
    'This is something a team member needs to review personally, so I\'ve flagged it for them. They\'ll get back to you with the exact details. I\'m here to help with any general questions in the meantime.',
    'I\'ve forwarded this to the team for review. They\'ll be able to give you a proper answer on this. Feel free to ask me anything else while you wait.',
    'A team member will handle this one directly and follow up with you. I can\'t make decisions on this, but I can help with other questions if you have any.',
  ];

  // Random selection for variety
  const index = Math.floor(Math.random() * templates.length);
  return templates[index];
}

/**
 * Append a brief note about pending escalation when customer asks about a different topic
 */
function appendPendingNote(reply: string): string {
  const notes = [
    'Your earlier request is still with the team and they\'ll respond separately.',
    'By the way, the team is still reviewing your other question and will get back to you.',
    'Just so you know, your previous request is with a team member who will follow up.',
  ];

  // Check if reply already mentions the pending item
  const mentionsPending = reply.toLowerCase().includes('earlier') ||
                         reply.toLowerCase().includes('previous') ||
                         reply.toLowerCase().includes('other question') ||
                         reply.toLowerCase().includes('team');

  if (mentionsPending) {
    return reply; // Don't add redundant note
  }

  // Add a brief note
  const note = notes[0]; // Use first variant for consistency
  return `${reply} ${note}`.trim();
}
