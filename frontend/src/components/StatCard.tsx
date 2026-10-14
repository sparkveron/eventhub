type StatCardProps = {
  label: string
  value: string | number
  helper?: string
}

export function StatCard({ label, value, helper }: StatCardProps) {
  return (
    <article className="flex min-h-36 flex-col justify-between rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <p className="mt-3 break-words text-3xl font-semibold leading-tight text-slate-950">
          {value}
        </p>
      </div>
      {helper ? (
        <p className="mt-4 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">
          {helper}
        </p>
      ) : (
        <span className="mt-4 h-8" aria-hidden="true" />
      )}
    </article>
  )
}
