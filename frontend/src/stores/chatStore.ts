import { create } from 'zustand'
import type { ChatMessage, VideoJob } from '@/types'

interface ChatState {
  // Session management
  currentSessionId: string | null
  setCurrentSession: (id: string | null) => void

  // Messages per session: Record<sessionId, messages>
  sessions: Record<string, ChatMessage[]>
  addMessage: (sessionId: string, msg: ChatMessage) => void
  setMessages: (sessionId: string, msgs: ChatMessage[]) => void
  clearMessages: (sessionId: string) => void

  // In-progress streaming per session
  isStreaming: Record<string, boolean>
  setStreaming: (sessionId: string, v: boolean) => void
  streamingTexts: Record<string, string>
  setStreamingText: (sessionId: string, text: string) => void
  appendStreamingText: (sessionId: string, text: string) => void
  abortControllers: Record<string, () => void>
  setAbortController: (sessionId: string, abort: (() => void) | null) => void
  
  // Video generation waiting state per session
  isWaitingVideo: Record<string, boolean>
  setWaitingVideo: (sessionId: string, v: boolean) => void

  // Active jobs (current session)
  activeJobs: Record<string, VideoJob>
  upsertJob: (job: VideoJob) => void
  updateJobStatus: (jobId: string, status: string, extra?: Partial<VideoJob>) => void
}

export const useChatStore = create<ChatState>((set) => ({
  currentSessionId: null,
  setCurrentSession: (id) => set({ currentSessionId: id }),

  sessions: {},
  addMessage: (sessionId, msg) =>
    set((s) => ({
      sessions: {
        ...s.sessions,
        [sessionId]: [...(s.sessions[sessionId] || []), msg],
      },
    })),
  setMessages: (sessionId, msgs) =>
    set((s) => ({
      sessions: {
        ...s.sessions,
        [sessionId]: msgs,
      },
    })),
  clearMessages: (sessionId) =>
    set((s) => ({
      sessions: {
        ...s.sessions,
        [sessionId]: [],
      },
    })),

  isStreaming: {},
  setStreaming: (sessionId, v) =>
    set((s) => ({ isStreaming: { ...s.isStreaming, [sessionId]: v } })),
  
  streamingTexts: {},
  setStreamingText: (sessionId, text) =>
    set((s) => ({ streamingTexts: { ...s.streamingTexts, [sessionId]: text } })),
  appendStreamingText: (sessionId, text) =>
    set((s) => ({
      streamingTexts: {
        ...s.streamingTexts,
        [sessionId]: (s.streamingTexts[sessionId] || '') + text,
      },
    })),

  abortControllers: {},
  setAbortController: (sessionId, abort) =>
    set((s) => {
      const newControllers = { ...s.abortControllers }
      if (abort) {
        newControllers[sessionId] = abort
      } else {
        delete newControllers[sessionId]
      }
      return { abortControllers: newControllers }
    }),

  isWaitingVideo: {},
  setWaitingVideo: (sessionId, v) =>
    set((s) => ({ isWaitingVideo: { ...s.isWaitingVideo, [sessionId]: v } })),

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
