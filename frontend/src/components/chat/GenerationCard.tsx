import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cn, JOB_STATUS_LABELS, getVideoUrl } from '@/lib/utils'
import { useChatStore } from '@/stores/chatStore'
import { jobsApi } from '@/lib/api'
import { Loader2, CheckCircle2, XCircle, Play, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface Props {
  jobId: string
}

const TERMINAL_STATUSES = ['completed', 'failed']
const POLL_STATUSES = ['queued', 'processing', 'audio_processing', 'merging']

export default function GenerationCard({ jobId }: Props) {
  const { activeJobs, upsertJob } = useChatStore()
  const job = activeJobs[jobId]

  // Poll until terminal status
  const { data } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => jobsApi.getStatus(jobId).then((r) => r.data),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (!status || TERMINAL_STATUSES.includes(status)) return false
      return 5_000
    },
    enabled: !job || POLL_STATUSES.includes(job.status),
  })

  useEffect(() => {
    if (data) upsertJob(data)
  }, [data, upsertJob])

  const status = job?.status ?? data?.status ?? 'queued'
  const isCompleted = status === 'completed'
  const isFailed = status === 'failed'
  const isInProgress = POLL_STATUSES.includes(status)

  const effectiveJob = job ?? data ?? null
  const finalUrl = effectiveJob ? getVideoUrl(effectiveJob) : null

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3 w-72">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Video Generation</span>
        <Badge variant={isCompleted ? 'default' : isFailed ? 'destructive' : 'secondary'}>
          {isInProgress && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
          {isCompleted && <CheckCircle2 className="h-3 w-3 mr-1" />}
          {isFailed && <XCircle className="h-3 w-3 mr-1" />}
          {JOB_STATUS_LABELS[status] ?? status}
        </Badge>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-muted rounded-full h-1.5">
        <div
          className={cn(
            'h-1.5 rounded-full transition-all duration-500',
            isCompleted ? 'w-full bg-green-500' :
            isFailed ? 'w-full bg-red-500' :
            status === 'merging' ? 'w-5/6 bg-indigo-500' :
            status === 'audio_processing' ? 'w-2/3 bg-purple-500' :
            status === 'processing' ? 'w-1/3 bg-blue-500' :
            'w-1/12 bg-yellow-500',
          )}
        />
      </div>

      {isCompleted && finalUrl && (
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" asChild>
            <a href={finalUrl} target="_blank" rel="noopener noreferrer">
              <Play className="h-4 w-4" />
              Watch
            </a>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={finalUrl} download={`vivora-${jobId.slice(0, 8)}.mp4`}>
              <Download className="h-4 w-4" />
            </a>
          </Button>
        </div>
      )}

      {isFailed && job?.error_message && (
        <p className="text-xs text-destructive">{job.error_message}</p>
      )}
    </div>
  )
}
