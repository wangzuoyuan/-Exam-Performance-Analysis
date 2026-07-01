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
    grade = Column(Integer, nullable=True)  # 该名册行所属年级 1/2/3（换届后高一/高二名册并存）
    seat_no = Column(Integer, nullable=True)        # 班内座号（原作业库 student_no）
    gender = Column(String, nullable=True)
    excluded = Column(Integer, nullable=False, default=0)

    __table_args__ = (
        Index("idx_roster_class", "class_num"),
        Index("idx_roster_name", "name"),
        Index("idx_roster_grade", "grade"),
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


# ────────────────────────────── 学生身份与历史档案（班主任版） ──────────────────────────────
# StudentIdentity 是「同一个人」的唯一聚合根，跨年级/跨班用；StudentAlias 把
# 每学年的真实学号挂回 identity（一人多号，grade 区分学年）。ImportedHistory
# 存班主任手工导入的历史分数，与全年级排名/班均/段位计算【完全隔离】——它只
# 用于跨学年个人画像展示，绝不参与任何聚合统计。

class StudentIdentity(Base):
    """「同一个学生」的聚合根。display_name/gender 是班主任人工确认的
    规范化展示名（与 SubjectScore.name 的各班录入口径解耦）。ext_key 预留
    身份证/全国学籍号，默认不采集。"""
    __tablename__ = "student_identity"
    id = Column(Integer, primary_key=True)
    display_name = Column(String, nullable=True)
    gender = Column(String, nullable=True)
    ext_key = Column(String, nullable=True, index=True)  # 预留 身份证/全国学籍号，默认不用
    note = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class StudentAlias(Base):
    """把某学年某班的真实学号 student_id 挂回某个 StudentIdentity。
    一人可有多条（不同年级学号不同），UNIQUE(student_id) 保证一个学号只认
    一个身份。link_source 记录这条挂接是怎么建立的。"""
    __tablename__ = "student_alias"
    id = Column(Integer, primary_key=True)
    identity_id = Column(Integer, ForeignKey("student_identity.id"), nullable=False)
    student_id = Column(String, nullable=False)
    grade = Column(Integer, nullable=True)
    link_source = Column(String, nullable=False, default="name_confirmed")  # name_confirmed/crosswalk/manual/ext_key
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("student_id", name="uq_alias_student"),
        Index("idx_alias_identity", "identity_id"),
    )


class ImportedHistory(Base):
    """班主任手工导入的历史成绩（从旧班主任本子/Excel 搬来的过往考试）。
    与 SubjectScore/TotalScore 完全隔离——不参与全年级排名、班均、段位
    任何聚合计算，仅用于跨学年个人画像展示。"""
    __tablename__ = "imported_history"
    id = Column(Integer, primary_key=True)
    identity_id = Column(Integer, ForeignKey("student_identity.id"), nullable=False)
    grade = Column(Integer, nullable=False, default=1)
    exam_label = Column(String, nullable=True)
    exam_seq = Column(Integer, nullable=True)
    kind = Column(String, nullable=False)  # subject/total
    subject = Column(String, nullable=True)
    total_type = Column(String, nullable=True)
    raw_score = Column(Float, nullable=True)
    grade_score = Column(Float, nullable=True)
    grade_percentile = Column(Float, nullable=True)
    xueji_rank = Column(Integer, nullable=True)

    __table_args__ = (
        Index("idx_imp_identity", "identity_id"),
    )


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
