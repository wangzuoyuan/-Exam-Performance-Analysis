'use client'

import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background print:min-h-0 print:bg-white">
      <Sidebar />
      <div className="lg:pl-[232px] print:pl-0">
        <Topbar />
        <main>
          <div className="mx-auto w-full max-w-[1520px] px-4 py-5 sm:px-6 sm:py-6 lg:px-7 lg:py-7 print:max-w-none print:px-0 print:py-0">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
