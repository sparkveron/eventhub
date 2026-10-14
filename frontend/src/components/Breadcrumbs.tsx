import { Link } from 'react-router-dom'

type BreadcrumbItem = {
  label: string
  to?: string
}

type BreadcrumbsProps = {
  items: BreadcrumbItem[]
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className="overflow-hidden">
      <ol className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-slate-500">
        {items.map((item, index) => {
          const isCurrent = index === items.length - 1

          return (
            <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-2">
              {index > 0 ? <span aria-hidden="true">/</span> : null}
              {item.to && !isCurrent ? (
                <Link
                  to={item.to}
                  className="font-medium text-slate-600 hover:text-slate-950"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className="max-w-[16rem] truncate font-medium text-slate-950 sm:max-w-md"
                  aria-current={isCurrent ? 'page' : undefined}
                  title={item.label}
                >
                  {item.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
