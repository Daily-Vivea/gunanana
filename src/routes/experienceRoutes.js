const express = require("express");
const asyncHandler = require("../middlewares/asyncHandler.js");
const { saveDate, createExperience, analyzeExperience, getFeedback, getRecommendation, saveGoal } = require("../controllers/experienceController.js");

const experienceRouter = express.Router();

// 날짜 설정 화면, id는 user id
experienceRouter.post('/:id/date', asyncHandler(saveDate));

// 경험 기록 화면, id는 experience id
experienceRouter.put('/:id/record', asyncHandler(createExperience));

// 로딩 화면 + ai 분석 (피드백 ~ 추천목표까지 전부 분석), id는 experience id
experienceRouter.put('/:id/analysis', asyncHandler(analyzeExperience));

// 피드백 화면, id는 experience id
experienceRouter.get('/:id/feedbacks', asyncHandler(getFeedback));

// 추천 목표 화면, id는 experience id
experienceRouter.get('/:id/recommends', asyncHandler(getRecommendation));

// 추천목표 저장하기 버튼, id는 goal id
experienceRouter.put('/:id/save', asyncHandler(saveGoal));

module.exports = experienceRouter;
