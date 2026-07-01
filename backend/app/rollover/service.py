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
        .filter(ClassRoster.grade == target_grade)
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


def build_roster(
    db,
    target_grade,
    *,
    class_num=None,
    from_scores=False,
    rows=None,
) -> dict:
    """建/刷 target_grade 作业花名册（ClassRoster, grade=target_grade）。

    - from_scores=True：从 target_grade 成绩 class_num 派生
      {student_id, name, class_num}。
    - rows=[{student_id, name, seat_no?, gender?, class_num?}]：手填名单，
      class_num 缺省用参数 class_num。
    Upsert by student_id via db.merge，写 grade=target_grade，commit。
    """
    from app.db.models import ClassRoster, SubjectScore, Exam

    entries = []  # [{student_id, name, seat_no, gender, class_num}]

    if from_scores:
        if class_num is None:
            return {"created": 0, "updated": 0, "total": 0}
        sid_name = (
            db.query(SubjectScore.student_id, SubjectScore.name)
            .join(Exam, Exam.id == SubjectScore.exam_id)
            .filter(Exam.grade == target_grade, SubjectScore.class_num == class_num)
            .distinct()
            .all()
        )
        for sid, nm in sid_name:
            entries.append(
                {
                    "student_id": sid,
                    "name": nm,
                    "seat_no": None,
                    "gender": None,
                    "class_num": class_num,
                }
            )

    if rows:
        for r in rows:
            sid = r.get("student_id")
            if sid is None:
                continue
            entries.append(
                {
                    "student_id": str(sid),
                    "name": r.get("name"),
                    "seat_no": r.get("seat_no"),
                    "gender": r.get("gender"),
                    "class_num": r.get("class_num", class_num),
                }
            )

    created = updated = 0
    for e in entries:
        sid = e["student_id"]
        existing = (
            db.query(ClassRoster).filter(ClassRoster.student_id == sid).first()
        )
        roster = ClassRoster(
            student_id=sid,
            name=e["name"],
            class_num=e["class_num"],
            grade=target_grade,
            seat_no=e["seat_no"],
            gender=e["gender"],
            excluded=(existing.excluded if existing is not None else 0),
        )
        db.merge(roster)
        if existing is None:
            created += 1
        else:
            updated += 1
    db.commit()

    total = (
        db.query(ClassRoster)
        .filter(ClassRoster.grade == target_grade)
        .count()
    )
    return {"created": created, "updated": updated, "total": total}


def set_active_grade(db, grade) -> dict:
    """写入 active_grade 配置行。"""
    from app.db.models import HomeworkSetting

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
                # 新建并 link 该 student_id（grade 行内未指明，留空）
                link_aliases(db, identity_id, [(str(student_id), None)], "manual")

    if identity_id is None:
        return {"identity_id": None, "imported": 0}

    # 2) link_g1_student_id 挂到同一 identity
    if link_g1_student_id is not None:
        link_aliases(db, identity_id, [(str(link_g1_student_id), None)], "manual")

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
