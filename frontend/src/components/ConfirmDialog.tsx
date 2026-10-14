type ConfirmDialogProps = {
  title: string
  description: string
  confirmLabel?: string
  variant?: 'danger' | 'primary'
  isBusy?: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel = 'Delete',
  variant = 'danger',
  isBusy = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const confirmClass =
    variant === 'primary'
      ? 'btn btn-primary'
      : 'btn bg-red-600 text-white hover:bg-red-700'

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
        <h2 id="confirm-dialog-title" className="text-xl font-semibold text-slate-950">
          {title}
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={isBusy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className={confirmClass}
            disabled={isBusy}
            onClick={onConfirm}
          >
            {isBusy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
