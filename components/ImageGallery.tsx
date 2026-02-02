'use client';

import { useState } from 'react';

interface ImageGalleryProps {
  images: Array<{ photoReference?: string; [key: string]: any } | string>;
  buffetName: string;
  imagesCount?: number | null;
}

/**
 * Build a proxied image URL from photo data
 * - Uses photoReference via /api/photo proxy
 */
function getProxiedImageUrl(
  img: string | { photoReference?: string; widthPx?: number; heightPx?: number; [key: string]: any }
): string | null {
  if (typeof img === 'string' && img.startsWith('places/')) {
    return `/api/photo?photoReference=${encodeURIComponent(img)}&w=800`;
  }
  if (img && typeof img === 'object' && img.photoReference) {
    return `/api/photo?photoReference=${encodeURIComponent(img.photoReference)}&w=800`;
  }
  return null;
}

export default function ImageGallery({ images, buffetName, imagesCount }: ImageGalleryProps) {
  const [selectedImage, setSelectedImage] = useState<number | null>(null);

  // Build proxied URLs for thumbnails
  const imageUrls = images
    .map((img) => getProxiedImageUrl(img))
    .filter((url): url is string => url !== null);
  
  // Build proxied URLs for full-size images (lightbox)
  const fullSizeUrls = images
    .map((img) => getProxiedImageUrl(img))
    .filter((url): url is string => url !== null);

  if (!imageUrls || imageUrls.length === 0) {
    return null;
  }

  const openLightbox = (index: number) => {
    setSelectedImage(index);
  };

  const closeLightbox = () => {
    setSelectedImage(null);
  };

  const navigateImage = (direction: 'prev' | 'next') => {
    if (selectedImage === null) return;
    
    if (direction === 'prev') {
      setSelectedImage(selectedImage === 0 ? imageUrls.length - 1 : selectedImage - 1);
    } else {
      setSelectedImage(selectedImage === imageUrls.length - 1 ? 0 : selectedImage + 1);
    }
  };

  // Show first 6 images in grid, rest can be viewed in lightbox
  const displayImages = imageUrls.slice(0, 6);
  const remainingCount = imageUrls.length - displayImages.length;

  return (
    <>
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 sm:px-6 pt-5 sm:pt-6 pb-4">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-pink-100 rounded-lg">
                <svg className="w-5 h-5 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                Photos
              </h2>
            </div>
            {imageUrls.length > 6 && (
              <button
                onClick={() => openLightbox(0)}
                className="px-3 py-1.5 text-[var(--accent1)] hover:text-[var(--accent1)] hover:bg-[var(--surface2)] font-semibold text-sm rounded-lg transition-colors active:scale-95"
              >
                View All →
              </button>
            )}
          </div>
        </div>
        <div className="px-4 sm:px-6 pb-5 sm:pb-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
            {displayImages.map((imageUrl, index) => (
            <div
              key={index}
              className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-100 cursor-pointer group hover:border-[var(--accent1)] hover:shadow-md transition-all"
              onClick={() => openLightbox(index)}
            >
              <img
                src={imageUrl}
                alt={`${buffetName} - Photo ${index + 1}`}
                className="w-full h-full object-cover"
                loading={index < 3 ? 'eager' : 'lazy'}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-opacity flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
                  />
                </svg>
              </div>
            </div>
            ))}
            
            {remainingCount > 0 && (
              <div
                className="relative aspect-square rounded-lg overflow-hidden border-2 border-dashed border-gray-300 bg-gray-50 cursor-pointer hover:border-[var(--accent1)] hover:bg-[var(--surface2)] transition-all flex items-center justify-center"
                onClick={() => openLightbox(6)}
              >
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-600 mb-1">
                    +{remainingCount}
                  </div>
                  <div className="text-sm text-gray-500">
                    {remainingCount === 1 ? 'more photo' : 'more photos'}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Lightbox Modal */}
      {selectedImage !== null && (
        <div
          className="fixed inset-0 z-50 bg-black bg-opacity-90 flex items-center justify-center p-4"
          onClick={closeLightbox}
        >
          <div className="relative max-w-7xl max-h-full w-full h-full flex items-center justify-center">
            {/* Close Button */}
            <button
              onClick={closeLightbox}
              className="absolute top-4 right-4 text-white hover:text-gray-300 z-10 bg-black bg-opacity-50 rounded-full p-2 transition-colors"
              aria-label="Close"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>

            {/* Previous Button */}
            {imageUrls.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigateImage('prev');
                }}
                className="absolute left-4 text-white hover:text-gray-300 z-10 bg-black bg-opacity-50 rounded-full p-3 transition-colors"
                aria-label="Previous image"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
            )}

            {/* Next Button */}
            {imageUrls.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigateImage('next');
                }}
                className="absolute right-4 text-white hover:text-gray-300 z-10 bg-black bg-opacity-50 rounded-full p-3 transition-colors"
                aria-label="Next image"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            )}

            {/* Image */}
            <img
              src={fullSizeUrls[selectedImage]}
              alt={`${buffetName} - Photo ${selectedImage + 1}`}
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
              onError={(e) => {
                e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23ddd" width="400" height="300"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="20" dy="10.5" font-weight="bold" x="50%25" y="50%25" text-anchor="middle"%3EImage not available%3C/text%3E%3C/svg%3E';
              }}
            />

            {/* Image Counter */}
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white bg-black bg-opacity-50 rounded-full px-4 py-2 text-sm">
              {selectedImage + 1} / {imageUrls.length}
            </div>
          </div>

          {/* Keyboard Navigation */}
          <div
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Escape') closeLightbox();
              if (e.key === 'ArrowLeft') navigateImage('prev');
              if (e.key === 'ArrowRight') navigateImage('next');
            }}
            className="absolute inset-0"
          />
        </div>
      )}
    </>
  );
}
