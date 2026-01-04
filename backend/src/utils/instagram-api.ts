import axios from 'axios';
import { webhookLogger } from './webhook-logger';

/**
 * Instagram Graph API v24 Service
 * Handles all Instagram Graph API interactions
 */

const API_VERSION = 'v24.0';
const BASE_URL = `https://graph.instagram.com/${API_VERSION}`;
const FB_GRAPH_URL = `https://graph.facebook.com/${API_VERSION}`;
const TEST_ACCESS_TOKEN_PREFIX = 'test_';
const MOCK_INSTAGRAM_ACCOUNT_PREFIX = 'test_ig_';

function shouldStubSend(accessToken?: string, instagramAccountId?: string): boolean {
  return !!accessToken && accessToken.startsWith(TEST_ACCESS_TOKEN_PREFIX)
    || !!instagramAccountId && instagramAccountId.startsWith(MOCK_INSTAGRAM_ACCOUNT_PREFIX);
}

function buildTestResponse(recipientId: string) {
  return {
    message_id: `test_msg_${Date.now()}`,
    recipient_id: recipientId,
  };
}

export interface InstagramConversation {
  id: string;
  participants: {
    data: Array<{
      id: string;
      username?: string;
      name?: string;
    }>;
  };
  updated_time: string;
  messages?: {
    data: Array<{
      id: string;
      message?: string;
      from: {
        id: string;
        username?: string;
      };
      created_time: string; // Changed from timestamp
      attachments?: {
        data: Array<{
          image_url?: string;
          video_url?: string;
          audio_url?: string;
          file_url?: string;
          mime_type?: string;
        }>;
      };
    }>;
    paging?: {
      cursors: {
        before: string;
        after: string;
      };
      next?: string;
    };
  };
}

export interface InstagramMessage {
  id: string;
  message?: string;
  from: {
    id: string;
    username?: string;
  };
  created_time: string; // Changed from timestamp
  attachments?: {
    data: Array<{
      image_url?: string;
      video_url?: string;
      audio_url?: string;
      file_url?: string;
      mime_type?: string;
    }>;
  };
}

/**
 * Fetch all conversations for an Instagram account
 */
export async function fetchConversations(accessToken: string): Promise<InstagramConversation[]> {
  const endpoint = `${BASE_URL}/me/conversations`;
  const params = {
    access_token: accessToken,
    fields: 'id,participants{username,name,id},updated_time',
    limit: 100,
  };

  webhookLogger.logApiCall(endpoint, 'GET', params);

  try {
    const response = await axios.get(endpoint, { params });
    webhookLogger.logApiResponse(endpoint, response.status, response.data);
    return response.data.data || [];
  } catch (error: any) {
    console.error('Error fetching Instagram conversations:', error.response?.data || error.message);
    webhookLogger.logApiResponse(endpoint, error.response?.status || 500, null, error);
    throw new Error(`Failed to fetch conversations: ${error.response?.data?.error?.message || error.message}`);
  }
}

/**
 * Fetch messages for a specific conversation
 */
export async function fetchConversationMessages(
  conversationId: string,
  accessToken: string,
  limit: number = 100, // Instagram max per request is usually 100
  fetchAll: boolean = false
): Promise<InstagramMessage[]> {
  const endpoint = `${BASE_URL}/${conversationId}`;
  // For the first request, we fetch the conversation node with the messages edge
  // This is slightly different from direct edge fetching but consistent with current usage

  // Note: To paginate properly, we should probably fetch the edge directly: /{id}/messages
  // But current implementation does /{id}?fields=messages
  // Let's stick to the current structure first, but for pagination we'll likely need to follow the 'next' links
  // which usually point to the edge endpoint.

  const params = {
    access_token: accessToken,
    fields: 'messages{id,message,from,created_time,attachments}',
    limit: limit, // Apply limit to the messages edge if possible, or just limit payload size
  };

  webhookLogger.logApiCall(endpoint, 'GET', params);

  try {
    const response = await axios.get(endpoint, { params });
    webhookLogger.logApiResponse(endpoint, response.status, response.data);

    let messages = response.data.messages?.data || [];
    let paging = response.data.messages?.paging;

    if (fetchAll && paging?.next) {
      console.log(`🔄 Fetching history for conversation ${conversationId}...`);
      let nextUrl = paging.next;
      let pageCount = 1;

      while (nextUrl) {
        try {
          console.log(`📄 Fetching page ${pageCount + 1}...`);
          const nextResponse = await axios.get(nextUrl);
          const nextData = nextResponse.data;

          if (nextData.data && Array.isArray(nextData.data)) {
            messages = [...messages, ...nextData.data];
            console.log(`   + ${nextData.data.length} messages (Total: ${messages.length})`);
          }

          nextUrl = nextData.paging?.next;
          pageCount++;

          // Safety break to prevent infinite loops if something goes wrong
          if (pageCount > 50) {
            console.warn('⚠️ Reached recursion limit (50 pages) for message history.');
            break;
          }

        } catch (pageError: any) {
          console.error('❌ Error fetching next page:', pageError.message);
          break; // Stop fetching on error
        }
      }
      console.log(`✅ Finished fetching history: ${messages.length} total messages.`);
    }

    return messages;
  } catch (error: any) {
    console.error('Error fetching conversation messages:', error.response?.data || error.message);
    webhookLogger.logApiResponse(endpoint, error.response?.status || 500, null, error);
    throw new Error(`Failed to fetch messages: ${error.response?.data?.error?.message || error.message}`);
  }
}

/**
 * Fetch participant details (username, name)
 */
export async function fetchUserDetails(userId: string, accessToken: string) {
  const endpoint = `${BASE_URL}/${userId}`;
  const params = {
    access_token: accessToken,
    fields: 'id,username,name,profile_picture_url',
  };

  webhookLogger.logApiCall(endpoint, 'GET', params);

  try {
    const response = await axios.get(endpoint, { params });
    webhookLogger.logApiResponse(endpoint, response.status, response.data);
    return response.data;
  } catch (error: any) {
    console.error('Error fetching user details:', error.response?.data || error.message);
    webhookLogger.logApiResponse(endpoint, error.response?.status || 500, null, error);
    // Return minimal data if user details can't be fetched
    return {
      id: userId,
      username: 'unknown',
      name: 'Unknown User',
    };
  }
}

/**
 * Fetch profile details for IG messaging users (IGBusinessScopedID).
 * Uses Graph API host + profile_pic field.
 */
export async function fetchMessagingUserProfile(userId: string, accessToken: string) {
  const endpoint = `${FB_GRAPH_URL}/${userId}`;
  const params = {
    access_token: accessToken,
    fields: 'id,username,name,profile_pic',
  };

  webhookLogger.logApiCall(endpoint, 'GET', params);

  try {
    const response = await axios.get(endpoint, { params });
    webhookLogger.logApiResponse(endpoint, response.status, response.data);
    return response.data;
  } catch (error: any) {
    console.error('Error fetching messaging user profile:', error.response?.data || error.message);
    webhookLogger.logApiResponse(endpoint, error.response?.status || 500, null, error);
    return {
      id: userId,
      username: 'unknown',
      name: 'Unknown User',
    };
  }
}

/**
 * Send a message to a conversation
 * @param recipientId - Instagram user ID to send message to
 * @param messageText - Text content of the message
 * @param accessToken - Instagram access token
 * @param options - Optional settings for messaging behavior
 * @param options.useMessageTag - Whether to use MESSAGE_TAG messaging type
 * @param options.tag - Message tag (e.g., 'HUMAN_AGENT' for AI/human agent responses)
 */
export async function sendMessage(
  recipientId: string,
  messageText: string,
  accessToken: string,
  options?: {
    useMessageTag?: boolean;
    tag?: string;
  }
): Promise<any> {
  const endpoint = `${BASE_URL}/me/messages`;
  const payload: any = {
    recipient: { id: recipientId },
    message: { text: messageText },
  };

  // Add messaging_type and tag for notification control
  // HUMAN_AGENT tag ensures notifications are sent and extends messaging window to 7 days
  if (options?.useMessageTag && options?.tag) {
    payload.messaging_type = 'MESSAGE_TAG';
    payload.tag = options.tag;
  } else {
    // Default to RESPONSE type for regular messages (within 24-hour window)
    payload.messaging_type = 'RESPONSE';
  }

  console.log('📤 [IG-API] Sending Instagram message:', {
    endpoint,
    recipientId,
    messageLength: messageText.length,
    messagePreview: messageText.slice(0, 100),
    messagingType: payload.messaging_type,
    tag: payload.tag,
    hasAccessToken: !!accessToken,
    tokenLength: accessToken?.length || 0,
    tokenPrefix: accessToken?.slice(0, 20) + '...'
  });

  webhookLogger.logApiCall(endpoint, 'POST', payload);

  if (shouldStubSend(accessToken)) {
    const testResponse = buildTestResponse(recipientId);
    console.log('🧪 [IG-API] Test send stubbed:', {
      endpoint,
      recipientId,
      messageLength: messageText.length,
      messagePreview: messageText.slice(0, 100),
    });
    webhookLogger.logApiResponse(endpoint, 200, testResponse);
    return testResponse;
  }

  try {
    const response = await axios.post(endpoint, payload, {
      params: {
        access_token: accessToken,
      },
    });

    console.log('✅ [IG-API] Message sent successfully:', {
      status: response.status,
      messageId: response.data?.message_id,
      recipientId: response.data?.recipient_id
    });

    webhookLogger.logApiResponse(endpoint, response.status, response.data);
    return response.data;
  } catch (error: any) {
    console.error('❌ [IG-API] Error sending Instagram message:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      errorMessage: error.message,
      errorCode: error.response?.data?.error?.code,
      errorType: error.response?.data?.error?.type,
      errorSubcode: error.response?.data?.error?.error_subcode,
      errorDetails: error.response?.data?.error?.message,
      fullErrorData: error.response?.data,
      recipientId,
      messageLength: messageText.length
    });

    webhookLogger.logApiResponse(endpoint, error.response?.status || 500, null, error);

    // Provide specific error message for OAuth issues
    if (error.response?.status === 401 || error.response?.status === 403) {
      throw new Error(
        `Instagram OAuth error (${error.response.status}): ${error.response.data?.error?.message || 'Invalid or expired access token'}. ` +
        `Error code: ${error.response.data?.error?.code}, Type: ${error.response.data?.error?.type}`
      );
    }

    throw new Error(`Failed to send message: ${error.response?.data?.error?.message || error.message}`);
  }
}

/**
 * Fetch details for a specific message
 */
export async function fetchMessageDetails(
  messageId: string,
  accessToken: string
): Promise<any> {
  const endpoint = `${BASE_URL}/${messageId}`;
  const params = {
    access_token: accessToken,
    fields: 'id,created_time,from,to,message',
  };

  webhookLogger.logApiCall(endpoint, 'GET', params);

  try {
    const response = await axios.get(endpoint, { params });
    webhookLogger.logApiResponse(endpoint, response.status, response.data);
    return response.data;
  } catch (error: any) {
    console.error('Error fetching message details:', error.response?.data || error.message);
    webhookLogger.logApiResponse(endpoint, error.response?.status || 500, null, error);
    throw new Error(`Failed to fetch message details: ${error.response?.data?.error?.message || error.message}`);
  }
}

/**
 * Send a media message (image, video, or audio)
 */
export async function sendMediaMessage(
  instagramAccountId: string,
  recipientId: string,
  mediaType: 'image' | 'video' | 'audio',
  mediaUrl: string,
  accessToken: string
): Promise<any> {
  const endpoint = `${BASE_URL}/${instagramAccountId}/messages`;
  const payload = {
    recipient: { id: recipientId },
    message: {
      attachment: {
        type: mediaType,
        payload: {
          url: mediaUrl,
        },
      },
    },
  };

  webhookLogger.logApiCall(endpoint, 'POST', payload);

  if (shouldStubSend(accessToken)) {
    const testResponse = buildTestResponse(recipientId);
    console.log('🧪 [IG-API] Test button send stubbed:', {
      endpoint,
      recipientId,
      buttonCount: 0,
    });
    webhookLogger.logApiResponse(endpoint, 200, testResponse);
    return testResponse;
  }

  try {
    const response = await axios.post(endpoint, payload, {
      params: {
        access_token: accessToken,
      },
    });

    webhookLogger.logApiResponse(endpoint, response.status, response.data);
    return response.data;
  } catch (error: any) {
    console.error('Error sending media message:', error.response?.data || error.message);
    webhookLogger.logApiResponse(endpoint, error.response?.status || 500, null, error);
    throw new Error(`Failed to send media message: ${error.response?.data?.error?.message || error.message}`);
  }
}

/**
 * Send a message with button template (max 3 buttons)
 */
export async function sendButtonMessage(
  instagramAccountId: string,
  recipientId: string,
  text: string,
  buttons: Array<{
    type: 'web_url' | 'postback';
    title: string;
    url?: string;
    payload?: string;
  }>,
  accessToken: string
): Promise<any> {
  const endpoint = `${BASE_URL}/${instagramAccountId}/messages`;

  // Limit to 3 buttons (Instagram API constraint)
  const limitedButtons = buttons.slice(0, 3);

  const payload = {
    recipient: { id: recipientId },
    message: {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'button',
          text: text,
          buttons: limitedButtons,
        },
      },
    },
  };

  webhookLogger.logApiCall(endpoint, 'POST', payload);

  if (shouldStubSend(accessToken, instagramAccountId)) {
    const testResponse = buildTestResponse(recipientId);
    console.log('🧪 [IG-API] Test button send stubbed:', {
      endpoint,
      recipientId,
      buttonCount: limitedButtons.length,
    });
    webhookLogger.logApiResponse(endpoint, 200, testResponse);
    return testResponse;
  }

  try {
    const response = await axios.post(endpoint, payload, {
      params: {
        access_token: accessToken,
      },
    });

    webhookLogger.logApiResponse(endpoint, response.status, response.data);
    return response.data;
  } catch (error: any) {
    console.error('Error sending button message:', error.response?.data || error.message);
    webhookLogger.logApiResponse(endpoint, error.response?.status || 500, null, error);
    throw new Error(`Failed to send button message: ${error.response?.data?.error?.message || error.message}`);
  }
}

/**
 * Send a private reply to a comment (bypasses 24-hour window)
 */
export async function sendCommentReply(
  instagramAccountId: string,
  commentId: string,
  text: string,
  accessToken: string
): Promise<any> {
  const endpoint = `${BASE_URL}/${instagramAccountId}/messages`;
  const payload = {
    recipient: { comment_id: commentId },
    message: { text: text },
  };

  webhookLogger.logApiCall(endpoint, 'POST', payload);

  try {
    const response = await axios.post(endpoint, payload, {
      params: {
        access_token: accessToken,
      },
    });

    webhookLogger.logApiResponse(endpoint, response.status, response.data);
    return response.data;
  } catch (error: any) {
    console.error('Error sending comment reply:', error.response?.data || error.message);
    webhookLogger.logApiResponse(endpoint, error.response?.status || 500, null, error);
    throw new Error(`Failed to send comment reply: ${error.response?.data?.error?.message || error.message}`);
  }
}

/**
 * Mark a message/conversation as read
 */
export async function markMessageAsRead(
  instagramAccountId: string,
  messageId: string,
  accessToken: string
): Promise<boolean> {
  const endpoint = `${BASE_URL}/${instagramAccountId}/messages`;
  const payload = {
    recipient: { id: messageId },
    sender_action: 'mark_seen',
  };

  webhookLogger.logApiCall(endpoint, 'POST', payload);

  try {
    const response = await axios.post(endpoint, payload, {
      params: {
        access_token: accessToken,
      },
    });

    webhookLogger.logApiResponse(endpoint, response.status, response.data);
    return response.status === 200;
  } catch (error: any) {
    console.error('Error marking message as read:', error.response?.data || error.message);
    webhookLogger.logApiResponse(endpoint, error.response?.status || 500, null, error);
    return false;
  }
}
