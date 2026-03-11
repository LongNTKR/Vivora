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

const EMPTY_MESSAGES: ChatMessage[] = []

export default function ChatPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  // Subscribe to only the active session slice to avoid re-renders from other sessions' streams.
  const messages = useChatStore(
    useCallback((s) => (sessionId ? s.sessions[sessionId] ?? EMPTY_MESSAGES : EMPTY_MESSAGES), [sessionId]),
  )
  const activeStreaming = useChatStore(
    useCallback((s) => (sessionId ? s.isStreaming[sessionId] ?? false : false), [sessionId]),
  )
  const activeWaitingVideo = useChatStore(
    useCallback((s) => (sessionId ? s.isWaitingVideo[sessionId] ?? false : false), [sessionId]),
  )
  const activeStreamingText = useChatStore(
    useCallback((s) => (sessionId ? s.streamingTexts[sessionId] ?? '' : ''), [sessionId]),
  )
  const isBusy = activeStreaming || activeWaitingVideo

  const addMessage = useChatStore((s) => s.addMessage)
  const setCurrentSession = useChatStore((s) => s.setCurrentSession)
  const setMessages = useChatStore((s) => s.setMessages)
  const setStreaming = useChatStore((s) => s.setStreaming)
  const setStreamingText = useChatStore((s) => s.setStreamingText)
  const appendStreamingText = useChatStore((s) => s.appendStreamingText)
  const setAbortController = useChatStore((s) => s.setAbortController)
  const upsertJob = useChatStore((s) => s.upsertJob)
  const updateJobStatus = useChatStore((s) => s.updateJobStatus)
  const setWaitingVideo = useChatStore((s) => s.setWaitingVideo)

  const [input, setInput] = useState('')
  const skipNextFetchRef = useRef(false)

  // Initialize/switch session — fetch history
  useEffect(() => {
    if (sessionId) {
      setCurrentSession(sessionId)

      const shouldSkipFetch = skipNextFetchRef.current
      skipNextFetchRef.current = false

      // Fetch only if we truly have no local state yet.
      const existing = useChatStore.getState().sessions[sessionId]
      if (!shouldSkipFetch && (!existing || existing.length === 0)) {
        let cancelled = false
        chatApi
          .getMessages(sessionId)
          .then(({ data }: { data: ChatMessage[] }) => {
            if (cancelled) return

            // Avoid clobbering optimistic messages if user started chatting while fetch was in-flight.
            const latest = useChatStore.getState().sessions[sessionId]
            if (latest && latest.length > 0) return

            setMessages(sessionId, data)
          })
          .catch((err) => {
            if (!cancelled) console.error('Failed to fetch messages', err)
          })

        return () => {
          cancelled = true
        }
      }
    } else {
      setCurrentSession(null)
    }
    // We intentionally DO NOT abort active streams on unmount or session switch
    // to allow background generation to complete.
  }, [sessionId, setCurrentSession, setMessages])

  const handleSend = useCallback(async () => {
    const trimmedInput = input.trim()
    if (!trimmedInput || isBusy) return

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
    setWaitingVideo(capturedSessionId, false)

    let accumulatorText = ''
    let pendingText = ''
    let flushTimeoutId: number | null = null
    let latestJobId: string | null = null
    let assistantCommitted = false

    const flushPending = () => {
      if (pendingText) {
        appendStreamingText(capturedSessionId, pendingText)
        pendingText = ''
      }
      flushTimeoutId = null
    }

    const streamAbort = createChatStream(
      capturedSessionId,
      content,
      (text) => {
        accumulatorText += text
        pendingText += text

        // Batch updates to keep the UI responsive (especially with multiple concurrent sessions).
        if (flushTimeoutId === null) {
          flushTimeoutId = window.setTimeout(flushPending, 50)
        }
      },
      (jobId) => {
        latestJobId = jobId
        setWaitingVideo(capturedSessionId, true)
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
        // Done — server finished streaming + (if any) video generation wait
        if (flushTimeoutId !== null) {
          clearTimeout(flushTimeoutId)
          flushTimeoutId = null
        }
        flushPending()

        setStreaming(capturedSessionId, false)
        setStreamingText(capturedSessionId, '')
        setWaitingVideo(capturedSessionId, false)
        setAbortController(capturedSessionId, null)

        if (accumulatorText && !assistantCommitted) {
          assistantCommitted = true
          addMessage(capturedSessionId, {
            id: `local-a-${Date.now()}`,
            role: 'assistant',
            content: accumulatorText,
            created_at: new Date().toISOString(),
            ...(latestJobId ? { jobId: latestJobId } : {}),
          })
        }
      },
      (err) => {
        if (flushTimeoutId !== null) {
          clearTimeout(flushTimeoutId)
          flushTimeoutId = null
        }
        flushPending()

        setStreaming(capturedSessionId, false)
        setStreamingText(capturedSessionId, '')
        setWaitingVideo(capturedSessionId, false)
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
      () => {
        // Chat done — commit accumulated assistant text, then keep waiting for video updates if needed.
        if (flushTimeoutId !== null) {
          clearTimeout(flushTimeoutId)
          flushTimeoutId = null
        }
        flushPending()

        setStreaming(capturedSessionId, false)
        setStreamingText(capturedSessionId, '')

        if (accumulatorText && !assistantCommitted) {
          assistantCommitted = true
          addMessage(capturedSessionId, {
            id: `local-a-${Date.now()}`,
            role: 'assistant',
            content: accumulatorText,
            created_at: new Date().toISOString(),
            ...(latestJobId ? { jobId: latestJobId } : {}),
          })
        }
      },
      (jobId, status, extra) => {
        updateJobStatus(jobId, status, {
          ...(extra?.error ? { error_message: extra.error } : {}),
          ...(extra?.final_url ? { final_url: extra.final_url } : {}),
        })
        if (status === 'completed' || status === 'failed') {
          setWaitingVideo(capturedSessionId, false)
        }
      },
    )
    
    setAbortController(capturedSessionId, streamAbort)
  }, [input, isBusy, sessionId, addMessage, setStreaming, setStreamingText, appendStreamingText, setAbortController, upsertJob, updateJobStatus, setWaitingVideo, qc, navigate])

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
              disabled={isBusy}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!input.trim() || isBusy}
              className="h-9 w-9 shrink-0"
            >
              {isBusy ? (
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
