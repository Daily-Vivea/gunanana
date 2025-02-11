const express = require("express");
const router = express.Router();
const reportController = require("../controllers/reportController"); 

router.get("/", reportController.getReports); 
router.get("/details", reportController.getReportDetails);

module.exports = router;