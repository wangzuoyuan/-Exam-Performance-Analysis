// @vitest-environment jsdom

import * as React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  HomeroomScopeProvider,
  useHomeroomScope,
} from '../src/components/providers/HomeroomScopeProvider'

const teacher = {
  id: 1,
  name: '测试老师',
  target_class_high1: 4,
  target_class_high2: 11,
  target_class_high3: null,
  active_grade: 1,
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function ScopeProbe() {
  const { activeScope, error, selectScope, switching } = useHomeroomScope()

  return (
    <div>
      <p data-testid="active-scope">{activeScope?.label ?? '无班级'}</p>
      <p role="alert">{error ?? ''}</p>
      <button
        type="button"
        disabled={switching}
        onClick={() => void selectScope(2).catch(() => undefined)}
      >
        切换高二
      </button>
    </div>
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('HomeroomScopeProvider active-grade switching', () => {
  it('refreshes the page after a successful active-grade PATCH', async () => {
    const reloadPage = vi.fn()
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(teacher))
      .mockResolvedValueOnce(jsonResponse({ active_grade: 2 }))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <HomeroomScopeProvider reloadPage={reloadPage}>
        <ScopeProbe />
      </HomeroomScopeProvider>
    )

    expect(await screen.findByText('高1 · 4班')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '切换高二' }))

    await waitFor(() => expect(reloadPage).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId('active-scope').textContent).toBe('高2 · 11班')
    expect(screen.getByRole('alert').textContent).toBe('')
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/rollover/active-grade',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ grade: 2 }) })
    )
  })

  it('does not refresh and exposes the server error after a failed PATCH', async () => {
    const reloadPage = vi.fn()
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(teacher))
      .mockResolvedValueOnce(jsonResponse({ detail: '高2班级配置失效' }, 409))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <HomeroomScopeProvider reloadPage={reloadPage}>
        <ScopeProbe />
      </HomeroomScopeProvider>
    )

    expect(await screen.findByText('高1 · 4班')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '切换高二' }))

    expect(await screen.findByText('高2班级配置失效')).toBeTruthy()
    expect(reloadPage).not.toHaveBeenCalled()
    expect(screen.getByTestId('active-scope').textContent).toBe('高1 · 4班')
  })
})
