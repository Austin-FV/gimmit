import * as https from "https";
import * as http from "http";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AiProvider = "claude" | "openai" | "gemini";

export interface AiModel {
  id: string;
  label: string;
  provider: AiProvider;
}

export interface AiConfig {
  provider: AiProvider;
  modelId: string;
  apiKey: string;
}

export interface AiGenerateRequest {
  diff: string;
  fileList: string[];
  commitType: string;
  scope: string;
  mode: "message" | "body";
}

// ─── Available Models ─────────────────────────────────────────────────────────

export const PROVIDER_MODELS: Record<AiProvider, AiModel[]> = {
  claude: [
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", provider: "claude" },
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", provider: "claude" },
    { id: "claude-opus-4-6", label: "Claude Opus 4.6", provider: "claude" },
  ],
  openai: [
    { id: "gpt-5-nano", label: "GPT-5 Nano", provider: "openai" },
    { id: "gpt-5.4-nano", label: "GPT-5.4 Nano", provider: "openai" },
  ],
  gemini: [
    { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", provider: "gemini" },
    { id: "gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash Lite Preview", provider: "gemini" },
  ],
};

export function getAllModels(): AiModel[] {
  return [
    ...PROVIDER_MODELS.claude,
    ...PROVIDER_MODELS.openai,
    ...PROVIDER_MODELS.gemini,
  ];
}

export function getDefaultModel(provider: AiProvider): string {
  return PROVIDER_MODELS[provider][0].id;
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

function buildMessagePrompt(req: AiGenerateRequest): string {
  const fileListStr = req.fileList.map((f) => `  - ${f}`).join("\n");
  return `You are a commit message generator. Given the following git diff and file list, write a concise commit message description.

RULES:
- Do NOT include a conventional commit prefix (no "feat:", "fix:", etc.) — only write the description part.
- Keep it under 60 characters.
- Use imperative mood (e.g. "add", "fix", "update", not "added", "fixed", "updated").
- Be specific about what changed, not generic.
- Output ONLY the message text, nothing else. No quotes, no explanation.

Commit type context: ${req.commitType}
${req.scope ? `Scope: ${req.scope}` : ""}

Changed files:
${fileListStr}

Git diff (truncated if large):
\`\`\`
${req.diff.slice(0, 8000)}
\`\`\`

Commit message description:`;
}

function buildBodyPrompt(req: AiGenerateRequest): string {
  const fileListStr = req.fileList.map((f) => `  - ${f}`).join("\n");
  return `You are a commit body generator. Given the following git diff and file list, write a concise commit body.

RULES:
- Summarize the key changes in 2-5 bullet points using "- " prefix.
- Each bullet should be a short, specific description of a change.
- Keep each line under 72 characters.
- Use imperative mood.
- Do NOT repeat the commit message subject line.
- Output ONLY the body text, nothing else. No intro, no explanation.

Commit type context: ${req.commitType}
${req.scope ? `Scope: ${req.scope}` : ""}

Changed files:
${fileListStr}

Git diff (truncated if large):
\`\`\`
${req.diff.slice(0, 8000)}
\`\`\`

Commit body:`;
}

// ─── HTTP Helper ──────────────────────────────────────────────────────────────

function httpsRequest(
  url: string,
  options: https.RequestOptions,
  body: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const reqOptions: https.RequestOptions = {
      ...options,
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      port: parsedUrl.port || 443,
    };

    const req = https.request(reqOptions, (res: http.IncomingMessage) => {
      let data = "";
      res.on("data", (chunk: Buffer) => {
        data += chunk.toString();
      });
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 400) {
          let errMsg = `API error ${res.statusCode}`;
          try {
            const parsed = JSON.parse(data);
            errMsg =
              parsed.error?.message ||
              parsed.error?.type ||
              parsed.message ||
              errMsg;
          } catch {
            // use default error message
          }
          reject(new Error(errMsg));
        } else {
          resolve(data);
        }
      });
    });

    req.on("error", (e: Error) => reject(e));
    req.write(body);
    req.end();
  });
}

// ─── Provider Implementations ─────────────────────────────────────────────────

async function callClaude(
  apiKey: string,
  modelId: string,
  prompt: string
): Promise<string> {
  const body = JSON.stringify({
    model: modelId,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const response = await httpsRequest(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    },
    body
  );

  const parsed = JSON.parse(response);
  if (parsed.content && parsed.content.length > 0) {
    return parsed.content
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("")
      .trim();
  }
  throw new Error("Empty response from Claude");
}

async function callOpenAI(
  apiKey: string,
  modelId: string,
  prompt: string
): Promise<string> {
  const body = JSON.stringify({
    model: modelId,
    messages: [
      {
        role: "system",
        content:
          "You are a precise commit message generator. Follow the user's instructions exactly.",
      },
      { role: "user", content: prompt },
    ],
    max_tokens: 1024,
    temperature: 0.3,
  });

  const response = await httpsRequest(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    },
    body
  );

  const parsed = JSON.parse(response);
  if (parsed.choices && parsed.choices.length > 0) {
    return parsed.choices[0].message.content.trim();
  }
  throw new Error("Empty response from OpenAI");
}

async function callGemini(
  apiKey: string,
  modelId: string,
  prompt: string
): Promise<string> {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: 1024,
      temperature: 0.3,
    },
  });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

  const response = await httpsRequest(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    },
    body
  );

  const parsed = JSON.parse(response);
  if (
    parsed.candidates &&
    parsed.candidates.length > 0 &&
    parsed.candidates[0].content
  ) {
    return parsed.candidates[0].content.parts
      .map((p: { text: string }) => p.text)
      .join("")
      .trim();
  }
  throw new Error("Empty response from Gemini");
}

// ─── Unified Generate Function ───────────────────────────────────────────────

export async function generateWithAi(
  config: AiConfig,
  request: AiGenerateRequest
): Promise<string> {
  const prompt =
    request.mode === "message"
      ? buildMessagePrompt(request)
      : buildBodyPrompt(request);

  switch (config.provider) {
    case "claude":
      return callClaude(config.apiKey, config.modelId, prompt);
    case "openai":
      return callOpenAI(config.apiKey, config.modelId, prompt);
    case "gemini":
      return callGemini(config.apiKey, config.modelId, prompt);
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}