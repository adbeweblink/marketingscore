import type { Metadata } from 'next'
import { Noto_Sans_TC } from 'next/font/google'
import './globals.css'

const notoSansTC = Noto_Sans_TC({
  subsets: ['latin'],
  weight: ['400', '700', '900'],
  variable: '--font-noto-sans-tc',
  display: 'block',
})

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
    <html lang="zh-TW" className={notoSansTC.variable}>
      <body className={`${notoSansTC.className} min-h-screen bg-surface-dark text-white antialiased`}>
        {children}
      </body>
    </html>
  )
}
