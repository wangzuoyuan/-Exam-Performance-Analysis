'use client'

import { useEffect, useState, useRef, KeyboardEvent } from 'react'
import { Bot, Send } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

interface Message {
  role: 'user' | 'assistant'
  content: string
  tool_calls?: any[]
}

function visibleAssistantContent(content: string) {
  return content
    .split('\n')
    .filter(line => !line.trim().match(/^\[已查询：.+\]$/))
    .join('\n')
    .trim()
}

function buildPageContext() {
  if (typeof window === 'undefined') return {}

  const { pathname, href } = window.location
  const studentMatch = pathname.match(/^\/student\/([^/]+)/)
  const examMatch = pathname.match(/^\/exam\/([^/]+)/)

  return {
    page: { pathname, href },
    student_id: studentMatch ? decodeURIComponent(studentMatch[1]) : undefined,
    exam_id: examMatch ? Number(examMatch[1]) : undefined,
  }
}

export default function ChatDrawer() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [currentText, setCurrentText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener('open-chat', handler)
    return () => window.removeEventListener('open-chat', handler)
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, currentText])

  const sendMessage = async () => {
    if (!input.trim() || streaming) return

    const userMsg = { role: 'user' as const, content: input }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setStreaming(true)
    setCurrentText('')

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, userMsg], context: buildPageContext() }),
      })

      const reader = res.body?.getReader()
      if (!reader) return

      const decoder = new TextDecoder()
      let done = false
      let buffer = ''
      let assistantText = ''

      const processEvent = (eventText: string) => {
        const dataLine = eventText
          .split('\n')
          .find(line => line.startsWith('data:'))
        if (!dataLine) return
        try {
          const event = JSON.parse(dataLine.slice(5).trim())
          if (event.type === 'text') {
            assistantText += event.delta || ''
            setCurrentText(assistantText)
          }
        } catch {
          // Ignore malformed SSE frames.
        }
      }

      while (!done) {
        const { value, done: d } = await reader.read()
        done = d
        if (value) {
          buffer += decoder.decode(value, { stream: true })
          const events = buffer.split('\n\n')
          buffer = events.pop() || ''
          events.forEach(processEvent)
        }
      }
      if (buffer.trim()) processEvent(buffer)

      if (assistantText) {
        setMessages(prev => [...prev, { role: 'assistant', content: assistantText }])
        setCurrentText('')
      }
    } catch (err) {
      console.error(err)
    } finally {
      setStreaming(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const renderBubble = (role: 'user' | 'assistant', content: string, key?: string | number) => {
    const isUser = role === 'user'
    const visibleContent = isUser ? content : visibleAssistantContent(content)
    if (!visibleContent) return null
    return (
      <div
        key={key}
        className={cn('flex w-full items-start gap-2', isUser ? 'justify-end' : 'justify-start')}
      >
        {!isUser && (
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-brand-50 text-brand-600">
              <Bot className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
        )}
        <div
          className={cn(
            'max-w-[80%] whitespace-pre-wrap break-words px-3 py-2 text-sm leading-relaxed shadow-sm',
            isUser
              ? 'rounded-2xl rounded-tr-sm bg-brand-600 text-white'
              : 'rounded-2xl rounded-tl-sm bg-slate-100 text-slate-900'
          )}
        >
          {visibleContent}
        </div>
        {isUser && (
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-brand-600 text-white">我</AvatarFallback>
          </Avatar>
        )}
      </div>
    )
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-slate-200 px-5 py-4 text-left">
          <SheetTitle className="text-base font-semibold text-slate-900">
            AI 对话助手
          </SheetTitle>
          <SheetDescription className="text-xs text-slate-500">
            基于成绩数据回答你的问题
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="space-y-4 px-5 py-4">
            {messages.length === 0 && !currentText && (
              <div className="flex h-full items-center justify-center py-10 text-center text-xs text-slate-400">
                还没有对话，输入问题开始吧。
              </div>
            )}
            {messages.map((m, i) => renderBubble(m.role, m.content, i))}
            {currentText && renderBubble('assistant', currentText, 'streaming')}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>

        <div className="border-t border-slate-200 bg-white px-5 py-3">
          <div className="flex items-center gap-2">
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="问我任何关于成绩的问题..."
              disabled={streaming}
              className="flex-1"
            />
            <Button
              type="button"
              size="icon"
              onClick={sendMessage}
              disabled={streaming || !input.trim()}
              aria-label="发送"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
