---
title: GLM 大模型集成设计
date: 2026-05-07
branch: feat/glm-support
---

## 概述

在现有 AI 供应商体系（Doubao、DeepSeek、OpenAI、Gemini）中新增 **GLM（智谱 AI）** 支持。GLM 提供两种 API 端点模式，且需要分别配置文本模型和识图模型。

## 需求

1. GLM 作为新供应商注册到 AI 配置系统
2. 支持两种 API 模式：标准 API / 编码套餐（Coding Plan），通过下拉切换 base URL
3. 双模型配置：文本模型（语法检查、内容润色）+ 识图模型（PDF 导入）
4. PDF 导入支持使用 GLM 识图模型
5. 现有 grammar/polish 文本功能自动支持 GLM

## GLM API 要点

- 标准端点：`https://open.bigmodel.cn/api/paas/v4/chat/completions`
- 编码套餐端点：`https://open.bigmodel.cn/api/coding/paas/v4/chat/completions`（仅限 Coding 场景）
- 认证：`Authorization: Bearer API_KEY`
- 格式：OpenAI 兼容（`messages` + `chat/completions`）
- 多模态：`image_url` + base64 传入图片

## 改动清单

### 1. `src/config/ai.ts` — 注册 GLM 供应商

- `AIModelType` 联合类型加 `"glm"`
- `AIValidationContext` 加 `glmApiKey`、`glmTextModelId`、`glmVisionModelId`、`glmApiMode`
- 新增 `GlmApiMode` 类型：`"standard" | "coding"`
- `AI_MODEL_CONFIGS` 新增 `glm` 条目：
  - `url` 根据 mode 参数返回对应端点
  - `requiresModelId: true`
  - `validate` 检查 `apiKey + textModelId`

### 2. `src/store/useAIConfigStore.ts` — 状态扩展

新增字段：
- `glmApiKey: string`
- `glmTextModelId: string`
- `glmVisionModelId: string`
- `glmApiMode: "standard" | "coding"`，默认 `"standard"`

对应 setter 方法。

### 3. `src/app/app/dashboard/ai/page.tsx` — 设置页面

左侧供应商列表新增 GLM 卡片，右侧配置区包含：
- API Key 输入框（password）
- API 模式下拉：标准 API / 编码套餐
- 文本模型输入框（如 `glm-5.1`）
- 识图模型输入框（如 `glm-5v-turbo`），placeholder 提示可用模型
- 获取 API Key 链接指向 `https://open.bigmodel.cn`
- 图标使用 Lucide `Bot`

### 4. `src/routes/api/resume-import.ts` — PDF 导入支持 GLM

改动：
- 接收前端传入的 `provider` 字段（`"gemini" | "glm"`）
- 新增 GLM 分支：
  - 根据 `apiMode` 拼接 base URL
  - `messages` 中用 `image_url` 传 base64 图片
  - `model` 使用 `visionModel`
  - 复用现有 system instruction（简历结构化助手）
  - 解析 `choices[0].message.content` 提取 JSON
  - 返回格式与 Gemini 分支一致：`{ resume: parsedResume }`
- Gemini 分支保持不变

### 5. `src/app/app/dashboard/resumes/ResumeWorkbench.tsx` — 前端校验

改动：
- `importResumeFromPdf` 不再硬检查 `geminiApiKey`
- 读取 `selectedModel` 判断当前供应商：
  - Gemini → 检查 `geminiApiKey + geminiModelId`
  - GLM → 检查 `glmApiKey + glmVisionModelId`
  - 其他/未配置 → 提示去设置页
- 传给后端的 body 增加 `provider`、`apiMode`、`visionModel` 字段

### 6. `AIPolishDialog.tsx` / `GrammarCheckDrawer.tsx` — 文本功能适配

改动：
- apiKey/modelId 获取的 if-else 链加 GLM 分支
- GLM 传入 `glmApiKey`、`glmTextModelId`
- `apiEndpoint` 字段传入 GLM 时为 undefined（url 由 `AI_MODEL_CONFIGS` 根据 mode 生成）

> grammar/polish 路由本身不需要改动，它们通过 `modelType` 动态查找配置。

### 7. i18n — 翻译

`src/i18n/locales/zh.json` 和 `en.json` 新增 GLM 相关翻译：
- `dashboard.settings.ai.glm.title`：GLM / GLM (智谱AI)
- `dashboard.settings.ai.glm.description`
- `dashboard.settings.ai.glm.apiKey`
- `dashboard.settings.ai.glm.textModel`
- `dashboard.settings.ai.glm.visionModel`
- `dashboard.settings.ai.glm.apiMode.standard`
- `dashboard.settings.ai.glm.apiMode.coding`
- `dashboard.resumes.importDialog.glmConfigRequired`

## 不在范围内

- 不引入 GLM SDK（`zai-sdk`），全部用 `fetch` + OpenAI 兼容格式
- 不改动现有 Gemini/Doubao/DeepSeek/OpenAI 的逻辑
- 不支持 GLM 的流式输出用于 PDF 导入（非文本场景不需要流式）
