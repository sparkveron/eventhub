type LoadingStateProps = {
  label?: string
}

export function LoadingState({ label = 'Loading content' }: LoadingStateProps) {
  return (
    <div className="card flex min-h-40 items-center justify-center text-sm font-medium text-slate-600">
      {label}...
    </div>
  )
}
