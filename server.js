require("dotenv").config();
const express = require("express");
const cors = require('cors');
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./config/swaggerConfig");
const todoRouter = require("./src/routes/todoRouter");
const userRoutes = require("./src/routes/userRoutes");
const reportRouter = require("./src/routes/reportRouter");
const experienceRouter = require("./src/routes/experienceRoutes.js");
const goalRouter = require("./src/routes/goalRoutes.js");
const errorMiddleware = require("./src/middlewares/errorMiddleware.js");


console.log('JWT_SECRET:', process.env.JWT_SECRET);  // JWT_SECRET 값 확인
console.log('GEMINI_API_KEY: ', process.env.GEMINI_API_KEY);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());
app.use("/api", todoRouter);
app.use("/api", userRoutes);
app.use("/api", reportRouter); 
app.use('/api', experienceRouter);
app.use('/api', goalRouter);



// ✅ Swagger UI 설정
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use(errorMiddleware);

app.listen(PORT, () => {
  console.log(`🚀 서버 실행 중: http://localhost:${PORT}`);
  console.log(`📄 Swagger 문서: http://localhost:${PORT}/api-docs`);
});
