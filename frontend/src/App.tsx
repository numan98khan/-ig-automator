import { Sparkles } from 'lucide-react'
import ChatInterface from './components/ChatInterface'

function App() {
  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <header className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center space-x-3">
          <Sparkles className="w-8 h-8 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AI Assistant</h1>
            <p className="text-sm text-gray-600">Powered by RAG</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <ChatInterface />
      </main>
    </div>
  )
}

export default App
