import { useState } from 'react'
import { Play, Trash2, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn, JOB_STATUS_LABELS, JOB_STATUS_COLORS, formatDate } from '@/lib/utils'
import type { VideoJob } from '@/types'
import { videosApi } from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'

interface Props {
  job: VideoJob
}

export default function VideoCard({ job }: Props) {
  const [isLoading, setIsLoading] = useState(false)
  const qc = useQueryClient()

  const handleWatch = async () => {
    setIsLoading(true)
    try {
      const { data } = await videosApi.getUrl(job.id)
      window.open(data.url, '_blank')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this video?')) return
    await videosApi.delete(job.id)
    qc.invalidateQueries({ queryKey: ['videos'] })
  }

  const isCompleted = job.status === 'completed'
  const isFailed = job.status === 'failed'

  return (
    <div className="group rounded-xl border bg-card overflow-hidden hover:shadow-md transition-shadow">
      {/* Thumbnail / Preview */}
      <div className="relative aspect-video bg-muted">
        {isCompleted ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Button
              size="icon"
              className="h-12 w-12 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={handleWatch}
              disabled={isLoading}
            >
              <Play className="h-5 w-5 ml-0.5" />
            </Button>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={cn('text-sm font-medium', JOB_STATUS_COLORS[job.status])}>
              {JOB_STATUS_LABELS[job.status]}
            </div>
          </div>
        )}

        {/* Status badge */}
        <div className="absolute top-2 right-2">
          <Badge
            variant={isCompleted ? 'default' : isFailed ? 'destructive' : 'secondary'}
            className="text-xs"
          >
            {JOB_STATUS_LABELS[job.status]}
          </Badge>
        </div>
      </div>

      {/* Info */}
      <div className="p-3 space-y-2">
        <p className="text-sm font-medium line-clamp-2 leading-snug">{job.prompt}</p>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDate(job.created_at)}
          </span>
        </div>

        <div className="flex gap-2 pt-1">
          {isCompleted && (
            <Button size="sm" variant="outline" className="flex-1" onClick={handleWatch}>
              <Play className="h-3 w-3" />
              Watch
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            onClick={handleDelete}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  )
}
