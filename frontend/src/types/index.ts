export interface ChatSession {
  id: string
  title: string | null
  created_at: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
  jobId?: string
}

export interface VideoJob {
  id: string
  status: string
  model_provider: string
  prompt: string
  settings: Record<string, unknown> | null
  audio_settings: Record<string, unknown> | null
  raw_video_path: string | null
  final_video_path: string | null
  error_message: string | null
  created_at: string
  completed_at: string | null
}
