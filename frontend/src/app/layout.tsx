import type { Metadata } from 'next'
import './globals.css'
import { ChatDrawer } from '../components'
import { Shell } from '@/components/layout/Shell'

export const metadata: Metadata = {
  title: '成绩追踪',
  description: '高中成绩分析 Web App',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="bg-slate-50">
        <Shell>{children}</Shell>
        <ChatDrawer />
      </body>
    </html>
  )
}
