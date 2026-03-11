import { memo } from 'react'
import { cn } from '@/lib/utils'
import type { ChatMessage } from '@/types'
import GenerationCard from './GenerationCard'
import { Bot, User } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Props {
  message: ChatMessage
}

const MessageBubble = memo(function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      {/* Avatar */}
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted',
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      <div className={cn('max-w-[75%] space-y-2', isUser && 'items-end')}>
        {/* Text content */}
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
            isUser
              ? 'bg-primary text-primary-foreground rounded-tr-sm'
              : 'bg-muted text-foreground rounded-tl-sm',
          )}
        >
          <MessageContent content={message.content} isUser={isUser} />
        </div>

        {/* Generation card if job was triggered */}
        {message.jobId && <GenerationCard jobId={message.jobId} />}
      </div>
    </div>
  )
})

export default MessageBubble

function MessageContent({ content, isUser }: { content: string, isUser: boolean }) {
  // Strip JSON generation spec from displayed content
  const cleaned = content.replace(/```json[\s\S]*?```/g, '').trim()
  const displayContent = cleaned || content;

  return (
    <div className={cn(
      "prose prose-sm max-w-none break-words",
      isUser 
        ? "prose-invert" // Usually primary bg is dark, but let's just force text color
        : "dark:prose-invert",
      isUser && "[&_*]:text-primary-foreground" // Force inherit color for user bubble text
    )}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {displayContent}
      </ReactMarkdown>
    </div>
  )
}
