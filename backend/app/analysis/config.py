# 阈值配置（与metric-definitions.md保持同步）
PROGRESS_RANK_THRESHOLD = 80
VOLATILITY_RANK_THRESHOLD = 120
SUBJECT_PCT_THRESHOLD = 0.10

# 名次段定义（基于学籍排名）
HIGH_SCORE_RANGE = (1, 80)
CRITICAL_RANGE = (400, 500)
WEAK_RANGE = (501, 999999)

# 偏科阈值
SUBJECT_WEAKNESS_PCT_DIFF = 0.20

# 趋势标签
TREND_LABELS = {
    "stable_excellent": "稳定优秀",
    "significant_progress": "明显进步",
    "significant_regression": "明显退步",
    "volatile": "波动较大",
    "normal": "正常波动",
}