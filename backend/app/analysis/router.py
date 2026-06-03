from collections import Counter
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional

router = APIRouter(tags=["analysis"])


class BandConfigPayload(BaseModel):
    high_score_max: int
    critical_min: int
    critical_max: int
    weak_min: int


@router.get("/rank-metrics")
async def get_rank_metrics(grade: int, mode: str = "frequency"):
    """返回指定年级在排名区间筛选/排名频次统计中可选的指标。"""
    from app.analysis.rank_metrics import rank_metric_options

    if mode not in {"range", "frequency"}:
        raise HTTPException(400, "mode 只能是 range 或 frequency")
    return {"grade": grade, "mode": mode, "metrics": rank_metric_options(grade, mode)}


@router.get("/rank-range")
async def get_rank_range(
    exam_id: int,
    metric: str,
    rank_min: int = 1,
    rank_max: int = 100,
    class_num: Optional[int] = None,
):
    """按单次考试、指标和年级排名区间筛选学生。"""
    from app.analysis.rank_metrics import rank_range_filter

    try:
        return rank_range_filter(
            exam_id=exam_id,
            metric=metric,
            rank_min=rank_min,
            rank_max=rank_max,
            class_num=class_num,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.get("/rank-frequency")
async def get_rank_frequency(
    grade: int,
    metric: str,
    exam_ids: Optional[str] = None,
    class_num: Optional[int] = None,
    recent_count: int = 5,
):
    """按多场考试统计学生落入各排名/百分位/等级分区间的频次。"""
    from app.analysis.rank_metrics import rank_frequency_stats

    try:
        return rank_frequency_stats(
            grade=grade,
            metric=metric,
            exam_ids=exam_ids,
            class_num=class_num,
            recent_count=recent_count,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.get("/analysis-config")
async def get_analysis_config():
    """返回当前重点关注段位阈值（供前端展示/编辑）。"""
    from app.analysis.config import get_band_config
    return get_band_config()


@router.put("/analysis-config")
async def update_analysis_config(payload: BandConfigPayload):
    """保存用户自定义的段位阈值（全局单行）。"""
    from app.db.models import SessionLocal, AnalysisConfig
    from datetime import datetime

    # 基本合法性校验：边界须为正、区间下界不大于上界
    if payload.high_score_max < 1 or payload.critical_min < 1 or payload.weak_min < 1:
        raise HTTPException(400, "排名阈值必须为正整数")
    if payload.critical_min > payload.critical_max:
        raise HTTPException(400, "临界段下界不能大于上界")

    db = SessionLocal()
    try:
        cfg = db.query(AnalysisConfig).filter(AnalysisConfig.id == 1).first()
        if not cfg:
            cfg = AnalysisConfig(id=1)
            db.add(cfg)
        cfg.high_score_max = payload.high_score_max
        cfg.critical_min = payload.critical_min
        cfg.critical_max = payload.critical_max
        cfg.weak_min = payload.weak_min
        cfg.updated_at = datetime.utcnow()
        db.commit()
        return {
            "high_score_max": cfg.high_score_max,
            "critical_min": cfg.critical_min,
            "critical_max": cfg.critical_max,
            "weak_min": cfg.weak_min,
        }
    finally:
        db.close()


@router.get("/band-trend")
async def get_band_trend(grade: int, class_num: Optional[int] = None):
    """某年级历次考试的三段（高分/临界/薄弱）人数趋势。
    class_num 为空时统计全年级；按当前 band_config 分段，改阈值后趋势同步变化。"""
    from app.db.models import SessionLocal, Exam, TotalScore, SubjectScore
    from app.analysis.config import get_band_config

    db = SessionLocal()
    try:
        cfg = get_band_config(db)
        # 按考试时间排序（exam_id 是上传顺序，不能用）
        exams = (
            db.query(Exam)
            .filter(Exam.grade == grade)
            .order_by(Exam.grade, Exam.exam_date, Exam.id)
            .all()
        )

        series = []
        # 该年级历次考试出现过的班号，供前端下拉
        class_set = set()
        for exam in exams:
            # 限定班级时先取本班学生集合
            if class_num is not None:
                sid_rows = (
                    db.query(SubjectScore.student_id)
                    .filter(SubjectScore.exam_id == exam.id, SubjectScore.class_num == class_num)
                    .distinct()
                    .all()
                )
                allowed = {r[0] for r in sid_rows}
            else:
                allowed = None

            cls_rows = (
                db.query(SubjectScore.class_num)
                .filter(SubjectScore.exam_id == exam.id, SubjectScore.class_num.isnot(None))
                .distinct()
                .all()
            )
            class_set.update(r[0] for r in cls_rows)

            totals = (
                db.query(TotalScore)
                .filter(TotalScore.exam_id == exam.id, TotalScore.total_type == "主三门")
                .all()
            )
            high = crit = weak = 0
            for t in totals:
                if allowed is not None and t.student_id not in allowed:
                    continue
                rank = t.xueji_rank or t.grade_rank
                if rank is None:
                    continue
                if 1 <= rank <= cfg["high_score_max"]:
                    high += 1
                if cfg["critical_min"] <= rank <= cfg["critical_max"]:
                    crit += 1
                if rank >= cfg["weak_min"]:
                    weak += 1

            series.append({
                "exam_id": exam.id,
                "exam_name": exam.name,
                "exam_date": exam.exam_date,
                "high_score": high,
                "critical": crit,
                "weak": weak,
            })

        return {
            "series": series,
            "band_config": cfg,
            "grade": grade,
            "class_num": class_num,
            "available_classes": sorted(class_set),
        }
    finally:
        db.close()

@router.get("/exams")
async def list_exams(grade: Optional[int] = None):
    """列出已建档考试 - Step 6"""
    from app.db.models import SessionLocal, Exam
    db = SessionLocal()
    query = db.query(Exam).order_by(Exam.exam_date.desc())
    if grade:
        query = query.filter(Exam.grade == grade)
    exams = query.all()
    db.close()
    return {
        "exams": [{
            "id": e.id,
            "name": e.name,
            "grade": e.grade,
            "semester": e.semester,
            "exam_date": e.exam_date,
            "exam_type": e.exam_type,
        } for e in exams]
    }

@router.delete("/exams/{exam_id}")
async def delete_exam(exam_id: int):
    """删除考试及其全部关联数据（学生分数、总分、班均分、上传记录）"""
    from app.db.models import (
        SessionLocal,
        Exam,
        Upload,
        SubjectScore,
        TotalScore,
        ClassAverage,
    )

    db = SessionLocal()
    try:
        exam = db.query(Exam).filter(Exam.id == exam_id).first()
        if not exam:
            raise HTTPException(404, "考试不存在")

        exam_name = exam.name
        subject_deleted = db.query(SubjectScore).filter(SubjectScore.exam_id == exam_id).delete(synchronize_session=False)
        total_deleted = db.query(TotalScore).filter(TotalScore.exam_id == exam_id).delete(synchronize_session=False)
        class_avg_deleted = db.query(ClassAverage).filter(ClassAverage.exam_id == exam_id).delete(synchronize_session=False)
        upload_deleted = db.query(Upload).filter(Upload.exam_id == exam_id).delete(synchronize_session=False)
        db.delete(exam)
        db.commit()
        return {
            "ok": True,
            "exam_id": exam_id,
            "exam_name": exam_name,
            "deleted": {
                "subject_score": subject_deleted,
                "total_score": total_deleted,
                "class_average": class_avg_deleted,
                "upload": upload_deleted,
            },
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"删除失败: {e}")
    finally:
        db.close()


@router.get("/exams/{exam_id}")
async def get_exam(exam_id: int):
    """获取考试详情 - Step 6"""
    from collections import Counter, defaultdict

    from app.db.models import SessionLocal, Exam, ClassAverage, SubjectScore, Teacher, TotalScore
    db = SessionLocal()
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        db.close()
        raise HTTPException(404, "考试不存在")

    class_avgs = db.query(ClassAverage).filter(ClassAverage.exam_id == exam_id).all()

    # 获取本班学生统计
    main_totals = db.query(TotalScore).filter(
        TotalScore.exam_id == exam_id,
        TotalScore.total_type == "主三门"
    ).all()

    subject_rows = db.query(SubjectScore).filter(SubjectScore.exam_id == exam_id).all()

    students_by_id = {}
    class_counter_by_student = defaultdict(Counter)
    for row in subject_rows:
        student = students_by_id.setdefault(
            row.student_id,
            {
                "student_id": row.student_id,
                "name": row.name or row.student_id,
                "class_num": row.class_num,
                "xueji": row.xueji,
                "subject_scores": {},
                "subject_grade_scores": {},
                "subject_percentiles": {},
                "total_scores": {},
                "total_score": None,
                "grade_rank": None,
            },
        )
        if row.name:
            student["name"] = row.name
        if row.class_num is not None:
            class_counter_by_student[row.student_id][row.class_num] += 1
        if row.xueji is not None:
            student["xueji"] = row.xueji
        student["subject_scores"][row.subject] = row.raw_score
        student["subject_grade_scores"][row.subject] = row.grade_score
        student["subject_percentiles"][row.subject] = row.grade_percentile

    for student_id, counter in class_counter_by_student.items():
        if counter:
            students_by_id[student_id]["class_num"] = counter.most_common(1)[0][0]

    main_total_by_student = {t.student_id: t for t in main_totals}
    for student_id, total in main_total_by_student.items():
        student = students_by_id.setdefault(
            student_id,
            {
                "student_id": student_id,
                "name": student_id,
                "class_num": None,
                "xueji": None,
                "subject_scores": {},
                "subject_grade_scores": {},
                "subject_percentiles": {},
                "total_scores": {},
                "total_score": None,
                "grade_rank": None,
            },
        )
        student["total_score"] = total.total_score
        student["grade_rank"] = total.xueji_rank or total.grade_rank

    teacher = db.query(Teacher).first()
    target_class = None
    if teacher:
        target_class = {
            1: teacher.target_class_high1,
            2: teacher.target_class_high2,
            3: teacher.target_class_high3,
        }.get(exam.grade)

    all_students = list(students_by_id.values())
    if target_class is not None and any(s["class_num"] == target_class for s in all_students):
        stat_student_ids = {s["student_id"] for s in all_students if s["class_num"] == target_class}
    else:
        stat_student_ids = {s["student_id"] for s in all_students}

    all_totals = db.query(TotalScore).filter(TotalScore.exam_id == exam_id).all()
    for total in all_totals:
        student = students_by_id.setdefault(
            total.student_id,
            {
                "student_id": total.student_id,
                "name": total.student_id,
                "class_num": None,
                "xueji": None,
                "subject_scores": {},
                "subject_grade_scores": {},
                "subject_percentiles": {},
                "total_scores": {},
                "total_score": None,
                "grade_rank": None,
            },
        )
        student["total_scores"][total.total_type] = {
            "score": total.total_score,
            "rank": total.xueji_rank or total.grade_rank,
            "percentile": total.grade_percentile,
            "xueji_rank": total.xueji_rank,
            "grade_rank": total.grade_rank,
        }
        if total.total_type == "主三门":
            student["total_score"] = total.total_score
            student["grade_rank"] = total.xueji_rank or total.grade_rank

    stat_totals = [t for t in main_totals if t.student_id in stat_student_ids]
    stat_totals_by_type = defaultdict(list)
    for total in all_totals:
        if total.student_id in stat_student_ids:
            stat_totals_by_type[total.total_type].append(total)

    def summarize_totals(rows):
        scores = [t.total_score for t in rows if t.total_score is not None]
        ranks = [
            rank
            for rank in ((t.xueji_rank or t.grade_rank) for t in rows)
            if rank is not None
        ]
        return {
            "count": len(scores),
            "avg": round(sum(scores) / len(scores), 1) if scores else None,
            "max": max(scores) if scores else None,
            "min": min(scores) if scores else None,
            "rank_min": min(ranks) if ranks else None,
            "rank_max": max(ranks) if ranks else None,
        }

    stats_by_total_type = {
        total_type: summarize_totals(rows)
        for total_type, rows in sorted(stat_totals_by_type.items())
    }
    main_summary = summarize_totals(stat_totals)
    valid_scores = [t.total_score for t in stat_totals if t.total_score is not None]
    valid_ranks = [
        rank
        for rank in ((t.xueji_rank or t.grade_rank) for t in stat_totals)
        if rank is not None
    ]
    avg_score = sum(valid_scores) / len(valid_scores) if valid_scores else None

    from app.analysis.config import get_band_config
    band_cfg = get_band_config(db)
    rank_band_total_types = ["主三门"] if exam.grade == 1 else ["主三门", "3+3"]
    rank_bands_by_class = defaultdict(lambda: {"high_score": 0, "critical": 0, "weak": 0})
    for total in all_totals:
        if total.total_type not in rank_band_total_types:
            continue
        student = students_by_id.get(total.student_id)
        if not student:
            continue
        class_num = student.get("class_num")
        if class_num is None:
            continue
        rank = total.xueji_rank or total.grade_rank
        if rank is None:
            continue
        bands = rank_bands_by_class[(total.total_type, class_num)]
        if 1 <= rank <= band_cfg["high_score_max"]:
            bands["high_score"] += 1
        if band_cfg["critical_min"] <= rank <= band_cfg["critical_max"]:
            bands["critical"] += 1
        if rank >= band_cfg["weak_min"]:
            bands["weak"] += 1

    students = sorted(
        all_students,
        key=lambda s: (
            s["grade_rank"] is None,
            s["grade_rank"] if s["grade_rank"] is not None else 10**9,
            s["student_id"],
        ),
    )
    rank_bands = [
        {"total_type": total_type, "class_num": class_num, **bands}
        for (total_type, class_num), bands in sorted(rank_bands_by_class.items())
    ]

    distribution_total_types = (
        ["主三门", "五门", "九门"] if exam.grade == 1 else ["主三门", "+3", "3+3"]
    )
    distribution_rows = db.query(TotalScore).filter(
        TotalScore.exam_id == exam_id,
        TotalScore.total_type.in_(distribution_total_types),
    ).all()
    max_rank = max(
        (
            rank
            for rank in ((row.xueji_rank or row.grade_rank) for row in distribution_rows)
            if rank is not None
        ),
        default=0,
    )
    max_bucket = max(40, ((max_rank + 39) // 40) * 40)
    rank_distribution = [
        {"band": f"{start}-{start + 39}名次数", **{total_type: 0 for total_type in distribution_total_types}}
        for start in range(1, max_bucket + 1, 40)
    ]
    distribution_index = {
        item["band"]: item for item in rank_distribution
    }
    for row in distribution_rows:
        rank = row.xueji_rank or row.grade_rank
        if rank is None or rank < 1:
            continue
        start = ((rank - 1) // 40) * 40 + 1
        band = f"{start}-{start + 39}名次数"
        if band not in distribution_index:
            distribution_index[band] = {
                "band": band,
                **{total_type: 0 for total_type in distribution_total_types},
            }
            rank_distribution.append(distribution_index[band])
        distribution_index[band][row.total_type] = distribution_index[band].get(row.total_type, 0) + 1

    db.close()

    return {
        "exam": {
            "id": exam.id,
            "name": exam.name,
            "grade": exam.grade,
            "semester": exam.semester,
            "exam_date": exam.exam_date,
            "exam_type": exam.exam_type,
        },
        "class_averages": [{
            "class_num": c.class_num,
            "class_type": c.class_type,
            "teacher_name": c.teacher_name,
            "subject_averages": c.subject_averages,
            "total_averages": c.total_averages,
        } for c in class_avgs],
        "stats": {
            "total_students": len(valid_scores),
            "avg_main_total": round(avg_score, 1) if avg_score is not None else None,
            "max_total": max(valid_scores) if valid_scores else None,
            "min_total": min(valid_scores) if valid_scores else None,
            "rank_min": min(valid_ranks) if valid_ranks else None,
            "rank_max": max(valid_ranks) if valid_ranks else None,
            "by_total_type": stats_by_total_type,
            "main_total": main_summary,
        },
        "students": students,
        "rank_bands": rank_bands,
        "band_config": band_cfg,
        "rank_distribution": rank_distribution,
    }

@router.get("/focus-list/{exam_id}")
async def get_focus_list(exam_id: int, class_num: Optional[int] = None):
    """获取重点关注名单 - Step 5"""
    from app.db.models import SessionLocal, TotalScore, SubjectScore
    from app.analysis.config import SUBJECT_WEAKNESS_PCT_DIFF, get_band_config

    db = SessionLocal()
    band_cfg = get_band_config(db)

    # 基础查询：主三门成绩
    query = db.query(TotalScore).filter(
        TotalScore.exam_id == exam_id,
        TotalScore.total_type == "主三门"
    )

    # 班级筛选
    if class_num:
        student_ids_in_class = db.query(SubjectScore.student_id).filter(
            SubjectScore.exam_id == exam_id,
            SubjectScore.class_num == class_num
        ).distinct().all()
        student_ids_in_class = [s[0] for s in student_ids_in_class]
        query = query.filter(TotalScore.student_id.in_(student_ids_in_class))

    all_totals = query.all()

    focus_list = []

    for t in all_totals:
        student_id = t.student_id
        rank = t.xueji_rank or t.grade_rank or 9999

        # 获取该生各科成绩用于偏科检测
        subject_scores = db.query(SubjectScore).filter(
            SubjectScore.exam_id == exam_id,
            SubjectScore.student_id == student_id
        ).all()

        # 获取姓名
        name = student_id
        class_num_value = None
        for s in subject_scores:
            if s.name:
                name = s.name
            if class_num_value is None and s.class_num is not None:
                class_num_value = s.class_num
            if name != student_id and class_num_value is not None:
                break

        issues = []

        # 临界段（用户可自定义）
        if band_cfg["critical_min"] <= rank <= band_cfg["critical_max"]:
            issues.append("临界段")

        # 薄弱段（用户可自定义）
        if rank >= band_cfg["weak_min"]:
            issues.append("薄弱段")

        # 严重偏科检测（单科百分位 vs 主三门百分位差>=0.20）
        if t.grade_percentile is not None:
            main_pct = t.grade_percentile
            for ss in subject_scores:
                if ss.grade_percentile is not None:
                    diff = ss.grade_percentile - main_pct
                    if diff >= SUBJECT_WEAKNESS_PCT_DIFF:
                        issues.append(f"严重偏科({ss.subject})")

        if issues:
            focus_list.append({
                "student_id": student_id,
                "name": name,
                "class_num": class_num_value,
                "xueji_rank": rank,
                "total_score": t.total_score,
                "issues": issues,
            })

    # 按名次排序
    focus_list.sort(key=lambda x: x["xueji_rank"])

    db.close()
    return {"focus_list": focus_list[:50]}

@router.get("/students/{student_id}")
async def get_student(student_id: str):
    """获取学生画像（跨学年）- Step 5"""
    from app.db.models import SessionLocal, TotalScore, SubjectScore, Exam

    db = SessionLocal()

    # 获取该生所有考试（按年级分组）
    exams = db.query(Exam).join(TotalScore, Exam.id == TotalScore.exam_id).filter(
        TotalScore.student_id == student_id
    ).order_by(Exam.grade, Exam.exam_date).all()

    if not exams:
        db.close()
        raise HTTPException(404, "该学生无成绩记录")

    grades = set(e.grade for e in exams)
    has_cross_year = len(grades) > 1

    # 主三门趋势（跨学年只取主三门）
    main_totals = db.query(TotalScore).filter(
        TotalScore.student_id == student_id,
        TotalScore.total_type == "主三门"
    ).order_by(TotalScore.exam_id).all()

    # 五门总分趋势（高一：语数英物化）
    five_totals = db.query(TotalScore).filter(
        TotalScore.student_id == student_id,
        TotalScore.total_type == "五门"
    ).order_by(TotalScore.exam_id).all()

    # +3 总分趋势（高二/高三用）
    plus3_totals = db.query(TotalScore).filter(
        TotalScore.student_id == student_id,
        TotalScore.total_type == "+3"
    ).order_by(TotalScore.exam_id).all()

    # 3+3 学籍排名趋势（高二/高三用）
    san3_totals = db.query(TotalScore).filter(
        TotalScore.student_id == student_id,
        TotalScore.total_type == "3+3"
    ).order_by(TotalScore.exam_id).all()

    # 返回全部单科成绩；学生详情页的历次明细需要展示加三学科。
    subject_scores = db.query(SubjectScore).filter(
        SubjectScore.student_id == student_id
    ).order_by(SubjectScore.exam_id).all()

    # 姓名
    name_row = db.query(SubjectScore).filter(SubjectScore.student_id == student_id).first()
    name = name_row.name if name_row and name_row.name else student_id

    # 构建考试ID到名称的映射
    exam_map = {e.id: e for e in exams}

    # 计算每场考试该生的主三门班级排名（按本班内 total_score 降序）
    # 先构建 (exam_id, student_id) -> class_num 映射
    student_class_by_exam: dict[int, int] = {}
    for s in subject_scores:
        if s.class_num is not None and s.exam_id not in student_class_by_exam:
            student_class_by_exam[s.exam_id] = s.class_num

    class_rank_by_exam: dict[int, int | None] = {}
    for t in main_totals:
        cls = student_class_by_exam.get(t.exam_id)
        if cls is None or t.total_score is None:
            class_rank_by_exam[t.exam_id] = None
            continue
        # 同班同考试的所有 student_id
        peer_ids = [
            row[0]
            for row in db.query(SubjectScore.student_id)
            .filter(SubjectScore.exam_id == t.exam_id, SubjectScore.class_num == cls)
            .distinct()
            .all()
        ]
        if not peer_ids:
            class_rank_by_exam[t.exam_id] = None
            continue
        peer_totals = (
            db.query(TotalScore.total_score)
            .filter(
                TotalScore.exam_id == t.exam_id,
                TotalScore.total_type == "主三门",
                TotalScore.student_id.in_(peer_ids),
                TotalScore.total_score.isnot(None),
            )
            .all()
        )
        peer_scores = [row[0] for row in peer_totals]
        # 排名 = 严格高于本人的人数 + 1
        class_rank_by_exam[t.exam_id] = sum(1 for s in peer_scores if s > t.total_score) + 1

    # 班级 / 学籍：取该生历次记录中出现最多的取值（前端头部展示与学籍徽章用）
    class_counter = Counter(s.class_num for s in subject_scores if s.class_num is not None)
    class_num_value = class_counter.most_common(1)[0][0] if class_counter else None
    xueji_counter = Counter(s.xueji for s in subject_scores if s.xueji is not None)
    xueji_code_value = xueji_counter.most_common(1)[0][0] if xueji_counter else None

    db.close()

    def exam_sort_key(exam_id):
        e = exam_map.get(exam_id)
        return (e.grade if e else 0, e.exam_date if e else "")

    main_totals_sorted = sorted(main_totals, key=lambda t: exam_sort_key(t.exam_id))
    five_totals_sorted = sorted(five_totals, key=lambda t: exam_sort_key(t.exam_id))
    plus3_totals_sorted = sorted(plus3_totals, key=lambda t: exam_sort_key(t.exam_id))
    san3_totals_sorted = sorted(san3_totals, key=lambda t: exam_sort_key(t.exam_id))
    subject_scores_sorted = sorted(subject_scores, key=lambda s: exam_sort_key(s.exam_id))

    return {
        "student_id": student_id,
        "name": name,
        "has_cross_year": has_cross_year,
        "grades": sorted(list(grades)),
        "class_num": class_num_value,
        "xueji_code": xueji_code_value,
        "main_total_trend": [{
            "exam_id": t.exam_id,
            "exam_name": exam_map[t.exam_id].name if t.exam_id in exam_map else str(t.exam_id),
            "exam_date": exam_map[t.exam_id].exam_date if t.exam_id in exam_map else None,
            "grade": exam_map[t.exam_id].grade if t.exam_id in exam_map else None,
            "total_score": t.total_score,
            "xueji_rank": t.xueji_rank,
            "grade_percentile": t.grade_percentile,
            "class_rank": class_rank_by_exam.get(t.exam_id),
        } for t in main_totals_sorted],
        "five_trend": [{
            "exam_id": t.exam_id,
            "exam_name": exam_map[t.exam_id].name if t.exam_id in exam_map else str(t.exam_id),
            "exam_date": exam_map[t.exam_id].exam_date if t.exam_id in exam_map else None,
            "grade": exam_map[t.exam_id].grade if t.exam_id in exam_map else None,
            "total_score": t.total_score,
            "xueji_rank": t.xueji_rank,
            "grade_percentile": t.grade_percentile,
        } for t in five_totals_sorted],
        "subject_trend": [{
            "exam_id": s.exam_id,
            "exam_name": exam_map[s.exam_id].name if s.exam_id in exam_map else str(s.exam_id),
            "exam_date": exam_map[s.exam_id].exam_date if s.exam_id in exam_map else None,
            "subject": s.subject,
            "raw_score": s.raw_score,
            "grade_percentile": s.grade_percentile,
        } for s in subject_scores_sorted],
        "plus3_trend": [{
            "exam_id": t.exam_id,
            "exam_name": exam_map[t.exam_id].name if t.exam_id in exam_map else str(t.exam_id),
            "exam_date": exam_map[t.exam_id].exam_date if t.exam_id in exam_map else None,
            "grade": exam_map[t.exam_id].grade if t.exam_id in exam_map else None,
            "total_score": t.total_score,
            "xueji_rank": t.xueji_rank,
            "grade_percentile": t.grade_percentile,
        } for t in plus3_totals_sorted],
        "san3_trend": [{
            "exam_id": t.exam_id,
            "exam_name": exam_map[t.exam_id].name if t.exam_id in exam_map else str(t.exam_id),
            "exam_date": exam_map[t.exam_id].exam_date if t.exam_id in exam_map else None,
            "grade": exam_map[t.exam_id].grade if t.exam_id in exam_map else None,
            "total_score": t.total_score,
            "xueji_rank": t.xueji_rank,
            "grade_percentile": t.grade_percentile,
        } for t in san3_totals_sorted],
    }

@router.get("/class/compare")
async def compare_classes(exam_id: Optional[int] = None):
    """班级对比 - Step 5"""
    from app.db.models import SessionLocal, Exam, ClassAverage, SubjectScore, TotalScore
    from sqlalchemy import func

    db = SessionLocal()

    exams_query = db.query(Exam).order_by(Exam.exam_date.desc())
    if exam_id:
        exams_query = exams_query.filter(Exam.id == exam_id)

    exams = exams_query.limit(10).all()

    result = []
    for e in exams:
        # 从 ClassAverage 表读取
        avgs = db.query(ClassAverage).filter(ClassAverage.exam_id == e.id).all()

        if avgs:
            classes = [{
                "class_num": a.class_num,
                "class_type": a.class_type,
                "main_total_avg": a.total_averages.get("主三门") if a.total_averages else None,
                "five_total_avg": (
                    a.total_averages.get("五门")
                    or a.total_averages.get("五门总分")
                    if a.total_averages
                    else None
                ),
                "nine_total_avg": (
                    a.total_averages.get("九门")
                    or a.total_averages.get("九门总分")
                    if a.total_averages
                    else None
                ),
                "plus3_avg": a.total_averages.get("+3") if a.total_averages else None,
                "total_avg": (
                    a.total_averages.get("3+3总分")
                    or a.total_averages.get("3+3")
                    if a.total_averages
                    else None
                ),
            } for a in avgs]
        else:
            # 图片/班均分表缺失时，直接从学生总分表按班级聚合，不能用单科均分粗算。
            student_classes = db.query(
                SubjectScore.student_id.label("student_id"),
                SubjectScore.class_num.label("class_num"),
            ).filter(
                SubjectScore.exam_id == e.id,
                SubjectScore.class_num.isnot(None),
            ).group_by(
                SubjectScore.student_id,
                SubjectScore.class_num,
            ).subquery()

            total_rows = db.query(
                student_classes.c.class_num,
                TotalScore.total_type,
                func.avg(TotalScore.total_score).label("avg_total"),
            ).join(
                TotalScore,
                (TotalScore.student_id == student_classes.c.student_id)
                & (TotalScore.exam_id == e.id),
            ).filter(
                TotalScore.total_type.in_(["主三门", "五门", "九门", "+3", "3+3"]),
            ).group_by(
                student_classes.c.class_num,
                TotalScore.total_type,
            ).all()

            by_class = {}
            for row in total_rows:
                entry = by_class.setdefault(
                    row.class_num,
                    {
                        "class_num": row.class_num,
                        "main_total_avg": None,
                        "five_total_avg": None,
                        "nine_total_avg": None,
                        "plus3_avg": None,
                        "total_avg": None,
                    },
                )
                if row.total_type == "主三门":
                    entry["main_total_avg"] = round(row.avg_total, 1) if row.avg_total is not None else None
                elif row.total_type == "五门":
                    entry["five_total_avg"] = round(row.avg_total, 1) if row.avg_total is not None else None
                elif row.total_type == "九门":
                    entry["nine_total_avg"] = round(row.avg_total, 1) if row.avg_total is not None else None
                elif row.total_type == "+3":
                    entry["plus3_avg"] = round(row.avg_total, 1) if row.avg_total is not None else None
                elif row.total_type == "3+3":
                    entry["total_avg"] = round(row.avg_total, 1) if row.avg_total is not None else None
            classes = [by_class[key] for key in sorted(by_class)]

        result.append({
            "exam_id": e.id,
            "exam_name": e.name,
            "grade": e.grade,
            "classes": classes,
        })

    db.close()
    return {"exams": result}

@router.get("/subject-weakness/{exam_id}")
async def subject_weakness(exam_id: int, class_num: Optional[int] = None):
    """单科薄弱名单 - Step 5"""
    from app.db.models import SessionLocal, SubjectScore, TotalScore
    from app.analysis.config import SUBJECT_WEAKNESS_PCT_DIFF

    db = SessionLocal()

    # 获取主三门百分位作为基准
    main_totals = db.query(TotalScore).filter(
        TotalScore.exam_id == exam_id,
        TotalScore.total_type == "主三门"
    ).all()

    main_pct_map = {t.student_id: t.grade_percentile for t in main_totals if t.grade_percentile is not None}

    # 获取所有单科成绩
    query = db.query(SubjectScore).filter(SubjectScore.exam_id == exam_id)
    if class_num:
        query = query.filter(SubjectScore.class_num == class_num)

    all_subjects = query.all()

    # 按学生分组
    student_subjects = {}
    for s in all_subjects:
        if s.student_id not in student_subjects:
            student_subjects[s.student_id] = []
        student_subjects[s.student_id].append(s)

    weakness_list = []

    for student_id, subjects in student_subjects.items():
        main_pct = main_pct_map.get(student_id)
        if main_pct is None:
            continue

        for s in subjects:
            if s.grade_percentile is not None:
                diff = s.grade_percentile - main_pct
                if diff >= SUBJECT_WEAKNESS_PCT_DIFF:
                    name = student_id
                    for sub in subjects:
                        if sub.name:
                            name = sub.name
                            break
                    weakness_list.append({
                        "student_id": student_id,
                        "name": name,
                        "subject": s.subject,
                        "raw_score": s.raw_score,
                        "grade_percentile": s.grade_percentile,
                        "diff": round(diff, 3),
                    })

    weakness_list.sort(key=lambda x: x["grade_percentile"])

    db.close()
    return {"subject_weakness": weakness_list[:50]}
