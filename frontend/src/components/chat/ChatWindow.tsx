import { useEffect, useRef } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import MessageBubble from './MessageBubble'
import type { ChatMessage } from '@/types'
import { Bot } from 'lucide-react'

interface Props {
  messages: ChatMessage[]
  isStreaming: boolean
  streamingContent: string
}

export default function ChatWindow({ messages, isStreaming, streamingContent }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [messages, streamingContent])

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center space-y-4 max-w-md">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Bot className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold">Create a Video</h2>
          <p className="text-muted-foreground">
            Describe the video you want to create. I'll ask clarifying questions
            and then generate it for you with AI.
          </p>
          <div className="grid gap-2 text-sm text-left">
            {EXAMPLE_PROMPTS.map((p) => (
              <div key={p} className="rounded-lg border bg-muted/50 px-3 py-2 text-muted-foreground">
                "{p}"
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <ScrollArea className="flex-1 px-4">
      <div className="max-w-3xl mx-auto py-6 space-y-6">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Streaming assistant response */}
        {isStreaming && streamingContent && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
              <Bot className="h-4 w-4" />
            </div>
            <div className="max-w-[75%] rounded-2xl rounded-tl-sm bg-muted px-4 py-2.5 text-sm leading-relaxed">
              <p className="whitespace-pre-wrap">{streamingContent}</p>
              <span className="inline-block h-4 w-0.5 bg-foreground animate-pulse ml-0.5" />
            </div>
          </div>
        )}

        {isStreaming && !streamingContent && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
              <Bot className="h-4 w-4" />
            </div>
            <div className="rounded-2xl rounded-tl-sm bg-muted px-4 py-3">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}

const EXAMPLE_PROMPTS = [
  'Tạo video 5 giây về cảnh hoàng hôn trên biển, có nhạc nhẹ nhàng',
  'A cinematic 10-second video of a bustling Tokyo street at night',
  'Short loop video of coffee being poured in slow motion',
]
