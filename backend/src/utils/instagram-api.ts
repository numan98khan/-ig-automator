import axios from 'axios';
import { webhookLogger } from './webhook-logger';

/**
 * Instagram Graph API v24 Service
 * Handles all Instagram Graph API interactions
 */

const API_VERSION = 'v24.0';
const BASE_URL = `https://graph.instagram.com/${API_VERSION}`;

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
      timestamp: string;
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
  timestamp: string;
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
    fields: 'id,participants,updated_time',
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
  limit: number = 100
): Promise<InstagramMessage[]> {
  const endpoint = `${BASE_URL}/${conversationId}`;
  const params = {
    access_token: accessToken,
    fields: 'messages{id,message,from,timestamp,attachments}',
    limit,
  };

  webhookLogger.logApiCall(endpoint, 'GET', params);

  try {
    const response = await axios.get(endpoint, { params });
    webhookLogger.logApiResponse(endpoint, response.status, response.data);
    return response.data.messages?.data || [];
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
    fields: 'id,username,name',
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
 * Send a message to a conversation
 */
export async function sendMessage(
  recipientId: string,
  messageText: string,
  accessToken: string
): Promise<any> {
  const endpoint = `${BASE_URL}/me/messages`;
  const payload = {
    recipient: { id: recipientId },
    message: { text: messageText },
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
    console.error('Error sending Instagram message:', error.response?.data || error.message);
    webhookLogger.logApiResponse(endpoint, error.response?.status || 500, null, error);
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

