'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';

type GalleryImage = {
  photoReference: string;
  aspectRatio: number;
  alt: string;
};

interface BuffetPhotoGalleryProps {
  images: GalleryImage[];
  categoryLabels?: string[];
}

const buildPhotoUrl = (photoReference: string, width: number) =>
  `/api/photo?photoReference=${encodeURIComponent(photoReference)}&w=${width}`;
const BLUR_DATA_URL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

export default function BuffetPhotoGallery({ images, categoryLabels = [] }: BuffetPhotoGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const activeImage = images[activeIndex];
  const thumbImages = useMemo(() => images.slice(0, 12), [images]);

  useEffect(() => {
    if (!isViewerOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsViewerOpen(false);
      }
      if (event.key === 'ArrowRight') {
        setActiveIndex((prev) => (prev + 1) % images.length);
      }
      if (event.key === 'ArrowLeft') {
        setActiveIndex((prev) => (prev - 1 + images.length) % images.length);
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [images.length, isViewerOpen]);

  if (!activeImage) return null;

  const viewer = isViewerOpen
    ? createPortal(
        <div className="fixed inset-0 z-[10003]" role="dialog" aria-modal="true" aria-label="Photo viewer">
          <button
            type="button"
            aria-label="Close viewer"
            className="absolute inset-0 bg-black/70"
            onClick={() => setIsViewerOpen(false)}
          />
          <div className="relative z-10 flex h-full w-full items-center justify-center px-4">
            <div
              className="relative w-full max-w-3xl overflow-hidden rounded-[var(--radius-lg)] bg-black"
              style={{ aspectRatio: activeImage.aspectRatio }}
            >
              <Image
                src={buildPhotoUrl(activeImage.photoReference, 1200)}
                alt={activeImage.alt}
                fill
                sizes="100vw"
                quality={70}
                className="object-contain"
              />
            </div>
          </div>
          <div className="absolute right-4 top-4 z-20">
            <button
              type="button"
              onClick={() => setIsViewerOpen(false)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white"
              aria-label="Close"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => setActiveIndex((prev) => (prev - 1 + images.length) % images.length)}
                className="absolute left-4 top-1/2 z-20 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white"
                aria-label="Previous photo"
              >
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M12.79 15.77a.75.75 0 01-1.06.02l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 111.04 1.08L8.83 10l3.96 3.71a.75.75 0 01.02 1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setActiveIndex((prev) => (prev + 1) % images.length)}
                className="absolute right-4 top-1/2 z-20 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white"
                aria-label="Next photo"
              >
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M7.21 4.23a.75.75 0 011.06-.02l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 11-1.04-1.08L11.17 10 7.23 6.29a.75.75 0 01-.02-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </>
          )}
        </div>,
        document.body
      )
    : null;

  return (
    <>
      {viewer}
      {categoryLabels.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {categoryLabels.map((label, index) => (
            <span
              key={`${label}-${index}`}
              className="rounded-full border border-[var(--border)] bg-[var(--surface2)] px-3 py-1 text-xs font-medium text-[var(--muted)]"
            >
              {label}
            </span>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setIsViewerOpen(true)}
        className="relative mt-4 block w-full overflow-hidden rounded-[var(--radius-lg)] bg-[var(--surface2)]"
        style={{ aspectRatio: activeImage.aspectRatio }}
        aria-label="Open photo viewer"
      >
        <Image
          src={buildPhotoUrl(activeImage.photoReference, 960)}
          alt={activeImage.alt}
          fill
          sizes="(min-width: 1024px) 640px, 100vw"
          placeholder="blur"
          blurDataURL={BLUR_DATA_URL}
          quality={75}
          className="object-cover"
        />
      </button>
      {thumbImages.length > 1 && (
        <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
          {thumbImages.map((image, index) => (
            <button
              key={image.photoReference}
              type="button"
              onClick={() => {
                setActiveIndex(index);
                setIsViewerOpen(true);
              }}
              className={`relative h-20 w-28 flex-shrink-0 overflow-hidden rounded-[var(--radius-md)] ${
                index === activeIndex ? 'ring-2 ring-[var(--accent1)]' : 'ring-1 ring-[var(--border)]'
              }`}
              style={{ aspectRatio: '4 / 3' }}
              aria-label={`Open photo ${index + 1}`}
            >
              <Image
                src={buildPhotoUrl(image.photoReference, 240)}
                alt={image.alt}
                fill
                sizes="112px"
                quality={55}
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </>
  );
}
