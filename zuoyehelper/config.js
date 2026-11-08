// ============================================================
//  写作业机器人 · API 默认配置
// ============================================================
//  这里的值只是「默认值」，页面加载后可在右上角「⚙ 设置」里修改，
//  修改后的配置会保存进浏览器 localStorage，优先级高于本文件。
//
//  服务商：Agnes AI（OpenAI 兼容接口）
//  可用模型：agnes-3.0-flash / agnes-2.5-flash / agnes-2.5-pro-alpha
//           （另有 image / video 系列，非文本对话模型）
//
//  ⚠️ 纯静态部署时 API Key 会暴露给所有能打开页面的人：
//     仅供个人自用/学习，务必用限额 Key，不要用公司主账号 Key。
// ============================================================

window.API_CONFIG = {
  mode: "openai-compat",                                  // "openai-compat" | "anthropic"
  endpoint: "https://apihub.agnes-ai.com/v1/chat/completions",
  model: "agnes-3.0-flash",                               // 推荐：agnes-3.0-flash（质量好）/ agnes-2.5-flash（更快）
  apiKey: "sk-7o2iQNIWbBnJYm7zGABS7az53LWbH67coMLRn6T9rCnXjCu7",
  stream: true,
  extraHeaders: {},
};

// ---- 可选模型（页面「⚙ 设置」里的下拉提示项）----
window.AGNES_MODELS = [
  "agnes-3.0-flash",
  "agnes-2.5-flash",
  "agnes-2.5-pro-alpha",
  "agnes-2.5-pro-beta",
];
