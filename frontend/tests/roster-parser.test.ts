// 升级换届「粘贴名单」解析行为契约：
//   单列=姓名（不再被当成学号）、两列=学号,姓名（多种分隔符容错）、
//   格式错误 / 同批重复显式报错，绝不静默产出坏行。

import { describe, expect, it } from 'vitest'

import { parseRosterText } from '../src/lib/roster-parser'

describe('parseRosterText 两种合法格式', () => {
  it('单列姓名 → 仅姓名行（student_id 为 null，不拿姓名当学号）', () => {
    const { rows, errors } = parseRosterText('张三\n李四\n王五')
    expect(errors).toEqual([])
    expect(rows).toEqual([
      { student_id: null, name: '张三' },
      { student_id: null, name: '李四' },
      { student_id: null, name: '王五' },
    ])
  })

  it('两列「学号,姓名」→ 正式学号行（英文逗号 / 中文逗号 / 制表符 / 空格分隔均可）', () => {
    const text = ['20250201,张三', '20250202，李四', '20250203\t王五', '20250204 赵六'].join('\n')
    const { rows, errors } = parseRosterText(text)
    expect(errors).toEqual([])
    expect(rows).toEqual([
      { student_id: '20250201', name: '张三' },
      { student_id: '20250202', name: '李四' },
      { student_id: '20250203', name: '王五' },
      { student_id: '20250204', name: '赵六' },
    ])
  })

  it('两种格式可混贴；空行与首尾空白被忽略，CRLF 兼容', () => {
    const { rows, errors } = parseRosterText('  20250201,张三  \r\n\r\n李四\n')
    expect(errors).toEqual([])
    expect(rows).toEqual([
      { student_id: '20250201', name: '张三' },
      { student_id: null, name: '李四' },
    ])
  })
})

describe('parseRosterText 校验错误（必须阻止提交）', () => {
  it('单列纯数字（漏姓名的学号）→ 报错并提示两列格式', () => {
    const { rows, errors } = parseRosterText('20250201')
    expect(rows).toEqual([])
    expect(errors[0]).toContain('第 1 行')
    expect(errors[0]).toContain('学号,姓名')
  })

  it('超过两列 → 报错', () => {
    const { errors } = parseRosterText('20250201,张三,多余')
    expect(errors.length).toBe(1)
    expect(errors[0]).toContain('超过两列')
  })

  it('同批重复学号 → 报错并指明两处行号', () => {
    const { errors } = parseRosterText('20250201,张三\n20250201,李四')
    expect(errors[0]).toContain('学号 20250201')
    expect(errors[0]).toContain('第 1 行')
  })

  it('同批重复姓名（含仅姓名行）→ 报错', () => {
    const { errors } = parseRosterText('张三\n20250201,张三')
    expect(errors[0]).toContain('张三')
    expect(errors[0]).toContain('重复')
  })
})
