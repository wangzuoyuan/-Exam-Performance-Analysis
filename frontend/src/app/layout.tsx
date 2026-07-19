import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ChatDrawer } from '../components'
import AuthGate from '@/components/AuthGate'
import { Shell } from '@/components/layout/Shell'
import { HomeroomScopeProvider } from '@/components/providers/HomeroomScopeProvider'

export const metadata: Metadata = {
  title: '成绩分析（班主任版）',
  description: '面向高中班主任的成绩分析、学生画像与班级管理应用',
}

// 显式声明 viewport：device-width + 初始 1 倍，不锁 maximumScale，
// 保留用户在宽表上手动缩放的能力。
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <AuthGate>
          <HomeroomScopeProvider>
            <Shell>{children}</Shell>
            <ChatDrawer />
          </HomeroomScopeProvider>
        </AuthGate>
      </body>
    </html>
  )
}
