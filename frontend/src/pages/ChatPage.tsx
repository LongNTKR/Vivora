import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
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
    sessions,
    addMessage,
    setCurrentSession,
    setMessages,
    isStreaming,
    setStreaming,
    streamingTexts,
    setStreamingText,
    appendStreamingText,
    setAbortController,
    upsertJob,
  } = useChatStore()

  const activeStreaming = sessionId ? isStreaming[sessionId] || false : false
  const activeStreamingText = sessionId ? streamingTexts[sessionId] || '' : ''

  // Get messages for current session from store
  const messages = useMemo(() => (sessionId ? sessions[sessionId] || [] : []), [sessionId, sessions])

  const [input, setInput] = useState('')
  const skipNextFetchRef = useRef(false)

  // Initialize/switch session — fetch history
  useEffect(() => {
    if (sessionId) {
      setCurrentSession(sessionId)
      
      // Fetch if not present
      const currentSessions = useChatStore.getState().sessions
      if (!currentSessions[sessionId] && !skipNextFetchRef.current) {
        chatApi.getMessages(sessionId).then(({ data }: { data: ChatMessage[] }) => {
          setMessages(sessionId, data)
        })
      }
      skipNextFetchRef.current = false
    } else {
      setCurrentSession(null)
    }
    // We intentionally DO NOT abort active streams on unmount or session switch
    // to allow background generation to complete.
  }, [sessionId, setCurrentSession, setMessages])

  const handleSend = useCallback(async () => {
    const trimmedInput = input.trim()
    if (!trimmedInput || activeStreaming) return

    let activeSessionId = sessionId
    if (!activeSessionId) {
      try {
        const { data } = await chatApi.createSession()
        activeSessionId = data.id
        // Optimistically prepend new session
        qc.setQueryData<InfiniteData<ChatSession[]>>(['chat-sessions'], (old) => {
          if (!old) return old
          const newSession: ChatSession = { id: activeSessionId!, title: null, created_at: new Date().toISOString() }
          return {
            ...old,
            pages: [[newSession, ...old.pages[0]], ...old.pages.slice(1)],
          }
        })
        skipNextFetchRef.current = true
        navigate(`/chat/${activeSessionId}`, { replace: true })
      } catch (err) {
        console.error("Failed to create session", err)
        return
      }
    }

    const content = trimmedInput
    setInput('')

    if (!activeSessionId) return

    const capturedSessionId = activeSessionId as string

    // Add user message optimistically
    const localUserId = `local-u-${Date.now()}`
    addMessage(capturedSessionId, { id: localUserId, role: 'user', content, created_at: new Date().toISOString() })

    setStreaming(capturedSessionId, true)
    setStreamingText(capturedSessionId, '')

    let accumulatorText = ''

    const streamAbort = createChatStream(
      capturedSessionId,
      content,
      (text) => {
        accumulatorText += text
        // Update global store directly; React will batch and throttle correctly in Zustand
        appendStreamingText(capturedSessionId, text)
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
        // Done — commit accumulated text as assistant message
        setStreaming(capturedSessionId, false)
        setStreamingText(capturedSessionId, '')
        setAbortController(capturedSessionId, null)
        
        if (accumulatorText) {
          addMessage(capturedSessionId, {
            id: `local-a-${Date.now()}`,
            role: 'assistant',
            content: accumulatorText,
            created_at: new Date().toISOString(),
          })
        }
      },
      (err) => {
        setStreaming(capturedSessionId, false)
        setStreamingText(capturedSessionId, '')
        setAbortController(capturedSessionId, null)
        
        addMessage(capturedSessionId, {
          id: `local-err-${Date.now()}`,
          role: 'assistant',
          content: `Sorry, something went wrong: ${err}`,
          created_at: new Date().toISOString(),
        })
      },
      (title) => {
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
    
    setAbortController(capturedSessionId, streamAbort)
  }, [input, activeStreaming, sessionId, addMessage, setStreaming, setStreamingText, appendStreamingText, setAbortController, upsertJob, qc, navigate])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ChatWindow
        messages={messages}
        isStreaming={activeStreaming}
        streamingContent={activeStreamingText}
      />

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
              disabled={activeStreaming}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!input.trim() || activeStreaming}
              className="h-9 w-9 shrink-0"
            >
              {activeStreaming ? (
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
