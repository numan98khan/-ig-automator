import axios from 'axios'

// API Base URL configuration
const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Types
export interface QueryResponse {
  answer: string
  sources?: Array<{
    filename: string
    page?: string
    snippet?: string
  }>
}

// API Functions

/**
 * Query the RAG system with a question
 */
export async function queryDocuments(question: string): Promise<QueryResponse> {
  const { data } = await api.post('/api/query', { question })
  return data
}

/**
 * Upload a document file
 */
export async function uploadFile(file: File): Promise<void> {
  const formData = new FormData()
  formData.append('file', file)

  await api.post('/api/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
}

/**
 * Build the vector index
 */
export async function buildIndex(): Promise<void> {
  await api.post('/api/index/build')
}

/**
 * Health check
 */
export async function getHealth(): Promise<{ status: string }> {
  const { data } = await api.get('/')
  return data
}
