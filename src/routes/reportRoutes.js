const express = require("express");
const router = express.Router();
const reportController = require("../controllers/reportController.js");

router.get("/reports/:userId", reportController.getReports);

router.get("/reports/detail/:userId", reportController.getReportDetails);


module.exports = router;
