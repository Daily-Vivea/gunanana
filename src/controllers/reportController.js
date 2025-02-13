const pool = require("../../config/db3.js");

exports.getReports = async (req, res) => {
    try {
        console.log("[GET] /reports 요청: userId =", req.params.userId);

        const { sort } = req.query;
        const parsedUserId = parseInt(req.params.userId, 10); // URL 경로에서 userId 받기

        if (!parsedUserId || isNaN(parsedUserId)) {
            console.error("잘못된 userId 입력:", req.params.userId);
            return res.status(400).json({ success: false, message: "잘못된 userId 입력입니다." });
        }

        // 기본 정렬 순서: 오래된 순 (`ASC`)
        let orderBy = "ASC";
        if (sort && sort.toLowerCase() === "desc") {
            orderBy = "DESC"; // 최신 날짜 (`DESC`) 정렬
        }

        // Experiences 테이블에서 feedback과 emotion 가져오기
        const [feedbacks] = await pool.query(
            `SELECT e.user_id, DATE_FORMAT(e.date, '%Y-%m-%d') AS date, 
                    e.feedback, COALESCE(e.emotion, NULL) AS emotion
             FROM Experiences e  
             WHERE e.user_id = ?
             ORDER BY e.date ${orderBy}`, 
            [parsedUserId]
        );

        if (feedbacks.length === 0) {
            console.warn("해당 사용자의 피드백이 없습니다.");
            return res.json({ success: false, message: "해당 사용자의 피드백이 없습니다." });
        }

        // summary & emotion 필드 변환
        const summarizedFeedbacks = feedbacks.map(fb => {
            let summary = null; // 기본값
            let emotionCategory = null; // 기본값

            if (fb.emotion === "우울했어요") {
                summary = "슬픈 하루였네요";
                emotionCategory = "bad";
            } else if (fb.emotion === "행복했어요") {
                summary = "행복한 하루였네요";
                emotionCategory = "happy";
            } else if (fb.emotion === "그저 그랬어요") {
                summary = "그저 그런 하루였네요";
                emotionCategory = "soso";
            }

            return {
                user_id: fb.user_id,
                date: fb.date,
                feedback: fb.feedback,  // NULL 값은 그대로 유지
                summary,
                emotion: emotionCategory // 기존 emotion 제거 후 변환된 값 사용
            };
        });

        res.json({
            userId: parsedUserId,
            feedbacks: summarizedFeedbacks
        });
    } catch (error) {
        console.error("MySQL 오류 발생:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};






exports.getReportDetails = async (req, res) => {
    try {
        console.log("[GET] /reports/detail 요청: userId =", req.params.userId);

        const parsedUserId = parseInt(req.params.userId, 10);

        if (!parsedUserId || isNaN(parsedUserId)) {
            console.error("잘못된 userId 입력:", req.params.userId);
            return res.status(400).json({ message: "잘못된 userId 입력입니다." });
        }

        // 현재 날짜 정보
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth(); // 0 (Jan) ~ 11 (Dec)
        const currentWeek = Math.ceil(today.getDate() / 7); // 이번 달의 몇 번째 주인지 계산

        // Reports 테이블에서 user_id 기준으로 period_type별 데이터 가져오기
        const [reports] = await pool.query(
            `SELECT period_type, start_date, goal_completion_rate, title FROM Reports WHERE user_id = ?`,
            [parsedUserId]
        );

        // Emotions 테이블에서 감정 데이터 가져오기
        const [emotions] = await pool.query(
            `SELECT e.date, em.joy, em.sadness, em.anger, em.anxiety, em.satisfaction  
             FROM Experiences e  
             JOIN Emotions em ON e.experience_id = em.experience_id  
             WHERE e.user_id = ?`,
            [parsedUserId]
        );

        let totalWeeklyProgress = 0, weeklyGoalCount = 0;
        let totalMonthlyProgress = 0, monthlyGoalCount = 0;

        let weeklyEmotions = { joy: 0, sadness: 0, anger: 0, anxiety: 0, satisfaction: 0 };
        let monthlyEmotions = { joy: 0, sadness: 0, anger: 0, anxiety: 0, satisfaction: 0 };

        let weeklyEmotionTotal = 0;
        let monthlyEmotionTotal = 0;

        let weeklyTitles = new Set(); // 중복 방지를 위한 Set
        let monthlyTitles = new Set(); // 중복 방지를 위한 Set

        // 진행률 & Title 계산 (주간 & 월간)
        reports.forEach(row => {
            const startDate = new Date(row.start_date);
            const reportYear = startDate.getFullYear();
            const reportMonth = startDate.getMonth();
            const reportWeek = Math.ceil(startDate.getDate() / 7); // 해당 월에서 몇 번째 주인지 계산

            const isThisWeek = (reportYear === currentYear && reportMonth === currentMonth && reportWeek === currentWeek);
            const isThisMonth = (reportYear === currentYear && reportMonth === currentMonth);

            if (row.period_type === "WEEKLY" && isThisWeek) {
                totalWeeklyProgress += row.goal_completion_rate;
                weeklyGoalCount++;
                weeklyTitles.add(row.title);
            }

            if (row.period_type === "MONTHLY" && isThisMonth) {
                totalMonthlyProgress += row.goal_completion_rate;
                monthlyGoalCount++;
                monthlyTitles.add(row.title);
            }
        });

        // 감정값 계산 (주간 & 월간)
        emotions.forEach(row => {
            const emotionDate = new Date(row.date);
            const emotionYear = emotionDate.getFullYear();
            const emotionMonth = emotionDate.getMonth();
            const emotionWeek = Math.ceil(emotionDate.getDate() / 7); // 해당 월에서 몇 번째 주인지 계산

            const isThisWeek = (emotionYear === currentYear && emotionMonth === currentMonth && emotionWeek === currentWeek);
            const isThisMonth = (emotionYear === currentYear && emotionMonth === currentMonth);

            if (isThisWeek) {
                weeklyEmotions.joy += row.joy;
                weeklyEmotions.sadness += row.sadness;
                weeklyEmotions.anger += row.anger;
                weeklyEmotions.anxiety += row.anxiety;
                weeklyEmotions.satisfaction += row.satisfaction;
                weeklyEmotionTotal += row.joy + row.sadness + row.anger + row.anxiety + row.satisfaction;
            }

            if (isThisMonth) {
                monthlyEmotions.joy += row.joy;
                monthlyEmotions.sadness += row.sadness;
                monthlyEmotions.anger += row.anger;
                monthlyEmotions.anxiety += row.anxiety;
                monthlyEmotions.satisfaction += row.satisfaction;
                monthlyEmotionTotal += row.joy + row.sadness + row.anger + row.anxiety + row.satisfaction;
            }
        });

        // 백분율 변환을 위한 공통 함수
        const calculatePercentage = (value, total) => {
            return total > 0 ? Math.round((value / total) * 100) : 0;
        };

        // 평균 진행률을 백분율로 변환
        const averageWeeklyProgress = weeklyGoalCount > 0 ? Math.round(totalWeeklyProgress / weeklyGoalCount) : 0;
        const averageMonthlyProgress = monthlyGoalCount > 0 ? Math.round(totalMonthlyProgress / monthlyGoalCount) : 0;

        // 감정 백분율 변환
        const weeklyEmotionPercentages = {
            joy: calculatePercentage(weeklyEmotions.joy, weeklyEmotionTotal),
            sadness: calculatePercentage(weeklyEmotions.sadness, weeklyEmotionTotal),
            anger: calculatePercentage(weeklyEmotions.anger, weeklyEmotionTotal),
            anxiety: calculatePercentage(weeklyEmotions.anxiety, weeklyEmotionTotal),
            satisfaction: calculatePercentage(weeklyEmotions.satisfaction, weeklyEmotionTotal),
        };

        const monthlyEmotionPercentages = {
            joy: calculatePercentage(monthlyEmotions.joy, monthlyEmotionTotal),
            sadness: calculatePercentage(monthlyEmotions.sadness, monthlyEmotionTotal),
            anger: calculatePercentage(monthlyEmotions.anger, monthlyEmotionTotal),
            anxiety: calculatePercentage(monthlyEmotions.anxiety, monthlyEmotionTotal),
            satisfaction: calculatePercentage(monthlyEmotions.satisfaction, monthlyEmotionTotal),
        };

        // 최종 JSON 응답 반환 (요청한 데이터만 출력)
        res.json({
            average_weekly_progress: averageWeeklyProgress,
            average_monthly_progress: averageMonthlyProgress,
            weekly_titles: Array.from(weeklyTitles), // 중복 제거 후 배열로 변환
            monthly_titles: Array.from(monthlyTitles), // 중복 제거 후 배열로 변환
            weekly_emotions: weeklyEmotionPercentages,
            monthly_emotions: monthlyEmotionPercentages
        });
    } catch (error) {
        console.error("MySQL 오류 발생:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};
