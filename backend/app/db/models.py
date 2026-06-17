from sqlalchemy import create_engine, Column, Integer, String, Float, JSON, DateTime, ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from datetime import datetime

from app.paths import DATA_DIR as EXAM_TRACKER_DIR

DATABASE_URL = f"sqlite:///{EXAM_TRACKER_DIR}/db.sqlite"

engine = create_engine(DATABASE_URL, echo=False)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class Teacher(Base):
    __tablename__ = "teacher"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=True)
    school = Column(String, nullable=True)
    target_class_high1 = Column(Integer, nullable=True)
    target_class_high2 = Column(Integer, nullable=True)
    target_class_high3 = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class Exam(Base):
    __tablename__ = "exam"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    grade = Column(Integer, nullable=False)  # 1=高一, 2=高二, 3=高三
    semester = Column(String, nullable=False)  # 上/下
    exam_date = Column(String, nullable=True)
    exam_type = Column(String, nullable=False)  # 月考/期中/期末
    source_files = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)

class Upload(Base):
    __tablename__ = "upload"
    id = Column(Integer, primary_key=True)
    exam_id = Column(Integer, ForeignKey("exam.id"), nullable=True)
    file_path = Column(String, nullable=False)
    file_hash = Column(String, nullable=True)
    kind = Column(String, nullable=False)  # student_scores/class_averages/rank_bands
    mime = Column(String, nullable=False)  # xlsx
    parsed_ok = Column(Integer, default=0)
    parse_log = Column(JSON, nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow)

class SubjectScore(Base):
    __tablename__ = "subject_score"
    id = Column(Integer, primary_key=True)
    exam_id = Column(Integer, ForeignKey("exam.id"), nullable=False)
    student_id = Column(String, nullable=False)
    class_num = Column(Integer, nullable=True)
    xueji = Column(Integer, nullable=True)
    name = Column(String, nullable=True)
    subject = Column(String, nullable=False)
    raw_score = Column(Float, nullable=True)
    grade_score = Column(Float, nullable=True)  # 高二/高三等级分，高一为NULL
    grade_percentile = Column(Float, nullable=True)

    __table_args__ = (
        Index("idx_subject_exam_student", "exam_id", "student_id"),
        Index("idx_subject_student_subject", "student_id", "subject"),
    )

class TotalScore(Base):
    __tablename__ = "total_score"
    id = Column(Integer, primary_key=True)
    exam_id = Column(Integer, ForeignKey("exam.id"), nullable=False)
    student_id = Column(String, nullable=False)
    total_type = Column(String, nullable=False)  # 主三门/五门/九门/+3/3+3
    total_score = Column(Float, nullable=True)
    grade_percentile = Column(Float, nullable=True)
    xueji_rank = Column(Integer, nullable=True)
    grade_rank = Column(Integer, nullable=True)

    __table_args__ = (
        Index("idx_total_exam_type", "exam_id", "total_type"),
        Index("idx_total_student_type", "student_id", "total_type"),
    )

class ClassAverage(Base):
    __tablename__ = "class_average"
    id = Column(Integer, primary_key=True)
    exam_id = Column(Integer, ForeignKey("exam.id"), nullable=False)
    class_type = Column(String, nullable=True)  # 平行/实验
    class_num = Column(Integer, nullable=False)
    teacher_name = Column(String, nullable=True)
    subject_averages = Column(JSON, default=dict)  # {语文: 120.5, ...}
    total_averages = Column(JSON, default=dict)  # {主三门: 280.5, ...}

class AnalysisConfig(Base):
    """重点关注段位阈值（全局单行，id=1）。用户可在前端自定义，
    所有名次段计算与 AI 问答均读此配置。"""
    __tablename__ = "analysis_config"
    id = Column(Integer, primary_key=True)
    high_score_max = Column(Integer, nullable=False, default=80)   # 高分段：1 ~ high_score_max
    critical_min = Column(Integer, nullable=False, default=400)    # 临界段：critical_min ~ critical_max
    critical_max = Column(Integer, nullable=False, default=500)
    weak_min = Column(Integer, nullable=False, default=501)        # 薄弱段：rank >= weak_min（独立可设）
    updated_at = Column(DateTime, default=datetime.utcnow)


# ────────────────────────────── 作业跟踪 ──────────────────────────────
# 由原独立 Flask 应用「作业跟踪」合并而来。成绩库原本无花名册（学生从
# SubjectScore 派生），ClassRoster 补齐作业侧需要的座号/性别/排除标记，
# 并以真实学号 student_id 作为作业记录的统一关联键。

class ClassRoster(Base):
    """班级花名册，作业模块的学生主体。student_id 用真实学号（与
    SubjectScore.student_id 同口径）。excluded=1 的学生记录仍保留，
    但缺交看板/排行默认不统计。"""
    __tablename__ = "class_roster"
    student_id = Column(String, primary_key=True)  # 真实学号，如 7250601
    name = Column(String, nullable=False)
    class_num = Column(Integer, nullable=True)
    seat_no = Column(Integer, nullable=True)        # 班内座号（原作业库 student_no）
    gender = Column(String, nullable=True)
    excluded = Column(Integer, nullable=False, default=0)

    __table_args__ = (
        Index("idx_roster_class", "class_num"),
        Index("idx_roster_name", "name"),
    )


class HomeworkRecord(Base):
    """缺交记录（对应原 records 表）。每行=某生某天某科欠交一次。
    remark 非空表示当天请假等情况，缺交看板默认过滤。"""
    __tablename__ = "homework_record"
    id = Column(Integer, primary_key=True)
    student_id = Column(String, ForeignKey("class_roster.student_id"), nullable=False)
    date = Column(String, nullable=False)  # YYYY-MM-DD
    subject = Column(String, nullable=False)
    content = Column(String, nullable=True)
    remark = Column(String, nullable=True)

    __table_args__ = (
        Index("idx_hw_student_date", "student_id", "date"),
        Index("idx_hw_date_subject", "date", "subject"),
    )


class SpecialRecord(Base):
    """特殊情况记录（对应原 special_records 表）：请假/迟到/早退等。"""
    __tablename__ = "special_record"
    id = Column(Integer, primary_key=True)
    student_id = Column(String, ForeignKey("class_roster.student_id"), nullable=False)
    date = Column(String, nullable=False)  # YYYY-MM-DD
    type = Column(String, nullable=False)
    note = Column(String, nullable=True)

    __table_args__ = (
        Index("idx_special_student_date", "student_id", "date"),
    )


class HomeworkSetting(Base):
    """作业模块键值配置（学期起止 semester_start / semester_end /
    semester_name）。对应原 settings 表。"""
    __tablename__ = "homework_setting"
    key = Column(String, primary_key=True)
    value = Column(String, nullable=True)


# ────────────────────────────── 学生成长 / 谈话档案 ──────────────────────────────

class StudentNote(Base):
    """班主任记录的谈话 / 观察 / 家访 / 家长沟通 / 奖惩等档案条目。
    仅本地存储；AI 对话可按需读取以辅助起草谈话提纲、家长沟通稿。"""
    __tablename__ = "student_note"
    id = Column(Integer, primary_key=True)
    student_id = Column(String, nullable=False)  # 真实学号
    date = Column(String, nullable=False)        # YYYY-MM-DD
    category = Column(String, nullable=False)    # 谈话/观察/家访/家长沟通/奖惩/其他
    content = Column(String, nullable=False)
    follow_up = Column(String, nullable=True)    # 跟进事项，可空
    follow_up_done = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("idx_note_student", "student_id"),
        Index("idx_note_date", "date"),
    )


Base.metadata.create_all(bind=engine)
