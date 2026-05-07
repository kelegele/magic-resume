import { createFileRoute } from "@tanstack/react-router";
import { formatGeminiErrorMessage, getGeminiModelInstance } from "@/lib/server/gemini";
import { GlmApiMode } from "@/config/ai";

const parseJsonPayload = (content: string) => {
  const text = content.trim();
  try {
    return JSON.parse(text);
  } catch (error) {}

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch (error) {}
  }

  const objectBlock = text.match(/\{[\s\S]*\}/);
  if (objectBlock?.[0]) {
    try {
      return JSON.parse(objectBlock[0]);
    } catch (error) {}
  }

  return null;
};

const extractBase64Payload = (value: string) => {
  const matched = value.match(/^data:(.*?);base64,(.*)$/);
  if (matched) {
    return {
      mimeType: matched[1] || "image/jpeg",
      data: matched[2] || "",
    };
  }

  return {
    mimeType: "image/jpeg",
    data: value,
  };
};

const buildSystemInstruction = (language: string) =>
  `你是一个专业的简历结构化助手。根据用户提供的简历内容，提取信息并只输出一个合法 JSON 对象。

输出约束：
1. 只允许输出 JSON，不要输出 Markdown，不要输出解释。
2. 如果某个字段不确定，使用空字符串或空数组。
3. 请使用 ${language} 输出内容文本。
4. description/details 字段输出字符串数组，每一项为一句可读内容。

JSON 结构：
{
  "title": "简历标题",
  "basic": {
    "name": "",
    "title": "",
    "email": "",
    "phone": "",
    "location": "",
    "employementStatus": "",
    "birthDate": ""
  },
  "education": [
    {
      "school": "",
      "major": "",
      "degree": "",
      "startDate": "",
      "endDate": "",
      "gpa": "",
      "description": ["", ""]
    }
  ],
  "experience": [
    {
      "company": "",
      "position": "",
      "date": "",
      "details": ["", ""]
    }
  ],
  "projects": [
    {
      "name": "",
      "role": "",
      "date": "",
      "description": ["", ""],
      "link": "",
      "linkLabel": ""
    }
  ],
  "skills": ["", ""]
}`;

const parseUpstreamError = (raw: string, fallback: string) => {
  if (!raw) return { message: fallback };
  try {
    const data = JSON.parse(raw) as {
      error?: { message?: string; code?: string };
      message?: string;
    };
    return {
      message: data.error?.message || data.message || fallback,
      code: data.error?.code,
    };
  } catch {
    return { message: raw };
  }
};

export const Route = createFileRoute("/api/resume-import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const { provider, apiKey, model, content, images, locale, visionModel, apiMode } = body as {
            provider?: "gemini" | "glm";
            apiKey: string;
            model?: string;
            content?: string;
            images?: string[];
            locale?: string;
            visionModel?: string;
            apiMode?: GlmApiMode;
          };

          const isGLM = provider === "glm";

          if (!apiKey || (!content && (!images || images.length === 0))) {
            return Response.json(
              { error: "Missing API key or resume content/images" },
              { status: 400 }
            );
          }

          if (isGLM && !visionModel) {
            return Response.json(
              { error: "Missing visionModel for GLM provider" },
              { status: 400 }
            );
          }

          const language = locale === "en" ? "English" : "Chinese";
          const systemInstruction = buildSystemInstruction(language);

          // ---- Gemini branch (unchanged) ----
          if (!isGLM) {
            const geminiModel = model || "gemini-flash-latest";
            const imageParts = Array.isArray(images)
              ? images.map((image) => {
                  const payload = extractBase64Payload(image);
                  return {
                    inlineData: {
                      mimeType: payload.mimeType,
                      data: payload.data,
                    },
                  };
                })
              : [];
            const modelInstance = getGeminiModelInstance({
              apiKey,
              model: geminiModel,
              systemInstruction,
              generationConfig: {
                temperature: 0.2,
                responseMimeType: "application/json",
              },
            });

            const inputParts = [
              {
                text:
                  content ||
                  "请识别以下简历页面图片中的信息，并严格按 JSON 结构输出。",
              },
              ...imageParts,
            ];

            const result = await modelInstance.generateContent(inputParts);
            const aiContent = result.response.text();

            if (!aiContent || typeof aiContent !== "string") {
              return Response.json(
                { error: "AI did not return structured content" },
                { status: 500 }
              );
            }

            const parsedResume = parseJsonPayload(aiContent);
            if (!parsedResume) {
              return Response.json(
                { error: "Failed to parse AI JSON output" },
                { status: 500 }
              );
            }

            return Response.json({ resume: parsedResume });
          }

          // ---- GLM branch ----
          const baseUrl = apiMode === "coding"
            ? "https://open.bigmodel.cn/api/coding/paas/v4/chat/completions"
            : "https://open.bigmodel.cn/api/paas/v4/chat/completions";

          const imageContents = Array.isArray(images)
            ? images.map((image) => {
                const payload = extractBase64Payload(image);
                return {
                  type: "image_url",
                  image_url: {
                    url: `data:${payload.mimeType};base64,${payload.data}`,
                  },
                };
              })
            : [];

          const userMessageContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
            {
              type: "text",
              text:
                content ||
                "请识别以下简历页面图片中的信息，并严格按 JSON 结构输出。",
            },
            ...imageContents,
          ];

          const glmResponse = await fetch(baseUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: visionModel,
              messages: [
                {
                  role: "system",
                  content: `${systemInstruction}\n\n请严格只输出 JSON，不要包含任何其他内容。`,
                },
                {
                  role: "user",
                  content: userMessageContent,
                },
              ],
              temperature: 0.2,
            }),
          });

          const glmRaw = await glmResponse.text();
          if (!glmResponse.ok) {
            const fallbackMessage = `GLM API error: ${glmResponse.status} ${glmResponse.statusText}`;
            const parsedError = parseUpstreamError(glmRaw, fallbackMessage);
            return Response.json(
              { error: parsedError },
              { status: glmResponse.status }
            );
          }

          let glmData: { choices?: Array<{ message?: { content?: string } }> };
          try {
            glmData = glmRaw ? JSON.parse(glmRaw) : {};
          } catch {
            return Response.json(
              { error: "Invalid GLM response: expected JSON payload" },
              { status: 502 }
            );
          }

          const aiContent = glmData?.choices?.[0]?.message?.content;
          if (!aiContent || typeof aiContent !== "string") {
            return Response.json(
              { error: "AI did not return structured content" },
              { status: 500 }
            );
          }

          const parsedResume = parseJsonPayload(aiContent);
          if (!parsedResume) {
            return Response.json(
              { error: "Failed to parse AI JSON output" },
              { status: 500 }
            );
          }

          return Response.json({ resume: parsedResume });
        } catch (error) {
          console.error("Error in resume import:", error);
          const status =
            typeof (error as any)?.status === "number"
              ? (error as any).status
              : 500;
          return Response.json(
            { error: formatGeminiErrorMessage(error) },
            { status }
          );
        }
      },
    },
  },
});
