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

        
        const [feedbacks] = await pool.query(
            `SELECT e.user_id, DATE_FORMAT(e.date, '%Y-%m-%d') AS date, 
                    em.feedback, em.joy, em.sadness, em.anger, em.anxiety, em.satisfaction  
             FROM Experiences e  
             JOIN Emotions em ON e.experience_id = em.experience_id  
             WHERE e.user_id = ?
             ORDER BY e.date ${orderBy}`, 
            [parsedUserId]
        );

    

        if (feedbacks.length === 0) {
            console.warn("해당 사용자의 피드백이 없습니다.");
            return res.json({ success: false, message: "해당 사용자의 피드백이 없습니다." });
        }

        // summary 필드 추가 (가장 높은 감정값에 따라 요약)
        const summarizedFeedbacks = feedbacks.map(fb => {
            const emotions = {
                "좋은 하루였네요!": fb.joy,
                "슬픈 하루였네요": fb.sadness,
                "화나는 하루였네요": fb.anger,
                "불안한 하루였네요": fb.anxiety,
                "만족스러운 하루였네요": fb.satisfaction
            };

            // 감정값이 0이 아닌 것들 중 가장 높은 감정 찾기
            let maxEmotion = Object.entries(emotions)
                .filter(([_, value]) => value > 0)  // 0이 아닌 값만 필터링
                .sort((a, b) => b[1] - a[1]);  // 값 기준으로 내림차순 정렬

            // 감정을 표현할 수 없으면 기본 메시지 출력
            const summary = maxEmotion.length > 0 ? maxEmotion[0][0] : "오늘 하루를 표현할 수 있는 감정이 없어요";

            return {
                user_id: fb.user_id,
                date: fb.date,
                feedback: fb.feedback,
                summary
            };
        });

        res.json({
            success: true,
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

