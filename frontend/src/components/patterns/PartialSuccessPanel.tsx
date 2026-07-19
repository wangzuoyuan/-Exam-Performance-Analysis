import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'

export function PartialSuccessPanel({ success, failed, label = '处理结果' }: { success: number; failed: number; label?: string }) {
  const partial = success > 0 && failed > 0
  const Icon = partial ? AlertTriangle : failed > 0 ? XCircle : CheckCircle2
  const tone = partial ? 'border-warning-500/35 bg-warning-50 text-warning-700' : failed > 0 ? 'border-danger-500/35 bg-danger-50 text-danger-700' : 'border-success-500/35 bg-success-50 text-success-700'
  const status = partial ? '部分成功' : failed > 0 ? '处理失败' : '全部成功'

  return (
    <div className={`flex items-start gap-3 rounded-[10px] border px-4 py-3 ${tone}`} role={failed > 0 ? 'alert' : 'status'}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div>
        <p className="text-sm font-extrabold">{label}：{status}</p>
        <p className="mt-0.5 text-xs">成功 {success} 项，失败 {failed} 项。失败项目不会被静默忽略。</p>
      </div>
    </div>
  )
}
