import api from './api';

export interface AssistantMessagePayload {
  question: string;
  workspaceName?: string;
  workspaceId?: string;
  locationHint?: string;
}

export interface AssistantResponse {
  answer: string;
  model?: string;
}

export async function askAssistant(payload: AssistantMessagePayload): Promise<AssistantResponse> {
  const { question, workspaceName, workspaceId, locationHint } = payload;
  const endpoint = workspaceId ? '/api/assistant/ask/authed' : '/api/assistant/ask';

  const response = await api.post(endpoint, {
    question,
    workspaceName,
    workspaceId,
    locationHint,
  });
  return response.data;
}
