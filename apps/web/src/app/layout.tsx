import '@picocss/pico/css/pico.min.css'
import './globals.css'
import type { Metadata } from 'next'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: 'TRS Tickets - Admin Panel',
  description: 'Professional Discord Ticket System',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="de" data-theme="light" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"
        />
      </head>
      <body className="full-screen-layout">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
