import anthropic
from typing import Any
from typing import Optional

from app.chat.config import ChatConfig, get_chat_config


def create_anthropic_client(config: ChatConfig | None = None):
    config = config or get_chat_config()
    kwargs = {"api_key": config.api_key}
    if config.base_url:
        kwargs["base_url"] = config.base_url
    return anthropic.Anthropic(**kwargs)


def create_openai_client(config: ChatConfig | None = None):
    from openai import OpenAI

    config = config or get_chat_config()
    kwargs: dict[str, Any] = {"api_key": config.api_key}
    if config.base_url:
        kwargs["base_url"] = config.base_url
    return OpenAI(**kwargs)


def get_client():
    config = get_chat_config()
    if not config.is_configured:
        return None
    if config.provider == "openai":
        return create_openai_client(config)
    return create_anthropic_client(config)

def list_exams(grade: Optional[int] = None, year_range: Optional[tuple] = None) -> list:
    """列出已建档考试"""
    from app.db.models import Exam
    from app.db.models import get_db

    db = next(get_db())
    query = db.query(Exam).order_by(Exam.exam_date.desc())
    if grade:
        query = query.filter(Exam.grade == grade)
    exams = query.all()
    db.close()
    return [{"id": e.id, "name": e.name, "grade": e.grade, "exam_date": e.exam_date} for e in exams]

def student_lookup(name: Optional[str] = None, student_id: Optional[str] = None) -> list:
    """按姓名/学号定位学生"""
    from app.db.models import SubjectScore
    from app.db.models import get_db

    db = next(get_db())
    query = db.query(SubjectScore.student_id, SubjectScore.name).distinct()
    if student_id:
        query = query.filter(SubjectScore.student_id == student_id)
    if name:
        query = query.filter(SubjectScore.name.like(f"%{name}%"))
    results = query.all()
    db.close()
    return [{"student_id": r[0], "name": r[1]} for r in results]

def student_exam_detail(student_id: str, exam_id: int) -> dict:
    """某生某次考试的完整成绩"""
    from app.db.models import SubjectScore, TotalScore
    from app.db.models import get_db

    db = next(get_db())
    subjects = db.query(SubjectScore).filter(
        SubjectScore.student_id == student_id,
        SubjectScore.exam_id == exam_id
    ).all()
    totals = db.query(TotalScore).filter(
        TotalScore.student_id == student_id,
        TotalScore.exam_id == exam_id
    ).all()
    db.close()

    return {
        "student_id": student_id,
        "exam_id": exam_id,
        "subjects": [{"subject": s.subject, "raw_score": s.raw_score, "grade_percentile": s.grade_percentile} for s in subjects],
        "totals": [{"total_type": t.total_type, "total_score": t.total_score, "xueji_rank": t.xueji_rank} for t in totals],
    }


def student_trend(student_id: str, total_type: str = "主三门", exam_ids: Optional[list[int]] = None) -> dict:
    """跨次趋势。跨学年调用方应使用主三门。"""
    from app.analysis.trends import compute_student_trend
    from app.db.models import Exam, TotalScore
    from app.db.models import get_db

    db = next(get_db())
    if exam_ids is None:
        exam_ids = [
            row[0]
            for row in db.query(TotalScore.exam_id)
            .join(Exam, Exam.id == TotalScore.exam_id)
            .filter(TotalScore.student_id == student_id, TotalScore.total_type == total_type)
            .order_by(Exam.grade, Exam.exam_date)
            .distinct()
            .all()
        ]
    result = compute_student_trend(student_id, total_type, exam_ids, db)
    db.close()
    return result


def student_learning_profile(
    student_id: Optional[str] = None,
    name: Optional[str] = None,
    subject_limit: int = 5,
) -> dict[str, Any]:
    """学生整体学习画像：总分趋势、单科强弱项、进退步科目。"""
    from collections import defaultdict

    from app.db.models import Exam, SubjectScore, TotalScore
    from app.db.models import get_db

    db = next(get_db())
    students_query = db.query(SubjectScore.student_id, SubjectScore.name).distinct()
    if student_id:
        students_query = students_query.filter(SubjectScore.student_id == student_id)
    if name:
        students_query = students_query.filter(SubjectScore.name.like(f"%{name}%"))
    students = students_query.limit(10).all()

    if not students:
        db.close()
        return {"error": "未找到学生", "student_id": student_id, "name": name}
    if len(students) > 1 and not student_id:
        db.close()
        return {
            "error": "匹配到多个学生，请指定学号",
            "candidates": [{"student_id": row[0], "name": row[1]} for row in students],
        }

    resolved_student_id = students[0][0]
    resolved_name = students[0][1] or resolved_student_id

    exam_rows = (
        db.query(Exam)
        .join(TotalScore, Exam.id == TotalScore.exam_id)
        .filter(TotalScore.student_id == resolved_student_id)
        .order_by(Exam.grade, Exam.exam_date, Exam.id)
        .distinct()
        .all()
    )
    exam_map = {exam.id: exam for exam in exam_rows}

    totals = (
        db.query(TotalScore)
        .filter(TotalScore.student_id == resolved_student_id)
        .all()
    )
    totals_by_type: dict[str, list[TotalScore]] = defaultdict(list)
    for total in totals:
        totals_by_type[total.total_type].append(total)
    for rows in totals_by_type.values():
        rows.sort(key=lambda row: (exam_map.get(row.exam_id).grade if exam_map.get(row.exam_id) else 0,
                                   exam_map.get(row.exam_id).exam_date if exam_map.get(row.exam_id) else "",
                                   row.exam_id))

    subjects = (
        db.query(SubjectScore)
        .filter(SubjectScore.student_id == resolved_student_id)
        .all()
    )
    subjects_by_name: dict[str, list[SubjectScore]] = defaultdict(list)
    for score in subjects:
        subjects_by_name[score.subject].append(score)
    for rows in subjects_by_name.values():
        rows.sort(key=lambda row: (exam_map.get(row.exam_id).grade if exam_map.get(row.exam_id) else 0,
                                   exam_map.get(row.exam_id).exam_date if exam_map.get(row.exam_id) else "",
                                   row.exam_id))

    def exam_payload(exam_id: int) -> dict[str, Any]:
        exam = exam_map.get(exam_id)
        if not exam:
            return {"id": exam_id, "name": str(exam_id), "grade": None, "exam_date": None}
        return {"id": exam.id, "name": exam.name, "grade": exam.grade, "exam_date": exam.exam_date}

    main_total_trend = []
    for total in totals_by_type.get("主三门", []):
        main_total_trend.append(
            {
                "exam": exam_payload(total.exam_id),
                "total_score": total.total_score,
                "xueji_rank": total.xueji_rank,
                "grade_rank": total.grade_rank,
                "grade_percentile": total.grade_percentile,
            }
        )

    subject_summaries = []
    subject_history = {}
    for subject, rows in subjects_by_name.items():
        history = [
            {
                "exam": exam_payload(score.exam_id),
                "raw_score": score.raw_score,
                "grade_score": score.grade_score,
                "grade_percentile": score.grade_percentile,
            }
            for score in rows
        ]
        subject_history[subject] = history
        first = rows[0]
        latest = rows[-1]
        raw_score_change = None
        if first.raw_score is not None and latest.raw_score is not None:
            raw_score_change = round(latest.raw_score - first.raw_score, 2)
        percentile_change = None
        if first.grade_percentile is not None and latest.grade_percentile is not None:
            percentile_change = round(first.grade_percentile - latest.grade_percentile, 4)
        subject_summaries.append(
            {
                "subject": subject,
                "latest_raw_score": latest.raw_score,
                "latest_grade_score": latest.grade_score,
                "latest_grade_percentile": latest.grade_percentile,
                "raw_score_change": raw_score_change,
                "percentile_change": percentile_change,
                "exam_count": len(rows),
            }
        )

    latest_exam = exam_rows[-1] if exam_rows else None
    latest_subjects = []
    if latest_exam:
        latest_subjects = [
            {
                "subject": score.subject,
                "raw_score": score.raw_score,
                "grade_score": score.grade_score,
                "grade_percentile": score.grade_percentile,
            }
            for score in subjects
            if score.exam_id == latest_exam.id
        ]

    strengths = sorted(
        [row for row in latest_subjects if row["grade_percentile"] is not None],
        key=lambda row: row["grade_percentile"],
    )[:subject_limit]
    weaknesses = sorted(
        [row for row in latest_subjects if row["grade_percentile"] is not None],
        key=lambda row: row["grade_percentile"],
        reverse=True,
    )[:subject_limit]
    progress_subjects = sorted(
        [row for row in subject_summaries if row["percentile_change"] is not None],
        key=lambda row: row["percentile_change"],
        reverse=True,
    )[:subject_limit]
    regression_subjects = sorted(
        [row for row in subject_summaries if row["percentile_change"] is not None],
        key=lambda row: row["percentile_change"],
    )[:subject_limit]

    db.close()
    return {
        "student": {
            "student_id": resolved_student_id,
            "name": resolved_name,
            "current_grade": latest_exam.grade if latest_exam else None,
            "latest_exam": exam_payload(latest_exam.id) if latest_exam else None,
        },
        "available_exams": [exam_payload(exam.id) for exam in exam_rows],
        "main_total_trend": main_total_trend,
        "latest_subjects": latest_subjects,
        "strengths": strengths,
        "weaknesses": weaknesses,
        "progress_subjects": progress_subjects,
        "regression_subjects": regression_subjects,
        "subject_history": subject_history,
        "metric_note": "grade_percentile 越小表示年级位置越靠前；percentile_change 为正表示进步，为负表示退步。描述趋势时必须以 percentile_change / xueji_rank 为主，raw_score_change 只能作为辅助说明。",
        "analysis_boundary": "仅基于已导入考试成绩，不能推断课堂表现、作业习惯或家庭因素。",
    }


def class_trend(class_num: int, metric: str, exam_ids: Optional[list[int]] = None) -> list[dict[str, Any]]:
    """班级层均分时间序列。metric 可以是总分类型或学科名。"""
    from app.db.models import ClassAverage, Exam
    from app.db.models import get_db

    db = next(get_db())
    query = db.query(Exam).order_by(Exam.grade, Exam.exam_date)
    if exam_ids:
        query = query.filter(Exam.id.in_(exam_ids))
    exams = query.all()

    series = []
    for exam in exams:
        avg = db.query(ClassAverage).filter(
            ClassAverage.exam_id == exam.id,
            ClassAverage.class_num == class_num,
        ).first()
        if not avg:
            continue
        value = None
        if avg.total_averages:
            value = avg.total_averages.get(metric)
        if value is None and avg.subject_averages:
            value = avg.subject_averages.get(metric)
        series.append({"exam_id": exam.id, "exam_name": exam.name, "metric": metric, "value": value})
    db.close()
    return series


def compare_classes(class_nums: list[int], exam_id: int, metric: str) -> list[dict[str, Any]]:
    """多班同次对比。"""
    from app.db.models import ClassAverage
    from app.db.models import get_db

    db = next(get_db())
    avgs = db.query(ClassAverage).filter(
        ClassAverage.exam_id == exam_id,
        ClassAverage.class_num.in_(class_nums),
    ).all()
    rows = []
    for avg in avgs:
        value = None
        if avg.total_averages:
            value = avg.total_averages.get(metric)
        if value is None and avg.subject_averages:
            value = avg.subject_averages.get(metric)
        rows.append({"class_num": avg.class_num, "metric": metric, "value": value})
    db.close()
    return rows


def focus_list(exam_id: int, category: Optional[str] = None) -> list[dict[str, Any]]:
    """重点关注名单。"""
    from app.analysis.config import CRITICAL_RANGE, SUBJECT_WEAKNESS_PCT_DIFF, WEAK_RANGE
    from app.db.models import SubjectScore, TotalScore
    from app.db.models import get_db

    db = next(get_db())
    totals = db.query(TotalScore).filter(
        TotalScore.exam_id == exam_id,
        TotalScore.total_type == "主三门",
    ).all()
    rows = []
    for total in totals:
        rank = total.xueji_rank or total.grade_rank or 999999
        subjects = db.query(SubjectScore).filter(
            SubjectScore.exam_id == exam_id,
            SubjectScore.student_id == total.student_id,
        ).all()
        name = next((s.name for s in subjects if s.name), total.student_id)
        issues = []
        if CRITICAL_RANGE[0] <= rank <= CRITICAL_RANGE[1]:
            issues.append("临界段")
        if rank > WEAK_RANGE[0]:
            issues.append("薄弱段")
        if total.grade_percentile is not None:
            for subject in subjects:
                if subject.grade_percentile is not None and subject.grade_percentile - total.grade_percentile >= SUBJECT_WEAKNESS_PCT_DIFF:
                    issues.append(f"严重偏科({subject.subject})")
        if category:
            issues = [issue for issue in issues if category in issue]
        if issues:
            rows.append({"student_id": total.student_id, "name": name, "xueji_rank": rank, "issues": issues})
    db.close()
    return sorted(rows, key=lambda row: row["xueji_rank"])[:50]


def subject_weakness(class_num: int, exam_id: int) -> list[dict[str, Any]]:
    """本班单科薄弱清单。"""
    from app.analysis.config import SUBJECT_WEAKNESS_PCT_DIFF
    from app.db.models import SubjectScore, TotalScore
    from app.db.models import get_db

    db = next(get_db())
    main_totals = db.query(TotalScore).filter(
        TotalScore.exam_id == exam_id,
        TotalScore.total_type == "主三门",
    ).all()
    main_pct = {row.student_id: row.grade_percentile for row in main_totals if row.grade_percentile is not None}
    subjects = db.query(SubjectScore).filter(
        SubjectScore.exam_id == exam_id,
        SubjectScore.class_num == class_num,
    ).all()
    rows = []
    for subject in subjects:
        base = main_pct.get(subject.student_id)
        if base is None or subject.grade_percentile is None:
            continue
        diff = subject.grade_percentile - base
        if diff >= SUBJECT_WEAKNESS_PCT_DIFF:
            rows.append(
                {
                    "student_id": subject.student_id,
                    "name": subject.name,
                    "subject": subject.subject,
                    "raw_score": subject.raw_score,
                    "grade_percentile": subject.grade_percentile,
                    "diff": round(diff, 3),
                }
            )
    db.close()
    return sorted(rows, key=lambda row: row["grade_percentile"])[:50]


def subject_progress_ranking(
    grade: int,
    subject: str,
    start_exam_id: Optional[int] = None,
    end_exam_id: Optional[int] = None,
    limit: int = 10,
    direction: str = "progress",
) -> dict[str, Any]:
    """按年级/学科查询跨考试进步最大的学生。"""
    from app.db.models import Exam, SubjectScore
    from app.db.models import get_db

    db = next(get_db())
    exams_query = db.query(Exam).filter(Exam.grade == grade).order_by(Exam.exam_date, Exam.id)
    exams = exams_query.all()
    if len(exams) < 2 and not (start_exam_id and end_exam_id):
        db.close()
        return {"error": "该年级可比较的考试少于2次", "grade": grade, "subject": subject, "rows": []}

    exam_by_id = {exam.id: exam for exam in exams}
    if start_exam_id is None:
        start_exam = exams[0]
    else:
        start_exam = exam_by_id.get(start_exam_id) or db.query(Exam).filter(Exam.id == start_exam_id).first()
    if end_exam_id is None:
        end_exam = exams[-1]
    else:
        end_exam = exam_by_id.get(end_exam_id) or db.query(Exam).filter(Exam.id == end_exam_id).first()

    if not start_exam or not end_exam:
        db.close()
        return {"error": "起止考试不存在", "grade": grade, "subject": subject, "rows": []}
    if start_exam.id == end_exam.id:
        db.close()
        return {"error": "起止考试不能相同", "grade": grade, "subject": subject, "rows": []}

    start_scores = db.query(SubjectScore).filter(
        SubjectScore.exam_id == start_exam.id,
        SubjectScore.subject == subject,
    ).all()
    end_scores = db.query(SubjectScore).filter(
        SubjectScore.exam_id == end_exam.id,
        SubjectScore.subject == subject,
    ).all()

    start_by_student = {score.student_id: score for score in start_scores}
    rows = []
    for end_score in end_scores:
        start_score = start_by_student.get(end_score.student_id)
        if not start_score:
            continue

        percentile_change = None
        if start_score.grade_percentile is not None and end_score.grade_percentile is not None:
            percentile_change = round(start_score.grade_percentile - end_score.grade_percentile, 4)

        raw_score_change = None
        if start_score.raw_score is not None and end_score.raw_score is not None:
            raw_score_change = round(end_score.raw_score - start_score.raw_score, 2)

        if percentile_change is None and raw_score_change is None:
            continue

        rows.append(
            {
                "student_id": end_score.student_id,
                "name": end_score.name or start_score.name,
                "class_num": end_score.class_num or start_score.class_num,
                "start_raw_score": start_score.raw_score,
                "end_raw_score": end_score.raw_score,
                "raw_score_change": raw_score_change,
                "start_grade_percentile": start_score.grade_percentile,
                "end_grade_percentile": end_score.grade_percentile,
                "percentile_change": percentile_change,
            }
        )

    reverse = direction != "regression"
    none_value = float("-inf") if reverse else float("inf")
    rows.sort(
        key=lambda row: (
            row["percentile_change"] if row["percentile_change"] is not None else none_value,
            row["raw_score_change"] if row["raw_score_change"] is not None else none_value,
        ),
        reverse=reverse,
    )
    db.close()

    return {
        "grade": grade,
        "subject": subject,
        "start_exam": {"id": start_exam.id, "name": start_exam.name, "exam_date": start_exam.exam_date},
        "end_exam": {"id": end_exam.id, "name": end_exam.name, "exam_date": end_exam.exam_date},
        "direction": direction,
        "metric": "percentile_change 正数表示学科年级位置进步，负数表示退步；raw_score_change 为原始分变化",
        "rows": rows[: max(1, min(limit, 50))],
    }


TOOL_FUNCTIONS = {
    "list_exams": list_exams,
    "student_lookup": student_lookup,
    "student_exam_detail": student_exam_detail,
    "student_trend": student_trend,
    "student_learning_profile": student_learning_profile,
    "class_trend": class_trend,
    "compare_classes": compare_classes,
    "focus_list": focus_list,
    "subject_weakness": subject_weakness,
    "subject_progress_ranking": subject_progress_ranking,
}


def execute_tool(name: str, args: dict[str, Any]) -> Any:
    if name == "render_chart":
        return {"chart": args}
    func = TOOL_FUNCTIONS.get(name)
    if not func:
        return {"error": f"未知工具: {name}"}
    return func(**args)

def to_openai_tools(tools: list[dict]) -> list[dict]:
    """把 Anthropic 风格 tools 转成 OpenAI function-calling 格式。"""
    return [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t.get("description", ""),
                "parameters": t.get("input_schema", {"type": "object", "properties": {}}),
            },
        }
        for t in tools
    ]


TOOLS = [
    {
        "name": "list_exams",
        "description": "罗列已建档考试",
        "input_schema": {
            "type": "object",
            "properties": {
                "grade": {"type": "integer", "description": "年级(1=高一,2=高二,3=高三)"},
                "year_range": {"type": "array", "items": {"type": "string"}, "description": "年份范围如['2024','2025']"},
            },
        },
    },
    {
        "name": "student_lookup",
        "description": "按姓名/学号定位学生",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "student_id": {"type": "string"},
            },
        },
    },
    {
        "name": "student_exam_detail",
        "description": "某生某次考试的完整成绩",
        "input_schema": {
            "type": "object",
            "properties": {
                "student_id": {"type": "string"},
                "exam_id": {"type": "integer"},
            },
            "required": ["student_id", "exam_id"],
        },
    },
    {
        "name": "student_trend",
        "description": "跨次趋势（自动判断是否跨学年）",
        "input_schema": {
            "type": "object",
            "properties": {
                "student_id": {"type": "string"},
                "total_type": {"type": "string"},
                "exam_ids": {"type": "array", "items": {"type": "integer"}},
            },
            "required": ["student_id"],
        },
    },
    {
        "name": "student_learning_profile",
        "description": "分析某个学生的整体学习情况，返回总分趋势、最新优势/薄弱科目、进步/退步科目和各科历史。",
        "input_schema": {
            "type": "object",
            "properties": {
                "student_id": {"type": "string", "description": "学号；如果当前页面上下文有 student_id，应优先使用"},
                "name": {"type": "string", "description": "学生姓名；姓名不唯一时工具会返回候选学生"},
                "subject_limit": {"type": "integer", "description": "优势/薄弱/进退步科目返回数量，默认5"},
            },
        },
    },
    {
        "name": "class_trend",
        "description": "班级层均分/排名时间序列",
        "input_schema": {
            "type": "object",
            "properties": {
                "class_num": {"type": "integer"},
                "metric": {"type": "string"},
                "exam_ids": {"type": "array", "items": {"type": "integer"}},
            },
        },
    },
    {
        "name": "compare_classes",
        "description": "多班同次对比",
        "input_schema": {
            "type": "object",
            "properties": {
                "class_nums": {"type": "array", "items": {"type": "integer"}},
                "exam_id": {"type": "integer"},
                "metric": {"type": "string"},
            },
        },
    },
    {
        "name": "focus_list",
        "description": "拉某次考试的重点关注名单",
        "input_schema": {
            "type": "object",
            "properties": {
                "exam_id": {"type": "integer"},
                "category": {"type": "string"},
            },
        },
    },
    {
        "name": "subject_weakness",
        "description": "本班单科薄弱清单",
        "input_schema": {
            "type": "object",
            "properties": {
                "class_num": {"type": "integer"},
                "exam_id": {"type": "integer"},
            },
        },
    },
    {
        "name": "subject_progress_ranking",
        "description": "按年级和学科找跨考试进步或退步最大的学生，例如“高二语文进步最大的是谁”。默认比较该年级最早和最新考试。",
        "input_schema": {
            "type": "object",
            "properties": {
                "grade": {"type": "integer", "description": "年级(1=高一,2=高二,3=高三)"},
                "subject": {"type": "string", "description": "学科名，如语文、数学、英语"},
                "start_exam_id": {"type": "integer", "description": "起始考试ID；不填则使用该年级最早考试"},
                "end_exam_id": {"type": "integer", "description": "结束考试ID；不填则使用该年级最新考试"},
                "limit": {"type": "integer", "description": "返回人数，默认10，最多50"},
                "direction": {"type": "string", "description": "progress=进步最大，regression=退步最大"},
            },
            "required": ["grade", "subject"],
        },
    },
]
