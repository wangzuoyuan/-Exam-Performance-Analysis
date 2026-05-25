from fastapi import APIRouter, UploadFile, File
from fastapi.responses import JSONResponse
from typing import List
import os
import hashlib

router = APIRouter(tags=["ingest"])

EXAM_TRACKER_DIR = os.path.expanduser("~/.exam-tracker")

def save_upload_with_content(filename: str, content: bytes) -> str:
    os.makedirs(f"{EXAM_TRACKER_DIR}/raw", exist_ok=True)
    file_path = f"{EXAM_TRACKER_DIR}/raw/{filename}"
    with open(file_path, "wb") as f:
        f.write(content)
    return file_path

def compute_hash(content: bytes) -> str:
    return hashlib.md5(content).hexdigest()

def detect_class_from_students(students: list) -> int:
    """从学生列表众数统计检测班级号"""
    class_counts = {}
    for s in students:
        cls = s.get("class_num") or s.get("class")
        if cls:
            class_counts[cls] = class_counts.get(cls, 0) + 1
    if class_counts:
        return max(class_counts, key=class_counts.get)
    return 6  # 默认6班

def get_or_create_exam(db, parsed: dict, grade: int, file_path: str):
    from app.db.models import Exam

    exam = db.query(Exam).filter(
        Exam.grade == grade,
        Exam.semester == (parsed["semester"] or "下"),
        Exam.exam_date == parsed["sort_key"],
        Exam.exam_type == (parsed["exam_type"] or "月考"),
    ).first()
    if not exam:
        exam = Exam(
            name=parsed["canonical_name"],
            grade=grade,
            semester=parsed["semester"] or "下",
            exam_date=parsed["sort_key"],
            exam_type=parsed["exam_type"] or "月考",
            source_files=[file_path],
        )
        db.add(exam)
        db.flush()
    else:
        if exam.name != parsed["canonical_name"]:
            exam.name = parsed["canonical_name"]
        if file_path not in (exam.source_files or []):
            exam.source_files = (exam.source_files or []) + [file_path]
    return exam

@router.post("/uploads")
async def upload_files(files: List[UploadFile] = File(...)):
    """上传文件并解析 - Step 3 + Step 4 隐式初始化"""
    from app.db.models import SessionLocal, Upload, SubjectScore, TotalScore
    from app.ingest.filename_parser import parse_filename

    results = []
    detected_class = None
    detected_grade = None

    for file in files:
        content = await file.read()
        file_hash = compute_hash(content)
        file_path = save_upload_with_content(file.filename, content)

        # 解析文件名
        parsed = parse_filename(file.filename)
        grade = parsed.get("grade") or 1

        filename = file.filename or "upload"
        filename_lower = filename.lower()

        if filename_lower.endswith('.xlsx'):
            try:
                # 根据年级选择解析器
                if grade == 1:
                    from app.ingest.excel_parser import parse_excel_grade1
                    result = parse_excel_grade1(file_path)
                else:
                    from app.ingest.excel_parser import parse_excel_grade23
                    result = parse_excel_grade23(file_path, grade)

                kind = result.get("kind")
                parsed_ok = kind in {"student_scores", "class_averages"}

                # 记录上传
                db = SessionLocal()
                upload_record = Upload(
                    file_path=file_path,
                    file_hash=file_hash,
                    kind=kind or "unknown",
                    mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    parsed_ok=1 if parsed_ok else 0,
                    parse_log=result if not parsed_ok else None,
                )
                db.add(upload_record)

                if kind == "student_scores":
                    students = result.get("students", [])
                    subject_scores = result.get("subject_scores", [])
                    total_scores = result.get("total_scores", [])

                    # 检测班级
                    detected_class = detect_class_from_students(students)
                    detected_grade = grade

                    # 创建/获取考试记录
                    exam = get_or_create_exam(db, parsed, grade, file_path)

                    upload_record.exam_id = exam.id

                    # 写入学生分数
                    for ss in subject_scores:
                        score = SubjectScore(
                            exam_id=exam.id,
                            student_id=ss["student_id"],
                            class_num=ss.get("class_num"),
                            xueji=ss.get("xueji"),
                            name=ss.get("name"),
                            subject=ss["subject"],
                            raw_score=ss.get("raw_score"),
                            grade_score=ss.get("grade_score"),
                            grade_percentile=ss.get("grade_percentile"),
                        )
                        db.add(score)

                    # 写入总分
                    for ts in total_scores:
                        total = TotalScore(
                            exam_id=exam.id,
                            student_id=ts["student_id"],
                            total_type=ts["total_type"],
                            total_score=ts.get("total_score"),
                            grade_percentile=ts.get("grade_percentile"),
                            xueji_rank=ts.get("xueji_rank"),
                            grade_rank=ts.get("grade_rank"),
                        )
                        db.add(total)

                    db.commit()
                    db.close()

                    results.append({
                        "filename": file.filename,
                        "parsed_ok": True,
                        "message": f"解析成功，检测到{len(students)}名学生",
                        "kind": "student_scores",
                        "grade": grade,
                    })

                elif kind == "class_averages":
                    class_avgs = result.get("class_averages", [])

                    # 创建/获取考试
                    exam = get_or_create_exam(db, parsed, grade, file_path)

                    upload_record.exam_id = exam.id

                    from app.db.models import ClassAverage
                    for ca in class_avgs:
                        avg = ClassAverage(
                            exam_id=exam.id,
                            class_type=ca.get("class_type"),
                            class_num=ca.get("class_num"),
                            teacher_name=ca.get("teacher_name"),
                            subject_averages=ca.get("subject_averages", {}),
                            total_averages=ca.get("total_averages", {}),
                        )
                        db.add(avg)

                    db.commit()
                    db.close()

                    results.append({
                        "filename": file.filename,
                        "parsed_ok": True,
                        "message": f"解析成功，检测到{len(class_avgs)}个班级均分",
                        "kind": "class_averages",
                    })

                else:
                    db.commit()
                    db.close()
                    results.append({
                        "filename": file.filename,
                        "parsed_ok": False,
                        "message": f"未知文件类型: {kind}",
                    })

            except Exception as e:
                db = SessionLocal()
                db.rollback()
                db.close()
                results.append({
                    "filename": file.filename,
                    "parsed_ok": False,
                    "message": str(e),
                })

        else:
            results.append({
                "filename": file.filename,
                "parsed_ok": False,
                "message": "暂不支持此文件类型，请上传学生成绩明细表或班级均分表 Excel（.xlsx）",
            })

    response = {"results": results}
    if detected_class:
        response["detected_class"] = detected_class
        response["detected_grade"] = detected_grade or 1

    return JSONResponse(response)


@router.get("/uploads")
async def list_uploads():
    """列出已上传文件"""
    from app.db.models import SessionLocal, Upload
    db = SessionLocal()
    uploads = db.query(Upload).order_by(Upload.uploaded_at.desc()).limit(50).all()
    db.close()
    return {
        "uploads": [{
            "id": u.id,
            "filename": u.file_path.split("/")[-1] if u.file_path else "",
            "kind": u.kind,
            "mime": u.mime,
            "parsed_ok": bool(u.parsed_ok),
            "exam_id": u.exam_id,
            "uploaded_at": u.uploaded_at.isoformat() if u.uploaded_at else None,
        } for u in uploads]
    }
