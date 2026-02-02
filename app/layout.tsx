import type { Metadata } from 'next'
import dynamic from 'next/dynamic'
import './globals.css'
import './design-system.css'

const Header = dynamic(() => import('@/components/site/Header'), {
  ssr: true,
})

export const metadata: Metadata = {
  title: 'Chinese Buffets Directory - Find All-You-Can-Eat Chinese Buffets Near You',
  description: 'Discover Chinese buffets across the USA. Find locations, hours, prices, and ratings for all-you-can-eat Chinese buffets in your city.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <Header />
        {children}
      </body>
    </html>
  )
}

