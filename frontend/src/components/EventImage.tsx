import { useEffect, useState } from 'react'

import { resolveMediaUrl } from '../utils/media'

type EventImageProps = {
  src: string | null
  alt: string
  className?: string
  fallbackClassName?: string
  fallbackLabel?: string
}

export function EventImage({
  src,
  alt,
  className = 'h-full w-full object-cover',
  fallbackClassName = 'flex h-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-300 px-6 text-center text-sm font-medium text-slate-600',
  fallbackLabel = 'EventHub',
}: EventImageProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const imageUrl = resolveMediaUrl(src)

  useEffect(() => {
    setImageFailed(false)
  }, [imageUrl])

  if (!imageUrl || imageFailed) {
    return <div className={fallbackClassName}>{fallbackLabel}</div>
  }

  return (
    <img
      src={imageUrl}
      alt={alt}
      className={className}
      onError={() => setImageFailed(true)}
    />
  )
}
