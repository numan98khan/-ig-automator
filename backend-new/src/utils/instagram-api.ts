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
