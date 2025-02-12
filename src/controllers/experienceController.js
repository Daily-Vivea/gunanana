const express = require("express");
const pool = require("../../config/db3.js");
const { generateFeedback } = require('../services/aiFeedback.js');
const { analyzeAiEmotionsAndFeedback } = require('../services/aiEmotion.js');
const { generateGrowth } = require('../services/aiGrowth.js');
const { getFeedbackData } = require('../services/feedbackService.js');
const { generateGoals } = require('../services/aiGoals.js');
const { getLearningRecommendations } = require('../services/aiLearnings.js');
const asyncHandler = require("../middlewares/asyncHandler.js");
const errorMiddleware = require("../middlewares/errorMiddleware.js");


// 첫 화면, 날짜 선택
exports.saveDate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { date } = req.body;

    const userId = parseInt(id);
    if (isNaN(userId)) {
      return res.status(400).json({ message: "잘못된 입력입니다." });
    }

    const [[user]] = await pool.query("SELECT user_id FROM Users WHERE user_id = ?", [userId]);

    if (!user) {
      return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
    }

    // 디폴트는 현재 날짜
    let koreanDate;
    if (!date || date.trim() === "") {
      const now = new Date();
      const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const year = kstNow.getUTCFullYear();
      const month = String(kstNow.getUTCMonth() + 1).padStart(2, "0");
      const day = String(kstNow.getUTCDate()).padStart(2, "0"); 

      koreanDate = `${year}-${month}-${day}`; 
    } else {
      koreanDate = new Date(date); 
      koreanDate.setHours(0, 0, 0, 0); 
    }

    const [result] = await pool.query("INSERT INTO Experiences (user_id, date) VALUES (?, ?)", [userId, koreanDate]);

    const experienceId = result.insertId;

    res.status(201).send({ message: '경험 기록 생성 완료', experience_id: experienceId });
  } catch (error) {
     next(error);
  }
};


// 두 번째 화면, 경험 기록 및 감정 선택
exports.createExperience = async (req, res, next) => {
  try {
    // content에 "" 가 있으면 오류 발생
    const { id } = req.params;
    let { content, emotion } = req.body;

    const experienceId = parseInt(id);
    if (isNaN(experienceId)) {
      return res.status(400).json({ message: "잘못된 입력입니다." });
    }

    if (!content || !emotion) {
      return res.status(400).json({ message: "입력 하지 않은 필드가 있습니다." });
    }

    content = content.replace(/"/g, '\\"');
    const emotionMap = {
      "행복했어요": "행복했어요",
      "우울했어요": "우울했어요",
      "그저 그랬어요": "그저_그랬어요" 
    };
    
    const mappedEmotion = emotionMap[emotion];
    
    if (!mappedEmotion) {
      return res.status(400).json({ message: "유효하지 않은 감정 값입니다."});
    }

    const [[findExperience]] = await pool.query( "SELECT user_id, date FROM Experiences WHERE experience_id = ?", [experienceId]);
    
    if (!findExperience) {
      return res.status(404).json({ message: "경험 데이터를 찾을 수 없습니다." });
    }

    await pool.query("UPDATE Experiences SET content = ?, emotion = ? WHERE experience_id = ?",  [content, mappedEmotion, experienceId] );

    res.status(200).send({ message: '경험 기록 및 감정 선택 완료' });
  } catch (error) {
     next(error);
  }
};

// 세 번째 화면, 경험 피드백 ~ 추천 학습 ai 분석 
exports.analyzeExperience = async (req, res, next) => {
  try {
    const { id } = req.params;

    const experienceId = parseInt(id);
    if (isNaN(experienceId)) {
      return res.status(400).json({ message: "잘못된 입력입니다." });
    }

    const [[experience]] = await pool.query("SELECT * FROM Experiences WHERE experience_id = ?", [experienceId]);

    if (!experience) {
        return res.status(404).json({ message: "경험 데이터를 찾을 수 없습니다." });
    }

    // AI 분석
    const { keywords, title, feedback } = await generateFeedback(experience.content);
    const { emotions, feedback: emotionFeedback } = await analyzeAiEmotionsAndFeedback(experience.content);
    const growth = await generateGrowth(experience.content);
    const { growth_points, growth_potential } = growth;

    await pool.query("UPDATE Experiences SET title = ?, feedback = ?, keywords = ? WHERE experience_id = ?", [title, feedback, JSON.stringify(keywords), experienceId]);

    await pool.query(`
      INSERT INTO Emotions (experience_id, joy, sadness, anger, anxiety, satisfaction, feedback)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE joy=VALUES(joy), sadness=VALUES(sadness), anger=VALUES(anger), 
      anxiety=VALUES(anxiety), satisfaction=VALUES(satisfaction), feedback=VALUES(feedback)`,
      [experienceId, emotions.joy, emotions.sadness, emotions.anger, emotions.anxiety, emotions.satisfaction, emotionFeedback]
    );    

    await pool.query(`INSERT INTO Growths (experience_id, point, potential) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE point=VALUES(point), potential=VALUES(potential)`,
      [experienceId, JSON.stringify(growth_points), growth_potential]
    );

    // 추천 목표 & 학습 생성
    const { goals, learnings } = await generateGoals(experience.content);

    await Promise.all(goals.map(async (goal) => {
      return pool.query(
        `INSERT INTO Goals (user_id, experience_id, title, content, interval_weeks, interval_times, start_date, end_date, progress, status, ai_recommended, is_saved) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'IN_PROGRESS', true, false)`,
        [experience.user_id, experienceId, goal.title, goal.content, goal.interval_weeks, goal.interval_times, goal.start_date, goal.end_date]
      );
    }));

    const learningTitles = learnings.map((l) => l.title);
    const learningResults = await getLearningRecommendations(learningTitles);

    await Promise.all(learningResults.map(async (learning) => {
      return pool.query(
        `INSERT INTO Learnings (experience_id, title, url, source) 
         VALUES (?, ?, ?, ?)`,
        [experienceId, learning.title, learning.url, learning.source]
      );
    }));

    res.status(200).send({ message: '경험 분석 및 저장 완료' });
  } catch (error) {
    console.log("AI 에러입니다: ",error);
    next(error);
  }
};


// 4번째 화면, 저장된 피드백 불러오기
exports.getFeedback = async (req, res, next) => {
  try {
    const { id } = req.params;

    const experienceId = parseInt(id);
    if (isNaN(experienceId)) {
      return res.status(400).json({ message: "잘못된 입력입니다." });
    }

    const [[experience]] = await pool.query("SELECT * FROM Experiences WHERE experience_id = ?", [experienceId]);

    if (!experience) {
      return res.status(404).json({ message: "경험 데이터를 찾을 수 없습니다." });
    }

    const feedbackData = await getFeedbackData(experienceId);

    if (!feedbackData) {
      return res.status(404).json({ message: "피드백 데이터를 찾을 수 없습니다." });
    }

    res.json(feedbackData);
  } catch (error) {
    next(error);
  }
};


// 5번째 화면, 추천 목표와 추천 학습 불러오기
exports.getRecommendation = async (req, res, next) => {
  try {
    const { id } = req.params;

    const experienceId = parseInt(id);
    if (isNaN(experienceId)) {
      return res.status(400).json({ message: "잘못된 입력입니다." });
    }

    const [recommendedGoals] = await pool.query("SELECT goal_id, title, content FROM Goals WHERE experience_id = ? AND is_saved = false LIMIT 5", [experienceId]);

    const [recommendedLearnings] = await pool.query("SELECT title, url, source FROM Learnings WHERE experience_id = ? LIMIT 3", [experienceId]);

    res.status(200).json({
      goals: recommendedGoals,
      learnings: recommendedLearnings
    });

  } catch (error) {
      next(error);
  }
};


// 추천 목표 저장
exports.saveGoal = async (req, res, next) => {
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

    await pool.query("UPDATE Goals SET is_saved = true WHERE goal_id = ?", [goalId]);
    
    res.status(200).send({ message: '추천 목표 저장 완료' });

  } catch (error) {
      next(error);
  }
};
