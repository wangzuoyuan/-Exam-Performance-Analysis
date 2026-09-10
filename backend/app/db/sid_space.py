"""跨届学号命名空间：让「只在学年内唯一」的学号在库内保持全局唯一。

背景：部分学校每学年重新编学号，高二新学号可能与高一旧学号同号（同号
不同人）。而本库 class_roster.student_id 是全局主键、student_alias 有
UNIQUE(student_id)，homework/special/note 也按裸学号关联——库层假设学号
全局唯一。本模块是所有「跨届写入」入口（名册导入 / 成绩上传 / 学生管理
学号操作 / 身份挂接）的统一守门：一旦本届要写入的裸学号与其他年级的裸
学号撞车，就把撞车各届的全部裸学号整体加前缀 G{grade}::（如
G1::7250601），离场届让位。当前活跃届永远保持裸学号，日常界面零变化。

不变式（实现与测试都必须遵守）：
  - 前缀只加给「非写入届」；G{g}:: 学号必属第 g 届，展示层统一剥前缀
    （display_sid）。
  - 迁移按行级年级归属圈定：成绩按 Exam.grade（同号双栖时行级可分）、
    roster/alias 按 grade 列；alias.grade 为 NULL 的行按「该学号纯属于
    本届」匹配随迁。
  - homework_record/special_record/student_note 没有年级列：仅当学号
    纯属于该届（不在其他任何年级的裸空间）时随迁；双栖号的这三类记录
    跳过并列入 ambiguous_refs 报告，绝不静默迁走可能是其他届的记录。
  - 幂等：已带 G{g}:: 前缀的行不再改动，重复调用无副作用。
  - 原子：默认与调用方同一事务（commit=False 只 flush 不提交），任一步
    失败由调用方 rollback 整体回滚。

RolloverConfirmBatch / StudentChangeLog 的 JSON 快照里的学号是完整字符串
值，只做整值替换（绝不做子串替换，避免 7250601 误伤 72506012）。
"""

import re

# 前缀形态固定为 G{1|2|3}::，与真实学号（数字/字母）绝不同形，
# 也与临时学号 TMP- 前缀互不干扰。
_NS_RE = re.compile(r"^G([123])::")

# SQLite 单条 IN 的安全块大小（远低于变量上限）
_CHUNK = 400


def namespaced_sid(grade: int, sid: str) -> str:
    """裸学号 -> 带届命名空间的存储学号。"""
    return f"G{grade}::{sid}"


def is_namespaced(sid) -> bool:
    return bool(_NS_RE.match(str(sid or "")))


def strip_ns(sid: str):
    """返回 (裸学号, 届)；无前缀时届为 None。"""
    s = str(sid or "")
    m = _NS_RE.match(s)
    if not m:
        return s, None
    return s[m.end():], int(m.group(1))


def display_sid(sid) -> str:
    """给人看的学号：剥掉 G{g}:: 前缀（chat 文本、Excel 导出、前端渲染）。"""
    return strip_ns(sid)[0]


def _chunks(seq):
    seq = list(seq)
    for i in range(0, len(seq), _CHUNK):
        yield seq[i:i + _CHUNK]


def bare_sid_spaces(db) -> dict:
    """各年级的裸学号空间（未前缀化部分）：成绩按 Exam.grade、roster/alias
    按 grade 列取 distinct 裸学号。返回 {grade: set(裸学号)}。"""
    from app.db.models import SubjectScore, Exam, ClassRoster, StudentAlias

    spaces: dict[int, set] = {}

    def _add(g, sid):
        if sid is None:
            return
        s = str(sid)
        if not s or is_namespaced(s):
            return
        spaces.setdefault(int(g), set()).add(s)

    for sid, g in (
        db.query(SubjectScore.student_id, Exam.grade)
        .join(Exam, Exam.id == SubjectScore.exam_id)
        .filter(Exam.grade.isnot(None))
        .distinct()
        .all()
    ):
        _add(g, sid)
    for sid, g in db.query(ClassRoster.student_id, ClassRoster.grade).filter(
        ClassRoster.grade.isnot(None)
    ).all():
        _add(g, sid)
    for sid, g in db.query(StudentAlias.student_id, StudentAlias.grade).filter(
        StudentAlias.grade.isnot(None)
    ).all():
        _add(g, sid)
    return spaces


def _remap_json(node, mapping: dict):
    """递归重写 JSON 结构中「整值等于某个旧学号」的字符串，其余原样。"""
    if isinstance(node, dict):
        return {k: _remap_json(v, mapping) for k, v in node.items()}
    if isinstance(node, list):
        return [_remap_json(v, mapping) for v in node]
    if isinstance(node, str):
        return mapping.get(node, node)
    return node


def namespace_grade(db, grade: int, *, commit: bool = False) -> dict:
    """把第 grade 届的全部裸学号整体前缀化（ensure_sid_space 的执行体）。

    返回 {"renamed": {旧号: 新号}, "counts": {表: 行数}, "ambiguous_refs":
    [{"student_id", "tables"}]}。幂等：该届无裸学号时返回空结果不动库。
    """
    from app.db.models import (
        SubjectScore, TotalScore, ClassRoster, StudentAlias,
        HomeworkRecord, SpecialRecord, StudentNote,
        RolloverConfirmBatch, StudentChangeLog, Exam,
    )

    spaces = bare_sid_spaces(db)
    bare = spaces.get(int(grade), set())
    if not bare:
        return {"renamed": {}, "counts": {}, "ambiguous_refs": []}

    renamed = {sid: namespaced_sid(grade, sid) for sid in sorted(bare)}
    # 双栖号：同时出现在其他年级裸空间。成绩/roster/alias 按行级年级迁移
    # 不受影响；无年级列的三张表只迁纯专属号。
    dual = {
        sid for sid, g in (
            (sid, g) for g, sids in spaces.items() if g != grade for sid in sids
        ) if sid in bare
    }
    pure = bare - dual

    counts: dict[str, int] = {}

    def _upd(model, label, extra_filter=None, ids=None, value_of=None):
        n = 0
        target_ids = ids if ids is not None else bare
        value_of = value_of or (lambda s: renamed[s])
        for chunk in _chunks(target_ids):
            q = db.query(model).filter(model.student_id.in_(chunk))
            if extra_filter is not None:
                q = q.filter(*extra_filter)
            rows = q.all()
            for r in rows:
                r.student_id = value_of(r.student_id)
                n += 1
        if n:
            counts[label] = n

    # 成绩/总分：行级按 exam.grade 圈定（双栖号在目标届考试下的行才迁）
    _upd(
        SubjectScore, "subject_score",
        extra_filter=[
            SubjectScore.exam_id.in_(
                db.query(Exam.id).filter(Exam.grade == int(grade))
            )
        ],
    )
    _upd(
        TotalScore, "total_score",
        extra_filter=[
            TotalScore.exam_id.in_(
                db.query(Exam.id).filter(Exam.grade == int(grade))
            )
        ],
    )
    # 花名册 / 别名：行级按 grade 列
    _upd(ClassRoster, "class_roster",
         extra_filter=[ClassRoster.grade == int(grade)])
    _upd(StudentAlias, "student_alias",
         extra_filter=[StudentAlias.grade == int(grade)])
    # alias.grade 为 NULL 的旧数据：按「纯属于本届」匹配随迁（不臆造 grade 值）
    _upd(StudentAlias, "student_alias_null_grade", ids=pure,
         extra_filter=[StudentAlias.grade.is_(None)])

    # 无年级列的三张表：只迁纯专属号；双栖号跳过并报告
    ambiguous: dict[str, set] = {}
    for model, label in (
        (HomeworkRecord, "homework_record"),
        (SpecialRecord, "special_record"),
        (StudentNote, "student_note"),
    ):
        for sid in sorted(dual):
            if db.query(model).filter(model.student_id == sid).count():
                ambiguous.setdefault(sid, set()).add(label)
        _upd(model, label, ids=pure)

    # JSON 快照：undo 批次与变更日志里的学号整值替换，保证 undo/审计仍可用
    batches = db.query(RolloverConfirmBatch).all()
    nb = 0
    for b in batches:
        payload = _remap_json(b.payload, renamed)
        aliases = _remap_json(b.created_aliases, renamed)
        if payload != b.payload or aliases != b.created_aliases:
            b.payload, b.created_aliases = payload, aliases
            nb += 1
    if nb:
        counts["rollover_confirm_batch"] = nb

    logs = db.query(StudentChangeLog).all()
    nl = 0
    for lg in logs:
        changed = False
        if lg.student_id and lg.student_id in renamed:
            lg.student_id = renamed[lg.student_id]
            changed = True
        for field in ("before_summary", "after_summary", "detail"):
            old = getattr(lg, field)
            new = _remap_json(old, renamed)
            if new != old:
                setattr(lg, field, new)
                changed = True
        if changed:
            nl += 1
    if nl:
        counts["student_change_log"] = nl

    if commit:
        db.commit()

    return {
        "renamed": renamed,
        "counts": counts,
        "ambiguous_refs": [
            {"student_id": sid, "tables": sorted(tabs)}
            for sid, tabs in sorted(ambiguous.items())
        ],
    }


def ensure_sid_space(db, incoming, grade: int, *, commit: bool = False,
                     auto_backup: bool = False) -> dict:
    """跨届写入守门：incoming（本届要写入的学号集合）与「其他年级的裸学号
    空间」撞车时，把撞车各届整体前缀化，返回迁移报告；无撞车返回空报告
    （clash_grades=[]），不动库。

    incoming 中的学号先经 strip_ns 归一（已带前缀的 G1::x 视为其裸号参与
    检测，但写入方仍应使用原值——本函数不改写 incoming）。
    auto_backup=True 且实际发生迁移时，迁移前先调用备份模块对当前库做
    一次自动备份（与删除/合并的既有安全口径一致）。
    """
    grade = int(grade)
    incoming_bare = {
        strip_ns(sid)[0] for sid in (incoming or set()) if sid is not None
    }
    if not incoming_bare:
        return {"clash_grades": [], "renamed": {}, "counts": {},
                "ambiguous_refs": []}

    spaces = bare_sid_spaces(db)
    clash = sorted(
        {
            g for g, sids in spaces.items()
            if g != grade and incoming_bare & sids
        }
    )
    if not clash:
        return {"clash_grades": [], "renamed": {}, "counts": {},
                "ambiguous_refs": []}

    if auto_backup:
        from app.backup.router import create_backup
        create_backup()

    renamed: dict = {}
    counts: dict = {}
    ambiguous: list = []
    for g in clash:
        report = namespace_grade(db, g, commit=False)
        renamed.update(report["renamed"])
        for label, n in report["counts"].items():
            counts[label] = counts.get(label, 0) + n
        ambiguous.extend(report["ambiguous_refs"])

    if commit:
        db.commit()
    return {
        "clash_grades": clash,
        "renamed": renamed,
        "counts": counts,
        "ambiguous_refs": ambiguous,
    }
