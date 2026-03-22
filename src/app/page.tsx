import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden">
      {/* 背景光暈 */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(255,179,0,0.08)_0%,_transparent_60%)]" />

      <div className="relative z-10 text-center px-6 max-w-2xl">
        {/* Logo / 名稱 */}
        <h1 className="text-5xl md:text-7xl font-black mb-4 animate-shimmer">
          MarketingScore
        </h1>
        <p className="text-lg text-gold-200/60 mb-12">
          掃碼入桌 · 即時投票 · 大螢幕跳分
          <br />
          讓每一場活動都充滿互動與驚喜
        </p>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/admin"
            className="px-8 py-4 rounded-xl text-lg font-bold
              bg-gradient-to-r from-gold-600 to-gold-400 text-surface-dark
              shadow-[0_0_20px_rgba(255,179,0,0.3)]
              hover:shadow-[0_0_30px_rgba(255,179,0,0.5)]
              transition-shadow"
          >
            建立活動 ✨
          </Link>
          <Link
            href="/join"
            className="px-8 py-4 rounded-xl text-lg font-bold
              border-2 border-gold-400/30 text-gold-200
              hover:border-gold-400/60 hover:bg-gold-400/5
              transition-all"
          >
            加入活動 🎤
          </Link>
        </div>

        {/* 功能亮點 */}
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
          {[
            {
              icon: '📱',
              title: '手機投票',
              desc: '掃 QR Code 即可參與，不需下載 App',
            },
            {
              icon: '🖥️',
              title: '大螢幕展示',
              desc: '金碧輝煌的即時排行榜，分數跳動動畫',
            },
            {
              icon: '🎮',
              title: '多種遊戲',
              desc: '評分、猜謎、歡呼對決，靈活自訂',
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className="p-5 rounded-xl bg-surface-card/50 border border-white/5"
            >
              <div className="text-3xl mb-3">{feature.icon}</div>
              <div className="font-bold text-gold-200 mb-1">{feature.title}</div>
              <div className="text-sm text-white/40">{feature.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
