import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'MarketingScore — 活動即時評分平台',
  description: '掃碼入桌、即時投票、大螢幕跳分。讓每一場活動都充滿互動與驚喜。',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-TW">
      <body className="min-h-screen bg-surface-dark text-white antialiased">
        {children}
      </body>
    </html>
  )
}
