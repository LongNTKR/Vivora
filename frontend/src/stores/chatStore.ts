import { create } from 'zustand'
import type { ChatMessage, VideoJob } from '@/types'

interface ChatState {
  // Session management
  currentSessionId: string | null
  setCurrentSession: (id: string | null) => void

  // Messages for current session
  messages: ChatMessage[]
  addMessage: (msg: ChatMessage) => void
  appendToLastAssistant: (text: string) => void
  setMessages: (msgs: ChatMessage[]) => void
  clearMessages: () => void

  // In-progress streaming
  isStreaming: boolean
  setStreaming: (v: boolean) => void

  // Active jobs (current session)
  activeJobs: Record<string, VideoJob>
  upsertJob: (job: VideoJob) => void
  updateJobStatus: (jobId: string, status: string, extra?: Partial<VideoJob>) => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  currentSessionId: null,
  setCurrentSession: (id) => set({ currentSessionId: id }),

  messages: [],
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  appendToLastAssistant: (text) =>
    set((s) => {
      const msgs = [...s.messages]
      const last = msgs[msgs.length - 1]
      if (last && last.role === 'assistant') {
        msgs[msgs.length - 1] = { ...last, content: last.content + text }
      }
      return { messages: msgs }
    }),
  setMessages: (msgs) => set({ messages: msgs }),
  clearMessages: () => set({ messages: [] }),

  isStreaming: false,
  setStreaming: (v) => set({ isStreaming: v }),

  activeJobs: {},
  upsertJob: (job) =>
    set((s) => ({ activeJobs: { ...s.activeJobs, [job.id]: job } })),
  updateJobStatus: (jobId, status, extra = {}) =>
    set((s) => {
      const existing = s.activeJobs[jobId]
      if (!existing) return s
      return {
        activeJobs: {
          ...s.activeJobs,
          [jobId]: { ...existing, status, ...extra },
        },
      }
    }),
}))
