'use client'

import { useEffect, useState } from 'react'
import { Sidebar, type TeacherSummary } from './Sidebar'
import { Topbar } from './Topbar'

interface RawTeacher {
  name?: string | null
  target_class_high1?: number | null
  target_class_high2?: number | null
  target_class_high3?: number | null
}

function normalizeTeacher(raw: RawTeacher | null): TeacherSummary | null {
  if (!raw) return null
  // 优先取存在的最高年级（高3 > 高2 > 高1）
  const candidates: Array<[number, number | null | undefined]> = [
    [3, raw.target_class_high3],
    [2, raw.target_class_high2],
    [1, raw.target_class_high1],
  ]
  const hit = candidates.find(([, v]) => v != null)
  return {
    name: raw.name ?? null,
    current_grade: hit ? hit[0] : null,
    current_class: hit ? (hit[1] as number) : null,
  }
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [teacher, setTeacher] = useState<TeacherSummary | null>(null)

  useEffect(() => {
    let aborted = false
    fetch('/api/teacher')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: RawTeacher | null) => {
        if (!aborted) setTeacher(normalizeTeacher(data))
      })
      .catch(() => {
        if (!aborted) setTeacher(null)
      })
    return () => {
      aborted = true
    }
  }, [])

  function handleNameChange(name: string) {
    setTeacher((prev) => prev ? { ...prev, name: name || null } : prev)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar teacher={teacher} onNameChange={handleNameChange} />
      <div className="md:pl-60">
        <Topbar teacher={teacher} />
        <main>
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
        </main>
      </div>
    </div>
  )
}
