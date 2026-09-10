"""跨届学号命名空间（sid_space）守门接线测试。

学校每学年重新编学号，高二新学号可能与高一旧学号同号（同号不同人），
ensure_sid_space 在跨届写入前把撞车旧届整体 G{g}:: 前缀化让位。本文件覆盖：
  - 基础迁移：成绩/总分/花名册/别名/作业全部改写，renamed/counts 正确
  - 幂等：第二次调用零动作
  - 同号新人不继承 / 老学生继承后按 person_ids 合并两届成绩
  - 无撞车零动作、不触发自动备份
  - RolloverConfirmBatch / StudentChangeLog 的 JSON 快照整值替换（7250601
    绝不波及 72506011），迁移后 undo 仍可用
  - _validate_official_sid 分年级：跨届同号合法、目标年级他名仍拒绝
  - build_roster + confirm_batch 端到端：落库 alias 的 g1 是迁移后的 G1:: 值
  - preview（classify）的 sid_clash 撞车预告只统计、不迁移
镜像 test_roster_import.py 的隔离方式（模块级 EXAM_TRACKER_DIR + 自建 seed，
教师绑定高1=6班 + 高2=6班）；monkeypatch 掉 create_backup，绝不写真实备份目录。
"""

import os
import tempfile

# 必须在 import app 之前把 EXAM_TRACKER_DIR 钉到临时目录，使
# app.paths / app.db.models 的 engine 绑定隔离库。
_TMP = tempfile.mkdtemp(prefix="sid_space_test_")
os.environ["EXAM_TRACKER_DIR"] = os.path.join(_TMP, "examdata")
os.makedirs(os.environ["EXAM_TRACKER_DIR"], exist_ok=True)

import pytest

from app.analysis.identity import (
    aliases_of,
    ensure_identity,
    identity_of,
    link_aliases,
    person_ids,
)
from app.db.models import (
    ClassRoster,
    Exam,
    HomeworkRecord,
    ImportedHistory,
    RolloverConfirmBatch,
    SessionLocal,
    StudentAlias,
    StudentChangeLog,
    StudentIdentity,
    SubjectScore,
    Teacher,
    TotalScore,
)
from app.db.sid_space import ensure_sid_space
from app.rollover import service as rollover_service


@pytest.fixture(autouse=True)
def fake_backup(monkeypatch):
    """拦截 ensure_sid_space 的 auto_backup：迁移测试绝不写真实备份目录。"""
    from app.backup import router as backup_router

    calls: list[str] = []

    def _fake_create_backup(prefix: str = "backup") -> str:
        calls.append(prefix)
        return "fake-backup.zip"

    monkeypatch.setattr(backup_router, "create_backup", _fake_create_backup)
    return calls


@pytest.fixture
def fresh():
    """每个用例从空库 + 教师绑定（高1=6班、高2=6班）开始，互不依赖顺序。"""
    s = SessionLocal()
    for m in (StudentChangeLog, RolloverConfirmBatch, ImportedHistory,
              HomeworkRecord, StudentAlias, StudentIdentity, ClassRoster,
              SubjectScore, TotalScore, Exam, Teacher):
        s.query(m).delete()
    s.commit()
    s.merge(Teacher(id=1, target_class_high1=6, target_class_high2=6))
    s.commit()
    try:
        yield s
    finally:
        s.close()


def _seed_g1_class(s):
    """高一 6 班三个学号：成绩 + 总分 + 花名册（裸号，等待被前缀化）。"""
    s.add(Exam(id=101, name="高一期末", grade=1, semester="下",
               exam_date="2025-06", exam_type="期末"))
    for sid, name in (("7250601", "张三"), ("7250602", "李四"), ("7250603", "王五")):
        s.add(SubjectScore(exam_id=101, student_id=sid, name=name,
                           class_num=6, subject="语文", raw_score=90.0))
        s.add(TotalScore(exam_id=101, student_id=sid,
                         total_type="主三门", total_score=270.0))
        s.add(ClassRoster(student_id=sid, name=name, grade=1, class_num=6))


# ─────────────────────────── 1. 基础迁移 ───────────────────────────


def test_basic_migration_prefixes_whole_old_cohort(fresh):
    s = fresh
    _seed_g1_class(s)
    # 7250602 纯属于高一届 → 无年级列的作业记录随迁
    s.add(HomeworkRecord(student_id="7250602", date="2025-05-30",
                         subject="数学", content="练习册"))
    iid = ensure_identity(s, display_name="张三")
    link_aliases(s, iid, [("7250601", 1)], "manual")
    s.commit()

    report = ensure_sid_space(s, {"7250601"}, 2)

    assert report["clash_grades"] == [1]
    assert report["renamed"] == {
        "7250601": "G1::7250601",
        "7250602": "G1::7250602",
        "7250603": "G1::7250603",
    }
    assert report["ambiguous_refs"] == []
    assert report["counts"] == {
        "subject_score": 3,
        "total_score": 3,
        "class_roster": 3,
        "student_alias": 1,
        "homework_record": 1,
    }

    # 成绩/总分/花名册/别名/作业全部改写，裸号零残留
    assert s.query(SubjectScore).filter(SubjectScore.student_id == "7250601").count() == 0
    assert {r.student_id for r in s.query(SubjectScore).all()} == {
        "G1::7250601", "G1::7250602", "G1::7250603"}
    assert s.query(TotalScore).filter(TotalScore.student_id == "G1::7250602").count() == 1
    roster = s.query(ClassRoster).filter(ClassRoster.student_id == "G1::7250603").one()
    assert (roster.name, roster.grade, roster.class_num) == ("王五", 1, 6)
    alias = s.query(StudentAlias).filter(StudentAlias.identity_id == iid).one()
    assert alias.student_id == "G1::7250601" and alias.grade == 1
    assert s.query(HomeworkRecord).filter(
        HomeworkRecord.student_id == "G1::7250602").count() == 1


# ─────────────────────────── 2. 幂等 ───────────────────────────


def test_second_ensure_is_noop(fresh):
    s = fresh
    _seed_g1_class(s)

    first = ensure_sid_space(s, {"7250601"}, 2, commit=True)
    assert first["clash_grades"] == [1]

    second = ensure_sid_space(s, {"7250601"}, 2, commit=True)
    assert second == {"clash_grades": [], "renamed": {}, "counts": {},
                      "ambiguous_refs": []}

    # 数据不再变化：前缀化一次后保持稳定
    assert {r.student_id for r in s.query(SubjectScore).all()} == {
        "G1::7250601", "G1::7250602", "G1::7250603"}
    assert s.query(ClassRoster).filter(ClassRoster.student_id.like("G1::%")).count() == 3
    assert s.query(ClassRoster).filter(ClassRoster.student_id.notlike("G1::%")).count() == 0


# ─────────────────────────── 3. 同号新人不继承 ───────────────────────────


def test_same_sid_new_person_does_not_inherit(fresh):
    s = fresh
    _seed_g1_class(s)  # 高一 7250601=张三（成绩+roster）

    res = rollover_service.build_roster(
        s, 2, class_num=6, rows=[{"student_id": "7250601", "name": "李四"}]
    )
    assert res["created"] == 1

    # 两行并存：离场高一届前缀化、本届（高二）保持裸号
    g1 = s.query(ClassRoster).filter(ClassRoster.student_id == "G1::7250601").one()
    assert (g1.name, g1.grade, g1.class_num) == ("张三", 1, 6)
    g2 = s.query(ClassRoster).filter(ClassRoster.student_id == "7250601").one()
    assert (g2.name, g2.grade, g2.class_num) == ("李四", 2, 6)
    # 高一成绩随整体迁移
    assert s.query(SubjectScore).filter(
        SubjectScore.student_id == "G1::7250601").count() == 1
    # 同号新人：无任何身份关联，person_ids 不含旧届学号
    assert person_ids(s, "7250601") == {"7250601"}


# ─────────────────────────── 4. 老学生继承 ───────────────────────────


def test_old_student_inherits_after_namespacing(fresh):
    s = fresh
    s.add(Exam(id=101, name="高一期末", grade=1, semester="下",
               exam_date="2025-06", exam_type="期末"))
    s.add(Exam(id=201, name="高二开学测", grade=2, semester="上",
               exam_date="2025-09", exam_type="月考"))
    # 王五高一是 7250602，高二重新编号后仍是 7250602（学号不变场景）
    s.add(SubjectScore(exam_id=101, student_id="7250602", name="王五",
                       class_num=6, subject="语文", raw_score=88.0))
    s.add(SubjectScore(exam_id=201, student_id="7250602", name="王五",
                       class_num=6, subject="语文", raw_score=105.0))
    s.commit()

    res = rollover_service.build_roster(
        s, 2, class_num=6, rows=[{"student_id": "7250602", "name": "王五"}]
    )
    assert res["created"] == 1
    # 高一成绩行随整体迁移；高二成绩行按 exam.grade 行级区分、保持裸号
    assert s.query(SubjectScore).filter(
        SubjectScore.student_id == "G1::7250602",
        SubjectScore.exam_id == 101).count() == 1
    assert s.query(SubjectScore).filter(
        SubjectScore.student_id == "7250602",
        SubjectScore.exam_id == 201).count() == 1

    # 教师逐人确认：把 G1::7250602(grade=1) 与 7250602(grade=2) 挂同一 identity
    iid = ensure_identity(s, display_name="王五", commit=False)
    link_aliases(s, iid, [("G1::7250602", 1), ("7250602", 2)],
                 "name_confirmed", commit=False)
    s.commit()

    assert person_ids(s, "7250602") == {"7250602", "G1::7250602"}
    # 按 person_ids 合并查询：两届成绩都能取到
    rows = s.query(SubjectScore).filter(
        SubjectScore.student_id.in_(person_ids(s, "7250602"))).all()
    assert {(r.student_id, r.exam_id) for r in rows} == {
        ("G1::7250602", 101), ("7250602", 201)}


# ─────────────────────────── 5. 无撞车零动作 ───────────────────────────


def test_no_clash_is_noop(fresh, fake_backup):
    s = fresh
    s.add(Exam(id=101, name="高一期末", grade=1, semester="下",
               exam_date="2025-06", exam_type="期末"))
    s.add(Exam(id=201, name="高二开学测", grade=2, semester="上",
               exam_date="2025-09", exam_type="月考"))
    s.add(SubjectScore(exam_id=101, student_id="7250601", name="张三",
                       class_num=6, subject="语文", raw_score=90.0))
    s.add(ClassRoster(student_id="7250601", name="张三", grade=1, class_num=6))
    s.add(SubjectScore(exam_id=201, student_id="20260601", name="李四",
                       class_num=6, subject="语文", raw_score=95.0))
    s.commit()

    report = ensure_sid_space(s, {"20260601"}, 2)
    assert report == {"clash_grades": [], "renamed": {}, "counts": {},
                      "ambiguous_refs": []}

    # 库无改动：高一数据保持裸号
    assert s.query(SubjectScore).filter(SubjectScore.student_id == "7250601").count() == 1
    assert s.query(ClassRoster).filter(ClassRoster.student_id == "7250601").count() == 1
    assert s.query(SubjectScore).filter(SubjectScore.student_id.like("G1::%")).count() == 0
    # 无迁移就不该触发自动备份
    assert fake_backup == []


# ─────────────────────────── 6. JSON 快照迁移 + undo ───────────────────────────


def test_json_snapshots_remap_and_undo_still_works(fresh):
    s = fresh
    s.add(Exam(id=101, name="高一期末", grade=1, semester="下",
               exam_date="2025-06", exam_type="期末"))
    s.add(SubjectScore(exam_id=101, student_id="7250601", name="张三",
                       class_num=6, subject="语文", raw_score=92.0))
    s.commit()

    iid = ensure_identity(s, display_name="张三")
    link_aliases(s, iid, [("7250601", 1), ("20260601", 2)], "name_confirmed")
    s.add(RolloverConfirmBatch(
        id="batch-json-1", grade=2, class_num=6,
        payload=[
            {"g2_student_id": "20260601", "name": "张三", "decision": "link",
             "g1_student_id": "7250601"},
            {"g2_student_id": "20260609", "name": "李四", "decision": "new",
             "g1_student_id": None},
        ],
        created_aliases=[
            {"student_id": "7250601", "identity_id": iid},
            {"student_id": "20260601", "identity_id": iid},
        ],
        created_identities=[iid],
    ))
    s.add(StudentChangeLog(
        op_type="update", student_id="7250601",
        before_summary={"student_id": "72506011", "name": "张三"},
        after_summary={"student_id": "7250601"},
        detail={"sid": "7250601"},
    ))
    s.commit()

    report = ensure_sid_space(s, {"7250601"}, 2)
    assert report["clash_grades"] == [1]

    # JSON 整值替换：7250601 → G1::7250601；None 原样；72506011 不被波及
    batch = s.query(RolloverConfirmBatch).filter_by(id="batch-json-1").one()
    assert batch.payload[0]["g1_student_id"] == "G1::7250601"
    assert batch.payload[1]["g1_student_id"] is None
    assert {a["student_id"] for a in batch.created_aliases} == {
        "G1::7250601", "20260601"}
    log = s.query(StudentChangeLog).filter_by(op_type="update").one()
    assert log.student_id == "G1::7250601"
    assert log.before_summary["student_id"] == "72506011"
    assert log.after_summary["student_id"] == "G1::7250601"
    assert log.detail["sid"] == "G1::7250601"
    # 72506011 不在迁移映射里：整值替换后必须原样（子串替换会把它弄成
    # G1::72506011 那样的坏值）

    # 迁移后 undo 仍能按快照里的新值删掉本批 alias
    undo = rollover_service.undo_confirm_batch(s, "batch-json-1")
    assert sorted(undo["removed_aliases"]) == ["20260601", "G1::7250601"]
    s.expire_all()
    assert s.query(StudentAlias).filter(StudentAlias.identity_id == iid).count() == 0


# ─────────────────────────── 7. _validate_official_sid 分年级 ───────────────────────────


def test_validate_official_sid_is_grade_scoped(fresh):
    s = fresh
    s.add(Exam(id=101, name="高一期末", grade=1, semester="下",
               exam_date="2025-06", exam_type="期末"))
    s.add(SubjectScore(exam_id=101, student_id="7250601", name="张三",
                       class_num=6, subject="语文", raw_score=92.0))
    s.commit()

    # 高一同号成绩属于张三：跨届重号是合法重号，不得按「成绩库属于张三」误拒
    rollover_service._validate_official_sid(s, "7250601", "李四", 2, 6)

    # 目标年级（高二）已有同号他名成绩 → 仍然拒绝
    s.add(Exam(id=201, name="高二开学测", grade=2, semester="上",
               exam_date="2025-09", exam_type="月考"))
    s.add(SubjectScore(exam_id=201, student_id="7250601", name="路人",
                       class_num=6, subject="语文", raw_score=88.0))
    s.commit()
    with pytest.raises(ValueError, match="路人"):
        rollover_service._validate_official_sid(s, "7250601", "李四", 2, 6)


# ─────────────────────────── 8. confirm_batch 端到端 ───────────────────────────


def test_confirm_batch_end_to_end_rewrites_bare_g1(fresh, fake_backup):
    s = fresh
    s.add(Exam(id=101, name="高一期末", grade=1, semester="下",
               exam_date="2025-06", exam_type="期末"))
    s.add(Exam(id=201, name="高二开学测", grade=2, semester="上",
               exam_date="2025-09", exam_type="月考"))
    # 高一 6 班：7250601=陈一、7250602=王五
    s.add(SubjectScore(exam_id=101, student_id="7250601", name="陈一",
                       class_num=6, subject="语文", raw_score=95.0))
    s.add(SubjectScore(exam_id=101, student_id="7250602", name="王五",
                       class_num=6, subject="语文", raw_score=90.0))
    # 高二 6 班：陈一的新学号 7250602 恰与高一王五同号（跨届撞车）
    s.add(SubjectScore(exam_id=201, student_id="7250602", name="陈一",
                       class_num=6, subject="语文", raw_score=100.0))
    s.commit()

    # 先建一份不撞高一的花名册（此时不应触发迁移，g1 候选仍是裸号）
    res = rollover_service.build_roster(
        s, 2, class_num=6, rows=[{"student_id": "20260602", "name": "同学甲"}]
    )
    assert res["created"] == 1
    assert s.query(SubjectScore).filter(
        SubjectScore.student_id == "7250601").count() == 1
    assert len(fake_backup) == 0

    # 同名批量确认：陈一 g2=7250602 link 高一同名候选 7250601
    out = rollover_service.confirm_batch(s, 2, 6, [
        {"g2_student_id": "7250602", "decision": "link"},
    ])
    assert out["linked"] == 1

    # 落库 alias 的 g1 是迁移后的 G1:: 值，g2 保持本届裸号
    iid = identity_of(s, "7250602")
    assert iid is not None
    alias_map = {a.student_id: a.grade for a in aliases_of(s, iid)}
    assert alias_map == {"7250602": 2, "G1::7250601": 1}
    assert s.query(SubjectScore).filter(
        SubjectScore.student_id == "G1::7250601").count() == 1
    assert s.query(SubjectScore).filter(
        SubjectScore.student_id == "G1::7250602").count() == 1
    assert s.query(SubjectScore).filter(
        SubjectScore.student_id == "7250602",
        SubjectScore.exam_id == 201).count() == 1
    # 批次快照记录的也是迁移后的学号
    batch = s.query(RolloverConfirmBatch).filter_by(id=out["batch_id"]).one()
    assert batch.payload[0]["g1_student_id"] == "G1::7250601"
    assert len(fake_backup) == 1

    # 迁移后的批次撤销仍可用
    undo = rollover_service.undo_confirm_batch(s, out["batch_id"])
    assert sorted(undo["removed_aliases"]) == ["7250602", "G1::7250601"]
    s.expire_all()
    assert identity_of(s, "7250602") is None
    assert identity_of(s, "G1::7250601") is None


# ─────────────────────────── 9. preview 撞车预告 ───────────────────────────


def test_classify_reports_sid_clash_without_migrating(fresh):
    s = fresh
    _seed_g1_class(s)
    s.add(Exam(id=201, name="高二开学测", grade=2, semester="上",
               exam_date="2025-09", exam_type="月考"))
    # 高二新学号 7250602 与高一李四同号
    s.add(SubjectScore(exam_id=201, student_id="7250602", name="新人",
                       class_num=6, subject="语文", raw_score=100.0))
    s.add(SubjectScore(exam_id=201, student_id="20260609", name="路人",
                       class_num=6, subject="语文", raw_score=99.0))
    s.commit()

    body = rollover_service.classify(s, 2, 6)
    assert body["sid_clash"] == {"would_namespace": [1], "clash_count": 1}

    # 只统计、不迁移：高一数据保持裸号
    assert s.query(SubjectScore).filter(
        SubjectScore.student_id == "7250601").count() == 1
    assert s.query(ClassRoster).filter(
        ClassRoster.student_id == "7250601").count() == 1
