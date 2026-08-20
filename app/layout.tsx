import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'MCP Gateway Hub',
  description: 'Dynamic MCP Gateway for Gemini Spark',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}