'use client';

import { useState } from 'react';

interface SafeImageProps {
  src: string;
  alt: string;
  loading?: 'lazy' | 'eager';
  width?: number;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
}

export default function SafeImage({
  src,
  alt,
  loading = 'lazy',
  width,
  height,
  className,
  style,
}: SafeImageProps) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return null; // Hide broken images
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      width={width}
      height={height}
      className={className}
      style={style}
      onError={() => {
        setHasError(true);
      }}
    />
  );
}
