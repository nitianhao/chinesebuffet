'use client'

import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { useRef, useEffect } from 'react'

const GA_MEASUREMENT_ID = 'G-9FHEH1V40Y'

/**
 * Sends a page_view to GA4 when the route changes (client-side navigation).
 * The initial page load is already tracked by the gtag config script in the layout.
 */
function PageViewTracker() {
  const pathname = usePathname()
  const prevPathRef = useRef<string | null>(null)

  useEffect(() => {
    if (prevPathRef.current === pathname) return
    const isFirstLoad = prevPathRef.current === null
    prevPathRef.current = pathname
    if (isFirstLoad) return // initial page already tracked by gtag config in Script
    if (typeof window.gtag === 'function') {
      window.gtag('config', GA_MEASUREMENT_ID, { page_path: pathname })
    }
  }, [pathname])

  return null
}

export default function GoogleAnalytics() {
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="gtag-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}');
        `}
      </Script>
      <PageViewTracker />
    </>
  )
}
