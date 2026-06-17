from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
import os

from starlette.responses import JSONResponse as _JSONResponse  # noqa: E402

app = FastAPI(title="成绩追踪 API", version="0.1.0")

# 生产同源（经反代）时无需 CORS；本地 dev 前端 3000 → 后端 8000 跨源需放行。
# 额外可用 CORS_ORIGINS（逗号分隔）显式追加来源。
_cors_origins = [
    o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=r"http://[\w.\-]+:3000",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 登录鉴权：内网免登录、外网（命中 PUBLIC_HOST）才要求会话。
from app.auth import COOKIE_NAME, auth_required_for, verify_token  # noqa: E402

_AUTH_ALLOWLIST = {"/api/login", "/api/logout", "/api/auth/status", "/api/health"}


@app.middleware("http")
async def require_login(request: Request, call_next):
    path = request.url.path
    if (
        request.method != "OPTIONS"
        and path.startswith("/api")
        and path not in _AUTH_ALLOWLIST
        and auth_required_for(request)
        and not verify_token(request.cookies.get(COOKIE_NAME, ""))
    ):
        return _JSONResponse({"detail": "需要登录"}, status_code=401)
    return await call_next(request)

from app.paths import DATA_DIR as EXAM_TRACKER_DIR
os.makedirs(EXAM_TRACKER_DIR, exist_ok=True)
os.makedirs(f"{EXAM_TRACKER_DIR}/raw", exist_ok=True)

@app.get("/api/health")
def health():
    return {"ok": True, "version": "0.1.0"}

@app.get("/")
def root():
    return {"message": "成绩追踪 API", "docs": "/docs"}

@app.get("/api/teacher")
def get_teacher():
    """获取班主任信息（延迟初始化）"""
    from app.db.models import SessionLocal, Teacher
    db = SessionLocal()
    teacher = db.query(Teacher).first()
    if not teacher:
        teacher = Teacher()
        db.add(teacher)
        db.commit()
        db.refresh(teacher)
    db.close()
    return {
        "id": teacher.id,
        "name": teacher.name,
        "target_class_high1": teacher.target_class_high1,
        "target_class_high2": teacher.target_class_high2,
        "target_class_high3": teacher.target_class_high3,
    }

@app.patch("/api/teacher")
async def update_teacher(request: Request):
    """更新班主任姓名"""
    from app.db.models import SessionLocal, Teacher
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=422, detail="invalid json")
    name = body.get("name", "").strip()
    db = SessionLocal()
    teacher = db.query(Teacher).first()
    if not teacher:
        teacher = Teacher()
        db.add(teacher)
    teacher.name = name or None
    db.commit()
    db.close()
    return {"ok": True, "name": name or None}

@app.post("/api/teacher/bind-class")
async def bind_class(request: Request, class_num: Optional[int] = None, grade: int = 1):
    """绑定班级（隐式初始化确认）"""
    from app.db.models import SessionLocal, Teacher

    if class_num is None:
        try:
            body = await request.json()
        except Exception:
            body = {}
        class_num = body.get("class_num")
        grade = body.get("grade", grade)

    if class_num is None:
        raise HTTPException(status_code=422, detail="class_num is required")

    class_num = int(class_num)
    grade = int(grade)
    db = SessionLocal()
    teacher = db.query(Teacher).first()
    if not teacher:
        teacher = Teacher()
        db.add(teacher)

    if grade == 1:
        teacher.target_class_high1 = class_num
    elif grade == 2:
        teacher.target_class_high2 = class_num
    elif grade == 3:
        teacher.target_class_high3 = class_num

    db.commit()
    db.close()
    return {"ok": True, "bound_class": class_num, "grade": grade}

# 路由模块导入
from app.db.models import Base, engine  # noqa
Base.metadata.create_all(bind=engine)

from app.ingest.router import router as ingest_router  # noqa
from app.analysis.router import router as analysis_router  # noqa
from app.chat.session import router as chat_router  # noqa
from app.homework.router import router as homework_router  # noqa
from app.notes.router import router as notes_router  # noqa
from app.backup.router import router as backup_router  # noqa
from app.auth_router import router as auth_router  # noqa

app.include_router(auth_router, prefix="/api")
app.include_router(ingest_router, prefix="/api")
app.include_router(analysis_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(homework_router, prefix="/api")
app.include_router(notes_router, prefix="/api")
app.include_router(backup_router, prefix="/api")
