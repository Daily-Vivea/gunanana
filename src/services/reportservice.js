const pool = require("../../config/db3.js");  // ✅ 기존 '../utils/db'에서 db3.js로 변경

exports.getUserReports = async (userId) => {
    try {
        const [rows] = await pool.promise().query(
            `SELECT r.report_id, r.period_type, r.start_date, r.end_date, r.goal_completion_rate,
                    e.emotion_name, e.emotion_percentage
             FROM Reports r
             LEFT JOIN ReportEmotion e ON r.report_id = e.report_id
             WHERE r.user_id = ?
             ORDER BY r.end_date DESC`,
            [userId]
        );
        return rows;
    } catch (error) {
        console.error("Error fetching reports:", error);
        throw error;
    }
};

