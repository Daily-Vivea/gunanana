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

        
        const [goals] = await pool.query(
            `SELECT start_date, progress FROM Goals WHERE user_id = ?`,  // start_date, progress 조회
            [parsedUserId]
        );

        const [emotions] = await pool.query(
            `SELECT e.date, em.joy, em.sadness, em.anger, em.anxiety, em.satisfaction  
             FROM Experiences e  
             JOIN Emotions em ON e.experience_id = em.experience_id  
             WHERE e.user_id = ?`,
            [parsedUserId]
        );

       

        if (goals.length === 0 && emotions.length === 0) {
            console.warn("해당 사용자의 데이터가 없습니다.");
            return res.json({ message: "해당 사용자의 데이터가 없습니다." });
        }

        // 현재 날짜 정보
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth(); // 0 (Jan) ~ 11 (Dec)

        let totalWeeklyProgress = 0, weeklyGoalCount = 0;
        let totalMonthlyProgress = 0, monthlyGoalCount = 0;

        let weeklyEmotions = { joy: 0, sadness: 0, anger: 0, anxiety: 0, satisfaction: 0 };
        let monthlyEmotions = { joy: 0, sadness: 0, anger: 0, anxiety: 0, satisfaction: 0 };

        let weeklyEmotionTotal = 0;
        let monthlyEmotionTotal = 0;

        // 진행률 계산
        goals.forEach(row => {
            const startDate = new Date(row.start_date);
            const weeksElapsed = Math.floor((today - startDate) / (7 * 24 * 60 * 60 * 1000)) + 1;
            const isThisWeek = weeksElapsed === 1;
            const isThisMonth = (startDate.getFullYear() === currentYear && startDate.getMonth() === currentMonth);

            if (isThisWeek) {
                totalWeeklyProgress += row.progress;
                weeklyGoalCount++;
            }
            if (isThisMonth) {
                totalMonthlyProgress += row.progress;
                monthlyGoalCount++;
            }
        });

        // 감정값 계산
        emotions.forEach(row => {
            const emotionDate = new Date(row.date);
            const weeksElapsed = Math.floor((today - emotionDate) / (7 * 24 * 60 * 60 * 1000)) + 1;
            const isThisWeek = weeksElapsed === 1;
            const isThisMonth = (emotionDate.getFullYear() === currentYear && emotionDate.getMonth() === currentMonth);

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

        // 평균 진행률 계산 (소수점 없이 반올림)
        const averageWeeklyProgress = weeklyGoalCount > 0 ? Math.round(totalWeeklyProgress / weeklyGoalCount) : 0;
        const averageMonthlyProgress = monthlyGoalCount > 0 ? Math.round(totalMonthlyProgress / monthlyGoalCount) : 0;

        // 감정 백분율 계산
        const calculatePercentage = (emotionCount, totalCount) => {
            return totalCount > 0 ? Math.round((emotionCount / totalCount) * 100) : 0;
        };

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

        //하나의 API로 통합된 데이터 반환
        res.json({
            total_weekly_progress: totalWeeklyProgress,
            weekly_goal_count: weeklyGoalCount,
            average_weekly_progress: averageWeeklyProgress,
            total_monthly_progress: totalMonthlyProgress,
            monthly_goal_count: monthlyGoalCount,
            average_monthly_progress: averageMonthlyProgress,
            weekly_emotions: weeklyEmotionPercentages,
            monthly_emotions: monthlyEmotionPercentages
        });
    } catch (error) {
        console.error("MySQL 오류 발생:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

