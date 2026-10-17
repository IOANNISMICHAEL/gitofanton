import React from "react"
import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { ThemeProvider } from '@/components/theme-provider'
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
  'Trending GitHub repositories across every category, ranked from GitHub star activity, with Hacker News and newsletter links.'

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
  twitter: { card: 'summary_large_image' },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${instrumentSans.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
