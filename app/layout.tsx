import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import dynamic from 'next/dynamic'
import './globals.css'
import './design-system.css'
import BottomNav from '@/components/site/BottomNav'
import GoogleAnalytics from '@/components/analytics/GoogleAnalytics'
import { getSiteUrl } from '@/lib/site-url'

// ---------------------------------------------------------------------------
// Font: self-hosted via next/font — no external @import, non-blocking,
// font-display:swap by default.  The CSS variable --font-inter is applied to
// <html> so the design-system --font-sans picks it up.
// ---------------------------------------------------------------------------
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-inter',
})

const Header = dynamic(() => import('@/components/site/Header'), {
  ssr: true,
})

const siteUrl = getSiteUrl();

// Do NOT set robots here — each page sets its own so page-level robots are authoritative.
// (Layout-level robots can override or merge with page metadata in some Next.js versions.)
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Chinese Buffets Directory - Find All-You-Can-Eat Chinese Buffets Near You',
  description: 'Discover Chinese buffets across the USA. Find locations, hours, prices, and ratings for all-you-can-eat Chinese buffets in your city.',
  openGraph: {
    url: siteUrl,
  },
}

// ---------------------------------------------------------------------------
// LCP audit mode — add ?lcp_debug to any page URL to activate.
//
// The inline script (~350 bytes) is always present but the
// PerformanceObserver is only created when the URL contains ?lcp_debug.
// This avoids a rebuild; just open the page with the query param.
//
//   npm run start
//   open http://localhost:3000/?lcp_debug
//   → check browser console for [LCP] log
// ---------------------------------------------------------------------------
const LCP_SCRIPT = `(function(){
  if(location.search.indexOf('lcp_debug')===-1) return;
  if(!window.PerformanceObserver) return;
  new PerformanceObserver(function(l){
    var entries=l.getEntries();
    for(var i=0;i<entries.length;i++){
      var e=entries[i];
      var el=e.element;
      var info={
        lcpMs:Math.round(e.startTime),
        size:e.size,
        tag:el?el.tagName:'(none)',
        id:el?el.id:'',
        src:el?(el.currentSrc||el.src||''):'',
        textLen:el?(el.textContent?el.textContent.length:0):0,
        classes:el?el.className.toString().slice(0,80):'',
      };
      console.log('%c[LCP]','color:#C1121F;font-weight:bold',info.lcpMs+'ms',info);
    }
  }).observe({type:'largest-contentful-paint',buffered:true});
})();`

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <GoogleAnalytics />
        {/* LCP audit — activated by ?lcp_debug in the URL (see comment above) */}
        <script dangerouslySetInnerHTML={{ __html: LCP_SCRIPT }} />
        <Header />
        <div className="pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))] md:pb-0">
          {children}
        </div>
        <BottomNav />
      </body>
    </html>
  )
}

