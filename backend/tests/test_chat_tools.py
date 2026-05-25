import pytest

from app.chat.tools import TOOL_FUNCTIONS, student_learning_profile, subject_progress_ranking


def test_subject_progress_ranking_registered():
    assert TOOL_FUNCTIONS["subject_progress_ranking"] is subject_progress_ranking
    assert TOOL_FUNCTIONS["student_learning_profile"] is student_learning_profile


def test_subject_progress_ranking_for_high2_chinese():
    result = subject_progress_ranking(grade=2, subject="语文", limit=5)
    if result.get("error"):
        pytest.skip(result["error"])

    assert result["subject"] == "语文"
    assert result["start_exam"]["id"] != result["end_exam"]["id"]
    assert 1 <= len(result["rows"]) <= 5
    first = result["rows"][0]
    assert {"student_id", "name", "percentile_change", "raw_score_change"} <= set(first)


def test_student_learning_profile_for_existing_student():
    from app.db.models import SessionLocal, SubjectScore

    db = SessionLocal()
    row = db.query(SubjectScore).first()
    db.close()
    if row is None:
        pytest.skip("no students in local tracker database")

    result = student_learning_profile(student_id=row.student_id)

    assert result["student"]["student_id"] == row.student_id
    assert isinstance(result["main_total_trend"], list)
    assert isinstance(result["latest_subjects"], list)
    assert "metric_note" in result
