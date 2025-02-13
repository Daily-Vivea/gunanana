const pool = require("../../config/db3.js");
const asyncHandler = require("../middlewares/asyncHandler.js");
const errorMiddleware = require("../middlewares/errorMiddleware.js");


// 한국 시간으로 변경
const koreanDate = (date) => {
  const koreanDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));
  koreanDate.setHours(0, 0, 0, 0);
  return koreanDate;
};

// 목표 생성
exports.setGoal = async (req, res, next) => {
  try {
    const { id } = req.params;

    const userId = parseInt(id);
    if (isNaN(userId)) {
      return res.status(400).json({ message: "잘못된 입력입니다." });
    }

    const [[user]] = await pool.query("SELECT * FROM Users WHERE user_id = ?", [userId]);

    if (!user) {
      return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
    }

    // is_Temporary는 임시 저장인지 저장인지 구분
    // 임시저장이면 true, 저장이면 false
    const { title, content, interval_weeks, interval_times, start_date, end_date, isTemporary } = req.body;

    // 필수 데이터 확인
    if (!title || !content || !interval_weeks || !interval_times || !start_date || !end_date) {
      return res.status(400).json({ message: '입력 하지 않은 필드가 있습니다.' });
    }

    // 한국 날짜 변경
    const today = koreanDate(new Date()); 
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);

    // 날짜 조건 확인
    if (endDate < startDate) {
      return res.status(400).json({ message: '종료 날짜는 시작 날짜 이후여야 합니다.' });
    }

    // 디폴트는 'SAVED', 시작 날짜가 과거거나 오늘이면 'IN_PROGRESS' 상태
    // 임시 저장이면, 이전 status에 관계 없이 'TEMP'
    let goalStatus = 'SAVED';
    if (startDate <= today) {
      goalStatus = 'IN_PROGRESS';
    }
    if (isTemporary) {
      goalStatus = 'TEMP';
    }

    // 목표 생성
    const [result] = await pool.query(
      `INSERT INTO Goals (user_id, experience_id, title, content, interval_weeks, interval_times, start_date, end_date, status, is_saved, progress, ai_recommended) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, null, title, content, interval_weeks || 0, interval_times || 0, startDate, endDate, goalStatus, true, 0, false]
    );

    const goalId = result.insertId;

    res.status(201).send({ message: ' 목표 생성 완료', goal_id: goalId });
  } catch (error) {
    next(error);
  }
};


// 또래 목표 추천
exports.friendGoal = async (req, res, next) => {
  try {
    const { id } = req.params;

    const userId = parseInt(id);
    if (isNaN(userId)) {
      return res.status(400).json({ message: "잘못된 입력입니다." });
    }

    // 나이 조회
    const [[user]] = await pool.query("SELECT age FROM Users WHERE user_id = ?", [userId]);

    if (!user) {
      return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
    }  

    if (user.age === null) {
      return res.status(400).json({ message: "또래 목표 추천을 할 수 없습니다." });
    }

    // user 나이 기준으로 +,- 5살인 사람
    const userAge = user.age;
    const minAge = userAge - 5; 
    const maxAge = userAge + 5; 

    // 또래 유저들의 목표 중 랜덤 5개 가져오기
    const [goals] = await pool.query(
      `SELECT g.title, g.content, u.name  FROM Goals g JOIN Users u ON g.user_id = u.user_id
       WHERE u.age BETWEEN ? AND ?  AND u.user_id != ?  AND g.is_saved = true
       ORDER BY RAND() 
       LIMIT 5`,
      [minAge, maxAge, userId]
    );

    // 유저 이름 변경
    const changeName = goals.map((goal) => {
      const maskedName = goal.name.charAt(0) + "ㅇㅇ";
      return {
        user: maskedName,
        title: goal.title,
        content: goal.content,
      };
    });

    res.status(200).json(changeName);
  } catch (error) {
    next(error);
  }
};


// 목표 수정
exports.updateGoal = async (req, res, next) => {
  try {
    const { id } = req.params;

    const goalId = parseInt(id);
    if (isNaN(goalId)) {
      return res.status(400).json({ message: "잘못된 입력입니다." });
    }

    const [[goal]] = await pool.query("SELECT * FROM Goals WHERE goal_id = ?", [goalId]);

    if (!goal) {
      return res.status(404).json({ message: "목표 데이터를 찾을 수 없습니다." });
    }  

    const { title, content, interval_weeks, interval_times, start_date, end_date, isTemporary } = req.body;

    const today = koreanDate(new Date()); 
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);

    if (endDate < startDate) {
      return res.status(400).json({ message: "종료 날짜는 시작 날짜 이후여야 합니다." });
    }

    // 기본 상태는 기존 값
    let goalStatus = goal.status;

    if (startDate <= today) {
      goalStatus = "IN_PROGRESS";
    } else {
      goalStatus = "SAVED";
    }

    if (isTemporary) {
      goalStatus = "TEMP";
    }

    // 목표 수정
    await pool.query(
      `UPDATE Goals 
       SET title = ?, content = ?, interval_weeks = ?, interval_times = ?, start_date = ?, end_date = ?, status = ?
       WHERE goal_id = ?`,
      [title, content, interval_weeks || 0, interval_times || 0, startDate, endDate, goalStatus, goalId]
    );

    // 진행률 계산
    // 수행하는 총 기간(주 단위)
    const total_weeks = Math.ceil((endDate - startDate) / (7 * 24 * 60 * 60 * 1000));

    // 수행해야 하는 총 횟수
    const total_times = Math.ceil((total_weeks / interval_weeks) * interval_times);

    // 현재까지 수행한 횟수 조회
    const [completedPeriods] = await pool.query(
      `SELECT 
          FLOOR((week - 1) / ?) + 1 AS period, 
          LEAST(COUNT(week), ?) AS completed_times
       FROM GoalRecord 
       WHERE goal_id = ? 
       GROUP BY period`,
      [interval_weeks, interval_times, goalId]
    );

    // 수행한 총 횟수
    let completed_times = 0;
    completedPeriods.forEach(row => {
      completed_times += row.completed_times;
    });

    // 진행률 계산
    let progress = Math.round((completed_times / total_times) * 100);
    progress = Math.min(progress, 100);

    await pool.query("UPDATE Goals SET progress = ? WHERE goal_id = ?", [progress, goalId]);

    res.status(200).send({ message: ' 목표 수정 완료' });
  } catch (error) {
    next(error);
  }
};

// 목표 삭제
exports.deleteGoal = async (req, res, next) => {
  try {
    const { id } = req.params;

    const goalId = parseInt(id);
    if (isNaN(goalId)) {
      return res.status(400).json({ message: "잘못된 입력입니다." });
    }

    const [[goal]] = await pool.query("SELECT * FROM Goals WHERE goal_id = ?", [goalId]);

    if (!goal) {
      return res.status(404).json({ message: "목표 데이터를 찾을 수 없습니다." });
    }  

    // 목표 삭제
    await pool.query("DELETE FROM Goals WHERE goal_id = ?", [goalId]);

    res.status(200).send({ message: "목표가 성공적으로 삭제되었습니다." });
  } catch (error) {
    next(error); 
  }
};
