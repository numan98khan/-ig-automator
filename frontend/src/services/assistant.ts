import api from './api';

export interface AssistantMessagePayload {
  question: string;
  workspaceName?: string;
  locationHint?: string;
}

export interface AssistantResponse {
  answer: string;
  model?: string;
}

export async function askAssistant(payload: AssistantMessagePayload): Promise<AssistantResponse> {
  const { question, workspaceName, locationHint } = payload;
  const response = await api.post('/api/assistant/ask', {
    question,
    workspaceName,
    locationHint,
  });
  return response.data;
}
