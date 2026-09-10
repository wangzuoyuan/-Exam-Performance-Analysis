// 跨届学号命名空间（backend/app/db/sid_space.py）的展示层配套：
// 每学年重编学号的学校，历史届学号在库内带 G{1|2|3}:: 前缀（如 G1::7250601），
// 当前活跃届永远是裸学号。API/JSON 契约里的 student_id 保持存储原值。

/**
 * 学号展示化：剥掉开头的 G{1|2|3}:: 前缀，其余原样返回。
 * 仅用于渲染展示；传参/回传一律用原值（查询、链接、操作接口的 student_id 不做任何改写）。
 */
export function displaySid(sid: string | null | undefined): string {
  if (!sid) return ''
  return sid.replace(/^G[123]::/, '')
}
