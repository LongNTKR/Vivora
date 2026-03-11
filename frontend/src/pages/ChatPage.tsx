import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Send, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import ChatWindow from '@/components/chat/ChatWindow'
import { useChatStore } from '@/stores/chatStore'
import { chatApi, createChatStream } from '@/lib/api'
import { useQueryClient, type InfiniteData } from '@tanstack/react-query'
import type { ChatSession, ChatMessage } from '@/types'

export default function ChatPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const {
    messages,
    addMessage,
    clearMessages,
    setCurrentSession,
    setMessages,
    isStreaming,
    setStreaming,
    upsertJob,
  } = useChatStore()

  const [input, setInput] = useState('')
  const [streamingText, setStreamingText] = useState('')
  const abortRef = useRef<(() => void) | null>(null)
  const msgCounterRef = useRef(0)
  const skipNextClearRef = useRef(false)
  const streamingAccumulatorRef = useRef('')

  // Initialize/switch session — fetch history from DB
  useEffect(() => {
    if (sessionId) {
      setCurrentSession(sessionId)
      if (!skipNextClearRef.current) {
        clearMessages()
        chatApi.getMessages(sessionId).then(({ data }: { data: ChatMessage[] }) => setMessages(data))
      }
      skipNextClearRef.current = false
    } else {
      setCurrentSession(null)
      clearMessages()
    }
  }, [sessionId, setCurrentSession, clearMessages, setMessages])

  // RAF loop: sync streaming accumulator to state at ~60fps
  useEffect(() => {
    if (!isStreaming) return
    let rafId: number
    const sync = () => {
      setStreamingText(streamingAccumulatorRef.current)
      rafId = requestAnimationFrame(sync)
    }
    rafId = requestAnimationFrame(sync)
    return () => cancelAnimationFrame(rafId)
  }, [isStreaming])

  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming) return

    let activeSessionId = sessionId
    if (!activeSessionId) {
      const { data } = await chatApi.createSession()
      activeSessionId = data.id
      // Optimistically prepend new session — no blocking refetch
      qc.setQueryData<InfiniteData<ChatSession[]>>(['chat-sessions'], (old) => {
        if (!old) return old
        const newSession: ChatSession = { id: activeSessionId!, title: null, created_at: new Date().toISOString() }
        return {
          ...old,
          pages: [[newSession, ...old.pages[0]], ...old.pages.slice(1)],
        }
      })
      skipNextClearRef.current = true
      navigate(`/chat/${activeSessionId}`, { replace: true })
    }

    const content = input.trim()
    setInput('')

    // Add user message optimistically
    const userId = `local-${++msgCounterRef.current}`
    addMessage({ id: userId, role: 'user', content, created_at: new Date().toISOString() })

    setStreaming(true)
    setStreamingText('')
    streamingAccumulatorRef.current = ''

    const capturedSessionId = activeSessionId

    abortRef.current = createChatStream(
      capturedSessionId,
      content,
      (text) => {
        streamingAccumulatorRef.current += text
        setStreamingText((prev) => prev + text)
      },
      (jobId) => {
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
        // Done — commit accumulated text as assistant message (no Zustand inside React updater)
        const finalText = streamingAccumulatorRef.current
        streamingAccumulatorRef.current = ''
        setStreaming(false)
        setStreamingText('')
        if (finalText) {
          addMessage({
            id: `local-${++msgCounterRef.current}`,
            role: 'assistant',
            content: finalText,
            created_at: new Date().toISOString(),
          })
        }
      },
      (err) => {
        streamingAccumulatorRef.current = ''
        setStreaming(false)
        setStreamingText('')
        addMessage({
          id: `local-${++msgCounterRef.current}`,
          role: 'assistant',
          content: `Sorry, something went wrong: ${err}`,
          created_at: new Date().toISOString(),
        })
      },
      (title) => {
        // Update session title in the cached session list
        qc.setQueryData<InfiniteData<ChatSession[]>>(['chat-sessions'], (old) => {
          if (!old) return old
          return {
            ...old,
            pages: old.pages.map((page) =>
              page.map((s) => (s.id === capturedSessionId ? { ...s, title } : s)),
            ),
          }
        })
      },
    )
  }, [input, isStreaming, sessionId, addMessage, setStreaming, upsertJob, qc, navigate])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex h-full flex-col">
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
  )
}
