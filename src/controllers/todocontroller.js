const express = require("express");
const pool = require('../../config/db.js');

const getUserGoals = async(req, res) => {
  try {
    const userId = req.params.userId;
    const status = req.query.status || "IN_PROGRESS";

    pool.query("SELECT * FROM Goals WHERE user_id = ? AND status = ?", [userId, status], (err, result) => {
      if (err) {
        console.error("❌ MySQL 에러:", err);
        return res.status(504).send({ message: "DB 에러입니다." });
      }

      if (result.length === 0) {
        return res.status(404).send({ message: "사용자의 목표를 찾을 수 없습니다." });
      }

      const response = {
        goals: result.map((goal) => ({
          goalId: goal.goal_id,
          title: goal.title,
          content: goal.content,
          interval: { week: goal.interval_weeks, times: goal.interval_times },
          term: { start: goal.start_date, end: goal.end_date },
          progress: goal.progress,
          status: goal.status,
        })),
      };

      return res.status(200).json(response);
    });
  } catch (error) {
    console.error("❌ 서버 오류:", error);
    return res.status(500).send({ message: "서버 오류입니다." });
  }
};

const getGoalById = async(req, res) => {
  try {
    const userId = req.params.userId;
    const goalId = req.params.goalId;

    console.log("Received goalId:", goalId);  // goalId 값 출력

    pool.query("SELECT * FROM Goals WHERE goal_id = ?", [goalId], (err, result) => {
      if (err) {
        console.error("❌ MySQL 에러:", err);
        return res.status(504).send({ message: "DB 에러입니다." });
      }
      console.log("Query result:", result);
      if (result.length === 0) {
        return res.status(404).send({ message: "해당 목표가 존재하지 않습니다." });
      }

      const goal = result[0];

      if (goal.user_id !== parseInt(userId)) {
        return res.status(403).send({ message: "해당 목표 조회 권한이 없습니다." });
      }

      pool.query("SELECT * FROM GoalRecord WHERE goal_id = ? ORDER BY created_at ASC", [goalId], (err, records) => {
        if (err) {
          console.error("❌ MySQL 에러:", err);
          return res.status(504).send({ message: "DB 에러입니다." });
        }

        const recordRes = records.length > 0 
          ? records.map((record) => ({
              week: record.week,
              content: record.content,
              date: record.created_at,
            }))
          : [];

        const response = {
          goalId: goalId,
          date: goal.created_at,
          title: goal.title,
          interval: { week: goal.interval_weeks, times: goal.interval_times },
          term: { start: goal.start_date, end: goal.end_date },
          progress: goal.progress,
          progressRecord: recordRes,
        };

        return res.status(200).json(response);
      });
    });
  } catch (error) {
    console.error("API 오류 발생:", error);
    return res.status(500).send({ message: "서버 오류입니다." });
  }
};

const postGoalRecord = async(req, res) => {
  try {
    const goalId = req.params.goalId;
    const { week, content } = req.body;

    let totalTimes;
    let records;

    pool.query("INSERT INTO GoalRecord (goal_id, week, content) VALUES (?, ?, ?)", 
      [goalId, week, content], 
      (err, result) => {
        if (err) {
          console.error("❌ GoalRecord 삽입 오류:", err);
          return res.status(504).json({ message: "DB 삽입 오류입니다." });
        }
        console.log("✅ GoalRecord가 DB에 저장되었습니다.");

        pool.query("SELECT (interval_weeks * interval_times) AS intervalTimes, DATEDIFF(end_date,start_date) AS TimeDiff FROM Goals WHERE goal_id=?", 
          [goalId], 
          (err, result) => {
            if (err) {
              console.error("❌ Goals 조회 오류:", err);
              return res.status(504).json({ message: "DB 조회 오류입니다." });
            }
            if(result.length===0){
              return res.status(504).json({message: "DB 조회 오류입니다."});
            }
            const totalWeeks = Math.floor(result[0].TimeDiff/7);
            console.log("totalWeeks: ",totalWeeks);
            totalTimes = result[0].intervalTimes*totalWeeks;
            console.log('totalTimes: ', totalTimes);


            pool.query("SELECT COUNT(*) AS records FROM GoalRecord WHERE goal_id=?", 
              [goalId], 
              (err, result) => {
                if (err) {
                  console.error("❌ GoalRecord 개수 조회 오류:", err);
                  return res.status(504).json({ message: "DB 조회 오류입니다." });
                }
                records = result.length > 0 ? result[0].records ?? 0 : 0; // 기본값 0

                const progress = parseInt((records / totalTimes) * 100);
                pool.query("UPDATE Goals SET progress = ? WHERE goal_id = ?", 
                  [progress, goalId], 
                  (err, result) => {
                    if (err) {
                      console.error("❌ Goals 업데이트 오류:", err);
                      return res.status(504).json({ message: "DB 업데이트 오류입니다." });
                    }

                    return res.status(200).json({ message: "기록이 성공적으로 저장되었습니다.", progress: progress });
                  }
                );
              }
            );
          }
        );
      }
    );
  } catch (err) {
    console.error("❌ 서버 오류:", err);
    return res.status(500).json({ message: "서버 오류입니다." });
  }
};


module.exports = { getUserGoals, getGoalById, postGoalRecord };
