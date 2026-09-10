// 届命名空间学号的展示层契约：只在渲染时剥 G{1|2|3}:: 前缀，
// 裸学号 / 临时学号原样；空值返回空串（绝不把 null 渲染成字符串）。

import { describe, expect, it } from 'vitest'

import { displaySid } from '../src/lib/sid'

describe('displaySid 剥届前缀', () => {
  it('G1:: / G2:: / G3:: 前缀都被剥掉', () => {
    expect(displaySid('G1::7250601')).toBe('7250601')
    expect(displaySid('G2::20240101')).toBe('20240101')
    expect(displaySid('G3::20230101')).toBe('20230101')
  })

  it('裸学号原样返回（当前活跃届）', () => {
    expect(displaySid('7250601')).toBe('7250601')
    expect(displaySid('20250201')).toBe('20250201')
  })

  it('中间出现 G1:: 不剥（只认开头，避免误伤普通编号）', () => {
    expect(displaySid('XG1::7250601')).toBe('XG1::7250601')
    expect(displaySid('G4::7250601')).toBe('G4::7250601')
  })

  it('临时学号 TMP- 前缀不受影响', () => {
    expect(displaySid('TMP-2-6-张三')).toBe('TMP-2-6-张三')
  })

  it('null / undefined / 空串返回空串', () => {
    expect(displaySid(null)).toBe('')
    expect(displaySid(undefined)).toBe('')
    expect(displaySid('')).toBe('')
  })
})
