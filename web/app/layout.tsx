import React from "react"
import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { ThemeProvider } from '@/components/theme-provider'
import { SmoothScroll } from '@/components/fx/smooth-scroll'
import './globals.css'

// Self-hosted (fontsource) so builds never depend on reaching Google Fonts.
const instrumentSans = localFont({
  src: '../node_modules/@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2',
  weight: '400 700',
  variable: '--font-instrument',
})

const instrumentSerif = localFont({
  src: '../node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2',
  weight: '400',
  variable: '--font-instrument-serif',
})

const jetbrainsMono = localFont({
  src: '../node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2',
  weight: '100 800',
  variable: '--font-jetbrains',
})

const description =
  'Trending GitHub repositories, agent skills, MCP servers and coding agents, ranked by real star growth and updated every 4 hours.'

export const metadata: Metadata = {
  metadataBase: new URL('https://gitofanton.com'),
  title: {
    default: 'Git of Anton',
    template: '%s · Git of Anton',
  },
  description,
  openGraph: {
    title: 'Git of Anton',
    description,
    url: 'https://gitofanton.com',
    siteName: 'Git of Anton',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Git of Anton' }],
    type: 'website',
  },
  twitter: { card: 'summary_large_image', images: ['/og.png'] },
  // Brand pack (2026-10-18): the grid "A" on the tab (switches with the OS theme), full mark elsewhere.
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
      // Google Search shows a favicon only from a square PNG/ICO/SVG at a multiple of 48 px.
      { url: '/favicon-48.png', type: 'image/png', sizes: '48x48' },
      { url: '/android-chrome-192.png', type: 'image/png', sizes: '192x192' },
    ],
    apple: '/apple-touch-icon.png',
    other: [{ rel: 'mask-icon', url: '/safari-pinned-tab.svg', color: '#08090C' }],
  },
  manifest: '/site.webmanifest',
}

export const viewport: Viewport = { themeColor: '#08090C' }

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${instrumentSans.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <SmoothScroll />
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
