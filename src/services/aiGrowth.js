const { GoogleGenerativeAI } = require("@google/generative-ai");
const dotenv = require("dotenv");

dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = "gemini-1.5-flash";

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: MODEL_NAME });

exports.generateGrowth = async (content) => {
  const prompt = `
사용자의 경험을 분석하고 다음 정보를 JSON 형식으로 출력하세요.

**JSON 응답 형식 (반드시 JSON 형식으로만 출력하세요!) 아래는 발표에 대한 아쉬움의 성장 포인트 예시입니다**:
{
  "point": {
    "발표 내용 복기": "어떤 부분에서 어려움을 겪었는지 구체적으로 되돌아보세요. 내용 이해 부족, 긴장감 등 원인을 파악하면 개선할 수 있습니다.",
    "작은 성공 경험 쌓기": "사람들 앞에서 이야기할 기회를 만들어보세요.",
    "자기 긍정 강화": "오늘의 경험이 당신의 모든 능력을 정의하는 것은 아닙니다.당신은 이미 많은 능력과 가능성을 가지고 있어요."
  },
  "potential": 성장 가능성 (50~100 사이의 5단위 숫자)
}

**응답 규칙**:
- 성장 포인트(growth_points)는 3개를 제공하며, 짧은 제목: 설명의 형태로 이루어집니다.
- 문장이 짧으면 두 줄, 문장이 길면 3줄로 구성해주세요.
- 성장 포인트는 경험과 직접 관련된 구체적이고 실용적인 내용이어야 합니다. 
- 사용자가 어떻게 하면 이 경험을 바탕으로 나아질수 있을지, 성장할 수 있을지 조언합니다.
- 성장 가능성은 경험과 성장 포인트를 바탕으로 사용자가 얼마나 성장할 수 있을지의 가능성입입니다.
- 성장 가능성(growth_potential)은 50~100 사이의 5 단위 숫자로 제공하세요.
- **JSON 형식으로만 출력하고, 추가 설명은 하지 마세요.**

**사용자의 경험**:
"${content}"

**JSON 응답:**`;

  try {
    const result = await model.generateContent(prompt);
    console.log("growth_point 응답: ", result);
    let response = await result.response.text();

    console.log(response);
    response = response.replace(/```json/g, "").replace(/```/g, "").trim();

    return JSON.parse(response);
    
  } catch (error) {
    console.error(error);
    return null;
  }
};