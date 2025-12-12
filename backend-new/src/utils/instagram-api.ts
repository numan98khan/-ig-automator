import axios from 'axios';

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
  try {
    const response = await axios.get(`${BASE_URL}/me/conversations`, {
      params: {
        access_token: accessToken,
        fields: 'id,participants,updated_time',
        limit: 100,
      },
    });

    return response.data.data || [];
  } catch (error: any) {
    console.error('Error fetching Instagram conversations:', error.response?.data || error.message);
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
  try {
    const response = await axios.get(`${BASE_URL}/${conversationId}`, {
      params: {
        access_token: accessToken,
        fields: 'messages{id,message,from,timestamp,attachments}',
        limit,
      },
    });

    return response.data.messages?.data || [];
  } catch (error: any) {
    console.error('Error fetching conversation messages:', error.response?.data || error.message);
    throw new Error(`Failed to fetch messages: ${error.response?.data?.error?.message || error.message}`);
  }
}

/**
 * Fetch participant details (username, name)
 */
export async function fetchUserDetails(userId: string, accessToken: string) {
  try {
    const response = await axios.get(`${BASE_URL}/${userId}`, {
      params: {
        access_token: accessToken,
        fields: 'id,username,name',
      },
    });

    return response.data;
  } catch (error: any) {
    console.error('Error fetching user details:', error.response?.data || error.message);
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
  try {
    const response = await axios.post(`${BASE_URL}/me/messages`, {
      recipient: { id: recipientId },
      message: { text: messageText },
    }, {
      params: {
        access_token: accessToken,
      },
    });

    return response.data;
  } catch (error: any) {
    console.error('Error sending Instagram message:', error.response?.data || error.message);
    throw new Error(`Failed to send message: ${error.response?.data?.error?.message || error.message}`);
  }
}
