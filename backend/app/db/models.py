from sqlalchemy import create_engine, Column, Integer, String, Float, JSON, DateTime, ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from datetime import datetime
import os

EXAM_TRACKER_DIR = os.path.expanduser("~/.exam-tracker")
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

Base.metadata.create_all(bind=engine)
