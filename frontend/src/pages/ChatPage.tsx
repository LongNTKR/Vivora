import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Send, Plus, PanelLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import ChatWindow from '@/components/chat/ChatWindow'
import { useChatStore } from '@/stores/chatStore'
import { chatApi, createChatStream } from '@/lib/api'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ChatSession } from '@/types'
import { cn } from '@/lib/utils'

export default function ChatPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const {
    messages,
    addMessage,
    clearMessages,
    setCurrentSession,
    isStreaming,
    setStreaming,
    upsertJob,
  } = useChatStore()

  const [input, setInput] = useState('')
  const [streamingText, setStreamingText] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const abortRef = useRef<(() => void) | null>(null)
  const msgCounterRef = useRef(0)

  const { data: sessions, refetch: refetchSessions } = useQuery<ChatSession[]>({
    queryKey: ['chat-sessions'],
    queryFn: () => chatApi.listSessions().then((r) => r.data),
  })

  // Initialize/switch session
  useEffect(() => {
    if (sessionId) {
      setCurrentSession(sessionId)
      clearMessages()
    }
  }, [sessionId, setCurrentSession, clearMessages])

  const handleNewChat = async () => {
    const { data } = await chatApi.createSession()
    await refetchSessions()
    navigate(`/chat/${data.id}`)
  }

  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming) return

    let activeSessionId = sessionId
    if (!activeSessionId) {
      const { data } = await chatApi.createSession()
      activeSessionId = data.id
      await refetchSessions()
      navigate(`/chat/${activeSessionId}`, { replace: true })
    }

    const content = input.trim()
    setInput('')

    // Add user message optimistically
    const userId = `local-${++msgCounterRef.current}`
    addMessage({ id: userId, role: 'user', content, created_at: new Date().toISOString() })

    setStreaming(true)
    setStreamingText('')

    abortRef.current = createChatStream(
      activeSessionId,
      content,
      (text) => setStreamingText((prev) => prev + text),
      (jobId) => {
        // Job was created — add placeholder to store
        upsertJob({
          id: jobId,
          status: 'queued',
          model_provider: 'veo',
          prompt: content,
          settings: null,
          audio_settings: null,
          raw_video_path: null,
          final_video_path: null,
          error_message: null,
          created_at: new Date().toISOString(),
          completed_at: null,
        })
      },
      () => {
        // Done — commit streaming text as assistant message
        setStreaming(false)
        setStreamingText((prev) => {
          if (prev) {
            addMessage({
              id: `local-${++msgCounterRef.current}`,
              role: 'assistant',
              content: prev,
              created_at: new Date().toISOString(),
            })
          }
          return ''
        })
      },
      (err) => {
        setStreaming(false)
        setStreamingText('')
        addMessage({
          id: `local-${++msgCounterRef.current}`,
          role: 'assistant',
          content: `Sorry, something went wrong: ${err}`,
          created_at: new Date().toISOString(),
        })
      },
    )
  }, [input, isStreaming, sessionId, addMessage, setStreaming, upsertJob, refetchSessions, navigate])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex h-full">
      {/* Sessions sidebar */}
      {sidebarOpen && (
        <div className="w-60 border-r flex flex-col bg-card/50">
          <div className="flex items-center justify-between p-3 border-b">
            <span className="text-sm font-medium">Conversations</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleNewChat}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {sessions?.map((s) => (
              <button
                key={s.id}
                onClick={() => navigate(`/chat/${s.id}`)}
                className={cn(
                  'w-full text-left px-3 py-2.5 text-sm hover:bg-accent transition-colors',
                  s.id === sessionId && 'bg-accent font-medium',
                )}
              >
                <p className="truncate">{s.title || 'New conversation'}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(s.created_at).toLocaleDateString()}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main chat area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setSidebarOpen((v) => !v)}
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-sm font-medium">
            {sessionId ? 'Conversation' : 'New Conversation'}
          </h1>
        </div>

        {/* Messages */}
        <ChatWindow
          messages={messages}
          isStreaming={isStreaming}
          streamingContent={streamingText}
        />

        {/* Input area */}
        <div className="border-t p-4">
          <div className="max-w-3xl mx-auto">
            <div className="relative flex items-end gap-2 rounded-xl border bg-background p-2 focus-within:ring-2 focus-within:ring-ring">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe the video you want to create..."
                className="min-h-[44px] max-h-32 flex-1 resize-none border-0 bg-transparent p-2 focus-visible:ring-0 focus-visible:ring-offset-0"
                rows={1}
                disabled={isStreaming}
              />
              <Button
                size="icon"
                onClick={handleSend}
                disabled={!input.trim() || isStreaming}
                className="h-9 w-9 shrink-0"
              >
                {isStreaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center mt-2">
              Press Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
