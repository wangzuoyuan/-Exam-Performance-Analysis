"""升级换届服务：四态分类 + 名册结转 + 高一成绩导入。

换届把班主任从某学年带到下一学年：根据跨学年身份（StudentAlias）与上一
年级成绩同名记录，把新班级里每个学生判为 inherited（已链身份）/ ambiguous
（同名需消歧）/ new（新人）/ unmatched（仅花名册无成绩），并报告 left_class
（上学年本班未在新班出现的学生）。同时支持按成绩或手填名单结转作业花名册
（ClassRoster，grade=target_grade），以及把班主任手头的历史分数隔离地写
入 ImportedHistory（不参与任何聚合）。

身份层完全复用 app.analysis.identity，绝不在本模块按姓名自动合并。
"""

from typing import Optional


class RosterScopeError(ValueError):
    """目标年级/班级与教师绑定不一致（HTTP 409，区别于行级校验错误）。"""


# 仅姓名导入的临时学号前缀：可识别、稳定、按目标班隔离，绝不与真实学号同形。
TEMP_SID_PREFIX = "TMP-"


def temp_sid(grade, class_num, name) -> str:
    """为「只有姓名、还没有学号」的学生生成临时学号。

    形如 TMP-2-6-张三：同一目标班内同名重复导入得到同一学号（幂等），
    不同班/年级的同名学生各自独立，不会跨班冲突；拿到正式学号后可整体替换。
    """
    return f"{TEMP_SID_PREFIX}{grade}-{class_num}-{name}"


def _teacher_target_class(db, grade) -> Optional[int]:
    """读 Teacher.target_class_high{grade}（grade 1/2/3）。未绑定返回 None。"""
    from app.db.models import Teacher

    t = db.query(Teacher).first()
    if t is None:
        return None
    attr = f"target_class_high{grade}"
    return getattr(t, attr, None)


def _class_students(db, grade, class_num) -> list:
    """某年级某班全体 distinct student_id（按 SubjectScore 派生）。"""
    from app.db.models import SubjectScore, Exam

    rows = (
        db.query(SubjectScore.student_id)
        .join(Exam, Exam.id == SubjectScore.exam_id)
        .filter(Exam.grade == grade, SubjectScore.class_num == class_num)
        .distinct()
        .all()
    )
    return [r[0] for r in rows]


def _student_name_in_grade(db, student_id, grade) -> Optional[str]:
    """该学号在该 grade 的 SubjectScore.name 首个非空。"""
    from app.db.models import SubjectScore, Exam

    row = (
        db.query(SubjectScore.name)
        .join(Exam, Exam.id == SubjectScore.exam_id)
        .filter(
            Exam.grade == grade,
            SubjectScore.student_id == student_id,
            SubjectScore.name.isnot(None),
        )
        .first()
    )
    return row[0] if row else None


def _class_num_in_grade(db, student_id, grade) -> Optional[int]:
    """该学号在该 grade 的 SubjectScore.class_num 首个非空。"""
    from app.db.models import SubjectScore, Exam

    row = (
        db.query(SubjectScore.class_num)
        .join(Exam, Exam.id == SubjectScore.exam_id)
        .filter(
            Exam.grade == grade,
            SubjectScore.student_id == student_id,
            SubjectScore.class_num.isnot(None),
        )
        .first()
    )
    return row[0] if row else None


def classify(db, target_grade, class_num) -> dict:
    """对 target_grade 目标班 class_num 每个学生判定四态 + left_class。

    学生集合 = distinct SubjectScore.student_id JOIN Exam.grade==target_grade
    AND class_num==class_num，并入 class_roster(grade==target_grade) 的
    student_id。对每个学生：
      - identity_of 非空 -> inherited（附上学年 alias 学号 + 其班级）
      - 否则 name_candidates(name, target_grade-1) 非空 -> ambiguous（附候选）
      - 否则该 sid 在 target_grade 成绩库有数据 -> new
      - 否则（仅 roster 无成绩）-> unmatched

    left_class：上学年（prev=target_grade-1）本班（Teacher.target_class_high{prev}）
    全体学号中，不在本班集合的 -> 离班学生（附 name + g1 class_num）。该年级
    未绑定班则 []。
    """
    from app.db.models import SubjectScore, Exam, ClassRoster
    from app.analysis.identity import (
        identity_of,
        aliases_of,
        name_candidates,
    )

    # 目标班学生集合（成绩库 distinct sid）
    score_sids = (
        db.query(SubjectScore.student_id)
        .join(Exam, Exam.id == SubjectScore.exam_id)
        .filter(Exam.grade == target_grade, SubjectScore.class_num == class_num)
        .distinct()
        .all()
    )
    sid_set = {r[0] for r in score_sids}

    # 并入 roster（grade==target_grade）的 student_id
    roster_sids = (
        db.query(ClassRoster.student_id)
        .filter(
            ClassRoster.grade == target_grade,
            ClassRoster.class_num == class_num,
        )
        .all()
    )
    sid_set |= {r[0] for r in roster_sids}

    has_score_set = {r[0] for r in score_sids}  # 仅用于 new/unmatched 区分

    prev_grade = target_grade - 1

    inherited, ambiguous, new, unmatched = [], [], [], []
    for sid in sorted(sid_set):
        # 姓名：优先 target_grade 成绩库，回退 roster.name
        name = _student_name_in_grade(db, sid, target_grade)
        if name is None:
            r = (
                db.query(ClassRoster.name)
                .filter(
                    ClassRoster.student_id == sid,
                    ClassRoster.grade == target_grade,
                    ClassRoster.class_num == class_num,
                )
                .first()
            )
            name = r[0] if r else None

        iid = identity_of(db, sid)
        if iid is not None:
            # 附 g1（grade<target_grade）alias 学号 + 其 class_num
            prev_aliases = []
            for al in aliases_of(db, iid):
                if al.grade is not None and al.grade < target_grade:
                    prev_aliases.append(
                        {
                            "student_id": al.student_id,
                            "grade": al.grade,
                            "class_num": _class_num_in_grade(db, al.student_id, al.grade),
                        }
                    )
            inherited.append(
                {
                    "student_id": sid,
                    "name": name,
                    "identity_id": iid,
                    "prev_aliases": prev_aliases,
                }
            )
        elif name is not None and prev_grade >= 1:
            cands = name_candidates(db, name, prev_grade)
            if cands:
                ambiguous.append(
                    {
                        "student_id": sid,
                        "name": name,
                        "candidates": cands,
                    }
                )
            elif sid in has_score_set:
                new.append({"student_id": sid, "name": name})
            else:
                unmatched.append({"student_id": sid, "name": name})
        else:
            if sid in has_score_set:
                new.append({"student_id": sid, "name": name})
            else:
                unmatched.append({"student_id": sid, "name": name})

    # left_class：上学年本班「真正离开」的学生。
    # 学号跨学年会变，不能用 `高一学号 in 高二学号集合` 判断（两套学号空间永不相等，
    # 否则全体高一都会被误报为离班）。判定「仍在本班」的两条信号：
    #   1) 身份已链接：该生所属 identity 拥有的任一学号出现在新班集合中 -> 已继承，不算离班；
    #   2) 同名待确认：该生姓名出现在新班学生姓名中 -> 换届向导里还在 ambiguous，不算离班。
    # 两者都不满足才算真正离班。
    left_class = []
    if prev_grade >= 1:
        prev_class = _teacher_target_class(db, prev_grade)
        if prev_class is not None:
            # 新班学生姓名集合（成绩库优先，回退 roster）
            target_names = set()
            for tsid in sid_set:
                tname = _student_name_in_grade(db, tsid, target_grade)
                if tname is None:
                    r = (
                        db.query(ClassRoster.name)
                        .filter(
                            ClassRoster.student_id == tsid,
                            ClassRoster.grade == target_grade,
                            ClassRoster.class_num == class_num,
                        )
                        .first()
                    )
                    tname = r[0] if r else None
                if tname:
                    target_names.add(tname)

            prev_sids = _class_students(db, prev_grade, prev_class)
            for sid in prev_sids:
                iid = identity_of(db, sid)
                if iid is not None:
                    person_sids = {al.student_id for al in aliases_of(db, iid)}
                    if person_sids & sid_set:
                        continue  # 同一人已在新班（已继承）
                pname = _student_name_in_grade(db, sid, prev_grade)
                if pname and pname in target_names:
                    continue  # 新班有同名学生，尚在待确认，不算离班
                left_class.append(
                    {
                        "student_id": sid,
                        "name": pname,
                        "class_num": prev_class,
                    }
                )

    return {
        "inherited": inherited,
        "ambiguous": ambiguous,
        "new": new,
        "unmatched": unmatched,
        "left_class": left_class,
        "summary": {
            "inherited": len(inherited),
            "ambiguous": len(ambiguous),
            "new": len(new),
            "unmatched": len(unmatched),
            "left_class": len(left_class),
            "total": len(sid_set),
        },
    }


def _validated_target_class(db, target_grade, class_num) -> int:
    """粘贴名册的目标年级+班必须与教师绑定一致；禁止裸 class_num / 越权写入。"""
    if target_grade not in (1, 2, 3):
        raise RosterScopeError("目标年级必须是高一/高二/高三")
    bound = _teacher_target_class(db, target_grade)
    if bound is None:
        raise RosterScopeError(f"高{target_grade}尚未绑定行政班，请先在向导第 1 步确认绑定")
    if class_num is None or int(class_num) != int(bound):
        shown = class_num if class_num is not None else "未填"
        raise RosterScopeError(
            f"目标班级（{shown}）与教师绑定的高{target_grade}班级（{bound}）不一致"
        )
    return int(bound)


def _fill_roster_info(row, plan) -> None:
    """幂等更新：只补 seat_no/gender，不碰 excluded 与学号。"""
    if plan["seat_no"] is not None:
        row.seat_no = plan["seat_no"]
    if plan["gender"] is not None:
        row.gender = plan["gender"]


def _legacy_broken_rows(db, name, target_grade) -> list:
    """旧版缺陷形态：student_id=粘贴的姓名、grade=目标年级、class_num 为 NULL、
    name 为 NULL 或空串（不同代 schema 的 NOT NULL 约束差异，两种都算缺陷行）。

    只有四个条件全部严格命中才视为可收编的缺陷行，绝不触碰高一正常数据。
    """
    from app.db.models import ClassRoster
    from sqlalchemy import or_

    return (
        db.query(ClassRoster)
        .filter(
            ClassRoster.student_id == name,
            ClassRoster.grade == target_grade,
            ClassRoster.class_num.is_(None),
            or_(ClassRoster.name.is_(None), ClassRoster.name == ""),
        )
        .all()
    )


def _migrate_student_refs(db, old_sid, new_sid) -> None:
    """把依赖学号的业务数据从 old_sid 迁到 new_sid（homework/special/note）。"""
    from app.db.models import HomeworkRecord, SpecialRecord, StudentNote

    for model in (HomeworkRecord, SpecialRecord, StudentNote):
        db.query(model).filter(model.student_id == old_sid).update(
            {model.student_id: new_sid}, synchronize_session=False
        )


def _absorb_legacy_row(db, legacy, target_sid) -> None:
    """收编旧缺陷行：其依赖数据迁到 target_sid 后删除该行。

    调用方已保证：legacy 形态严格匹配、姓名与本批明确对应、target_sid 是
    本批写入的正常行。迁移任何记录前先比对两侧 StudentAlias：
      - 两边 alias 指向不同 identity -> 整批拒绝（不迁记录、不删旧行）；
      - 同一 identity -> 业务记录随迁，删除缺陷学号的 alias（目标侧已有，不留孤儿）；
      - 仅旧侧有 alias -> 随学号迁到 target_sid；
      - 仅目标侧有 alias -> 只迁业务记录。
    """
    from app.db.models import StudentAlias

    old_alias = (
        db.query(StudentAlias).filter(StudentAlias.student_id == legacy.student_id).first()
    )
    new_alias = (
        db.query(StudentAlias).filter(StudentAlias.student_id == target_sid).first()
    )
    if (
        old_alias is not None
        and new_alias is not None
        and old_alias.identity_id != new_alias.identity_id
    ):
        raise ValueError(
            f"历史异常行「{legacy.student_id}」与目标学号 {target_sid} 已关联不同的"
            "跨学年身份，无法自动收编，请先在逐人判定中处理"
        )

    _migrate_student_refs(db, legacy.student_id, target_sid)
    if old_alias is not None and new_alias is None:
        db.query(StudentAlias).filter(
            StudentAlias.student_id == legacy.student_id
        ).update({"student_id": target_sid}, synchronize_session=False)
    elif old_alias is not None:
        db.query(StudentAlias).filter(
            StudentAlias.student_id == legacy.student_id
        ).delete(synchronize_session=False)
    db.delete(legacy)


def _validate_official_sid(db, sid, name, target_grade, class_num, expect_iid=None) -> None:
    """所有带学号的导入行统一过闸（无论是否命中占位行）：

    1. 成绩库姓名：该学号在任一年级的成绩姓名与导入姓名不符 → 拒绝；
    2. 目标年级班级：该学号在目标年级的成绩属于他班 → 拒绝；
    3. 身份别名：学号已挂 StudentAlias 时必须仍属于「本行学生」——
       expect_iid（占位行的 identity）给定且不一致 → 直接拒绝；
       否则用身份证据核对（display_name / 其它别名的成绩姓名，任一非空
       且与导入姓名不符 → 拒绝；全部相符才允许安全接续）。
    """
    from app.db.models import SubjectScore, Exam, StudentAlias, StudentIdentity
    from app.analysis.identity import aliases_of

    score_name = (
        db.query(SubjectScore.name)
        .filter(SubjectScore.student_id == sid, SubjectScore.name.isnot(None))
        .first()
    )
    if score_name is not None and score_name[0] != name:
        raise ValueError(
            f"学号 {sid} 在成绩库属于「{score_name[0]}」，与导入姓名「{name}」不一致，已拒绝"
        )

    other_class = (
        db.query(SubjectScore.class_num)
        .join(Exam, Exam.id == SubjectScore.exam_id)
        .filter(
            Exam.grade == target_grade,
            SubjectScore.student_id == sid,
            SubjectScore.class_num.isnot(None),
            SubjectScore.class_num != class_num,
        )
        .first()
    )
    if other_class is not None:
        raise ValueError(
            f"学号 {sid} 的高{target_grade}成绩在 {other_class[0]} 班，"
            f"与目标班级（{class_num}）不一致，已拒绝"
        )

    alias = db.query(StudentAlias).filter(StudentAlias.student_id == sid).first()
    if alias is None:
        return
    if expect_iid is not None:
        if alias.identity_id != expect_iid:
            raise ValueError(
                f"学号 {sid} 已关联其他跨学年身份，与本行学生不一致，已拒绝；请先在逐人判定中处理"
            )
        return
    ident = (
        db.query(StudentIdentity)
        .filter(StudentIdentity.id == alias.identity_id)
        .first()
    )
    if ident is not None and ident.display_name and ident.display_name != name:
        raise ValueError(
            f"学号 {sid} 已关联跨学年身份「{ident.display_name}」，"
            f"与导入姓名「{name}」不一致，已拒绝"
        )
    for al in aliases_of(db, alias.identity_id):
        if al.student_id == sid:
            continue
        other_name = (
            db.query(SubjectScore.name)
            .filter(
                SubjectScore.student_id == al.student_id,
                SubjectScore.name.isnot(None),
            )
            .first()
        )
        if other_name is not None and other_name[0] != name:
            raise ValueError(
                f"学号 {sid} 关联的身份含学号 {al.student_id}"
                f"（成绩库姓名「{other_name[0]}」），与导入姓名「{name}」不一致，已拒绝"
            )


def _replace_placeholder_sid(db, row, sid, name, target_grade, class_num, seat_no=None, gender=None) -> None:
    """把临时学号占位行替换为正式学号：插新行 → 迁移依赖 → 删旧行。

    全程在调用方的同一事务里（统一 commit，出错整体回滚）；保留
    excluded/seat_no/gender 与年级班级归属，StudentAlias 随学号迁移。
    统一走 _validate_official_sid（成绩库姓名 / 目标年级班级 / 别名冲突，
    expect_iid=占位行 identity：别名指向他人时整批拒绝）。
    """
    from app.db.models import ClassRoster, StudentAlias
    from app.analysis.identity import identity_of

    old_sid = row.student_id
    old_iid = identity_of(db, old_sid)

    _validate_official_sid(
        db, sid, name, target_grade, class_num, expect_iid=old_iid
    )

    db.add(
        ClassRoster(
            student_id=sid,
            name=name,
            class_num=row.class_num,
            grade=row.grade,
            seat_no=seat_no if seat_no is not None else row.seat_no,
            gender=gender if gender is not None else row.gender,
            excluded=row.excluded,
        )
    )
    db.flush()

    _migrate_student_refs(db, old_sid, sid)
    new_alias = db.query(StudentAlias).filter(StudentAlias.student_id == sid).first()
    if new_alias is not None:
        # 学号的 alias 属于本人（校验已过）：保留，临时学号旧 alias 删除
        db.query(StudentAlias).filter(StudentAlias.student_id == old_sid).delete()
    elif old_iid is not None:
        db.query(StudentAlias).filter(StudentAlias.student_id == old_sid).update(
            {"student_id": sid}, synchronize_session=False
        )
    db.delete(row)


def _import_rows(db, target_grade, class_num, rows, *, allow_dup_names=False) -> dict:
    """名单导入（两种行：仅姓名 / 学号+姓名）。

    预检所有行（空姓名、格式、同批重复、冲突）后才落库，任何一行不通过
    整批拒绝并回滚，绝不静默写坏数据。旧缺陷行在姓名明确对应、形态严格
    匹配且无冲突时收编到目标作用域。allow_dup_names=True 供「从成绩派生」
    使用：同班同名多学号各自建行（成绩库本来就以学号区分），不走粘贴的
    同名互斥校验。
    """
    from app.db.models import ClassRoster

    plans, errors = [], []
    seen_sid: dict[str, int] = {}
    seen_name: dict[str, int] = {}
    for idx, r in enumerate(rows, start=1):
        raw_sid = r.get("student_id")
        sid = str(raw_sid).strip() if raw_sid is not None else ""
        name = str(r.get("name") or "").strip()
        if not name:
            errors.append(f"第 {idx} 行：姓名为空，无法导入")
            continue
        if sid:
            if sid in seen_sid:
                errors.append(f"第 {idx} 行：学号 {sid} 与第 {seen_sid[sid]} 行重复")
            else:
                seen_sid[sid] = idx
        if name in seen_name and not allow_dup_names:
            errors.append(
                f"第 {idx} 行：姓名「{name}」与第 {seen_name[name]} 行重复，同批不能出现两个同名"
            )
            continue
        seen_name[name] = idx
        plans.append(
            {
                "sid": sid or None,
                "name": name,
                "seat_no": r.get("seat_no"),
                "gender": r.get("gender"),
            }
        )
    if errors:
        raise ValueError("；".join(errors))

    created = updated = replaced = repaired = 0
    batch_created: set[str] = set()  # 本批新建的学号（供派生时同名多号互不拦）
    try:
        for p in plans:
            sid, name = p["sid"], p["name"]

            legacy = _legacy_broken_rows(db, name, target_grade)
            if len(legacy) > 1:
                raise ValueError(
                    f"姓名「{name}」对应 {len(legacy)} 条历史异常数据行，无法自动收编，请先恢复备份核对"
                )

            # 本班本年级既有同名行（跨班同名不在其列，绝不跨作用域合并）
            same_name_rows = (
                db.query(ClassRoster)
                .filter(
                    ClassRoster.grade == target_grade,
                    ClassRoster.class_num == class_num,
                    ClassRoster.name == name,
                )
                .all()
            )

            if sid is None:
                # ── 仅姓名：生成/复用临时学号，幂等 ──
                target_sid = temp_sid(target_grade, class_num, name)
                existing = next(
                    (r for r in same_name_rows if r.student_id == target_sid), None
                )
                if existing is not None:
                    _fill_roster_info(existing, p)
                    updated += 1
                elif same_name_rows:
                    if len(same_name_rows) > 1:
                        raise ValueError(
                            f"「{name}」在本班名册已有 {len(same_name_rows)} 条同名行，"
                            "请先在作业花名册中核对"
                        )
                    _fill_roster_info(same_name_rows[0], p)
                    target_sid = same_name_rows[0].student_id
                    updated += 1
                else:
                    db.add(
                        ClassRoster(
                            student_id=target_sid,
                            name=name,
                            class_num=class_num,
                            grade=target_grade,
                            seat_no=p["seat_no"],
                            gender=p["gender"],
                            excluded=0,
                        )
                    )
                    created += 1
            else:
                # ── 学号+姓名：统一冲突校验（成绩库姓名 / 目标年级班级 / 别名）──
                _validate_official_sid(db, sid, name, target_grade, class_num)
                official = (
                    db.query(ClassRoster).filter(ClassRoster.student_id == sid).first()
                )
                # 占位判定必须精确等于系统为该姓名/作用域生成的临时学号；
                # 任何 TMP- 前缀的真实学号都不是占位行，绝不被替换/删除。
                placeholder = next(
                    (
                        r
                        for r in same_name_rows
                        if r.student_id == temp_sid(target_grade, class_num, name)
                    ),
                    None,
                )
                if official is not None:
                    if official.name and official.name != name:
                        raise ValueError(
                            f"学号 {sid} 已属于「{official.name}」，与导入姓名「{name}」不一致，已拒绝"
                        )
                    if official.grade != target_grade or official.class_num != class_num:
                        raise ValueError(
                            f"学号 {sid} 已存在于高{official.grade}（{official.class_num}班），"
                            "与目标班级不一致，已拒绝"
                        )
                    if not official.name:
                        official.name = name
                    _fill_roster_info(official, p)
                    target_sid = sid
                    updated += 1
                elif placeholder is not None:
                    _replace_placeholder_sid(
                        db,
                        placeholder,
                        sid,
                        name,
                        target_grade,
                        class_num,
                        p["seat_no"],
                        p["gender"],
                    )
                    target_sid = sid
                    replaced += 1
                elif any(r.student_id not in batch_created for r in same_name_rows):
                    raise ValueError(
                        f"「{name}」在本班已用学号 "
                        f"{next(r.student_id for r in same_name_rows if r.student_id not in batch_created)}，"
                        "未找到待补学号占位行，已拒绝重复建册"
                    )
                else:
                    db.add(
                        ClassRoster(
                            student_id=sid,
                            name=name,
                            class_num=class_num,
                            grade=target_grade,
                            seat_no=p["seat_no"],
                            gender=p["gender"],
                            excluded=0,
                        )
                    )
                    target_sid = sid
                    created += 1
                    batch_created.add(sid)

            # 收编旧缺陷行（姓名明确对应 + 形态严格匹配 + 唯一）
            for lg in legacy:
                _absorb_legacy_row(db, lg, target_sid)
                repaired += 1

        db.commit()
    except Exception:
        db.rollback()
        raise

    total = (
        db.query(ClassRoster)
        .filter(
            ClassRoster.grade == target_grade,
            ClassRoster.class_num == class_num,
        )
        .count()
    )
    return {
        "created": created,
        "updated": updated,
        "replaced": replaced,
        "repaired": repaired,
        "total": total,
    }


def build_roster(
    db,
    target_grade,
    *,
    class_num=None,
    from_scores=False,
    rows=None,
) -> dict:
    """建/刷 target_grade 作业花名册（ClassRoster, grade=target_grade）。

    - rows（粘贴名单）两种行：
      {name}：仅姓名。生成临时学号 TMP-{grade}-{class}-{name}，幂等；同时
        收编旧版缺陷行（student_id=姓名、name/class_num 为 NULL）。
      {student_id, name}：正式学号。统一冲突校验（成绩库姓名/目标年级班级/
        已挂身份别名）；命中本班同名待补学号占位行（精确等于 temp_sid）时
        事务性替换，作业/特殊/档案记录与身份别名随学号迁移；学号已被占用、
        跨班同名等冲突整批拒绝。正式学号后续上传成绩可自然接续，跨学年身份
        仍走逐人判定。
    - from_scores=True：从 target_grade 成绩 class_num 派生 {student_id, name}，
      复用同一条导入/占位替换事务逻辑——先姓名建册的学生出分后按正式学号
      替换占位行并迁移全部依赖，绝不再 merge 出第二条重复行。
    目标 grade+class 必须与教师绑定一致，所有行严格写入目标作用域。
    返回 {created, updated, replaced, repaired, total}。
    """
    from app.db.models import ClassRoster, SubjectScore, Exam

    class_num = _validated_target_class(db, target_grade, class_num)

    if rows:
        return _import_rows(db, target_grade, class_num, rows)

    if from_scores:
        sid_name_rows = (
            db.query(SubjectScore.student_id, SubjectScore.name)
            .join(Exam, Exam.id == SubjectScore.exam_id)
            .filter(Exam.grade == target_grade, SubjectScore.class_num == class_num)
            .distinct()
            .all()
        )
        # 同一学号可能带多行姓名（含 NULL），取首个非空；无名的无法入册，跳过
        name_by: dict = {}
        for sid, nm in sid_name_rows:
            if sid is None:
                continue
            if sid not in name_by or (not name_by[sid] and nm):
                name_by[sid] = nm
        derived = [
            {"student_id": sid, "name": nm} for sid, nm in name_by.items() if nm
        ]
        if derived:
            return _import_rows(
                db, target_grade, class_num, derived, allow_dup_names=True
            )

    total = (
        db.query(ClassRoster)
        .filter(
            ClassRoster.grade == target_grade,
            ClassRoster.class_num == class_num,
        )
        .count()
    )
    return {
        "created": 0,
        "updated": 0,
        "replaced": 0,
        "repaired": 0,
        "total": total,
    }


def set_active_grade(db, grade) -> dict:
    """写入 active_grade 配置行。"""
    from app.db.models import HomeworkSetting

    grade = int(grade)
    if grade not in (1, 2, 3):
        raise ValueError("年级必须是 1、2 或 3")
    if _teacher_target_class(db, grade) is None:
        raise ValueError(f"高{grade}尚未绑定行政班")

    db.merge(HomeworkSetting(key="active_grade", value=str(grade)))
    db.commit()
    return {"active_grade": grade}


def import_history(
    db,
    *,
    identity_id=None,
    student_id=None,
    link_g1_student_id=None,
    name=None,
    target_grade=None,
    rows,
) -> dict:
    """写 ImportedHistory（按 identity 挂，与全年级统计隔离）。

    identity 解析（按优先级）：
      1. 直接给 identity_id
      2. student_id 的 identity_of
      3. 都没有但给了 student_id/name -> ensure_identity 新建并 link 该 student_id
    link_g1_student_id 给定 -> link 到同一 identity（source=manual）。

    rows=[{exam_label, exam_seq?, kind(subject/total), subject?, total_type?,
    raw_score?, grade_score?, grade_percentile?, xueji_rank?, grade?}]
    """
    from app.db.models import ImportedHistory
    from app.analysis.identity import identity_of, ensure_identity, link_aliases

    # 1) 解析 identity_id
    if identity_id is None:
        if student_id is not None:
            identity_id = identity_of(db, str(student_id))
        if identity_id is None and (student_id is not None or name is not None):
            identity_id = ensure_identity(db, display_name=name)
            if student_id is not None:
                link_aliases(db, identity_id, [(str(student_id), target_grade)], "manual")

    if identity_id is None:
        return {"identity_id": None, "imported": 0}

    # 2) link_g1_student_id 挂到同一 identity
    if link_g1_student_id is not None:
        previous_grade = target_grade - 1 if target_grade in (2, 3) else None
        link_aliases(db, identity_id, [(str(link_g1_student_id), previous_grade)], "manual")

    # 3) 写历史行
    count = 0
    for r in rows:
        db.add(
            ImportedHistory(
                identity_id=identity_id,
                grade=r.get("grade", 1),
                exam_label=r.get("exam_label"),
                exam_seq=r.get("exam_seq"),
                kind=r.get("kind", "subject"),
                subject=r.get("subject"),
                total_type=r.get("total_type"),
                raw_score=r.get("raw_score"),
                grade_score=r.get("grade_score"),
                grade_percentile=r.get("grade_percentile"),
                xueji_rank=r.get("xueji_rank"),
            )
        )
        count += 1
    db.commit()

    return {"identity_id": identity_id, "imported": count}


def get_active_grade(db) -> int:
    """读 homework_setting active_grade；缺省回落 max(class_roster.grade)
    -> max(Exam.grade) -> 1。"""
    from app.db.models import HomeworkSetting, ClassRoster, Exam
    from sqlalchemy import func

    row = (
        db.query(HomeworkSetting.value)
        .filter(HomeworkSetting.key == "active_grade")
        .first()
    )
    if row and row[0] is not None:
        try:
            return int(row[0])
        except (TypeError, ValueError):
            pass

    mg = db.query(func.max(ClassRoster.grade)).scalar()
    if mg is not None:
        return int(mg)

    me = db.query(func.max(Exam.grade)).scalar()
    if me is not None:
        return int(me)

    return 1
