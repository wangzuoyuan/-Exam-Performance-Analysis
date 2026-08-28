// 升级换届「粘贴名单」解析：同一个输入框同时支持两种格式——
//   单列「姓名」（尚无学号，先记作业，后端生成临时学号）
//   两列「学号,姓名」（正式学号；命中同名待补学号学生时后端自动替换）
// 分隔符容错：英文逗号 / 中文逗号 / 制表符 / 空格。任何格式问题都显式报错，
// 绝不静默把姓名当学号提交。

export interface ParsedRosterRow {
  /** 正式学号；仅姓名行为 null（由后端生成临时学号） */
  student_id: string | null
  name: string
}

export interface RosterParseResult {
  rows: ParsedRosterRow[]
  /** 逐行错误（带行号），非空时调用方必须阻止提交 */
  errors: string[]
}

/** 纯数字判定：单列里出现纯数字串几乎必然是漏了姓名的学号 */
function isNumeric(token: string): boolean {
  return /^\d+$/.test(token)
}

export function parseRosterText(text: string): RosterParseResult {
  const rows: ParsedRosterRow[] = []
  const errors: string[] = []
  const seenSid = new Map<string, number>()
  const seenName = new Map<string, number>()

  function push(row: ParsedRosterRow, lineNo: number) {
    if (row.student_id != null) {
      const first = seenSid.get(row.student_id)
      if (first != null) {
        errors.push(`第 ${lineNo} 行：学号 ${row.student_id} 与第 ${first} 行重复`)
        return
      }
      seenSid.set(row.student_id, lineNo)
    }
    const firstName = seenName.get(row.name)
    if (firstName != null) {
      errors.push(`第 ${lineNo} 行：姓名「${row.name}」与第 ${firstName} 行重复，同批不能出现两个同名`)
      return
    }
    seenName.set(row.name, lineNo)
    rows.push(row)
  }

  text.split(/\r?\n/).forEach((raw, index) => {
    const lineNo = index + 1
    const line = raw.trim()
    if (!line) return
    const parts = line
      .split(/[,\t，]|\s+/)
      .map((s) => s.trim())
      .filter(Boolean)

    if (parts.length === 1) {
      const token = parts[0]
      if (isNumeric(token)) {
        errors.push(`第 ${lineNo} 行「${token}」是纯数字，缺少姓名；请用「学号,姓名」两列格式`)
        return
      }
      push({ student_id: null, name: token }, lineNo)
    } else if (parts.length === 2) {
      push({ student_id: parts[0], name: parts[1] }, lineNo)
    } else {
      errors.push(`第 ${lineNo} 行「${line}」超过两列；每行只能是「学号,姓名」或单独「姓名」`)
    }
  })

  return { rows, errors }
}
