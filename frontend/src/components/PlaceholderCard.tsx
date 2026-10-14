type PlaceholderCardProps = {
  title: string
  description: string
}

export function PlaceholderCard({ title, description }: PlaceholderCardProps) {
  return (
    <section className="card">
      <h1 className="page-title">{title}</h1>
      <p className="page-subtitle mt-3">{description}</p>
    </section>
  )
}
