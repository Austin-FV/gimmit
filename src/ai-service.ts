import * as https from "https";
import * as http from "http";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AiProvider = "anthropic" | "openai" | "google";
export type AiProviderOption = AiProvider | "none";

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

// ─── Provider Metadata ───────────────────────────────────────────────────────

export const AI_PROVIDERS: AiProvider[] = ["anthropic", "openai", "google"];

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
};

export function normalizeAiProvider(provider: string | undefined | null): AiProviderOption {
  if (!provider || provider === "none") return "none";
  return AI_PROVIDERS.includes(provider as AiProvider) ? (provider as AiProvider) : "none";
}

// ─── Available Models ─────────────────────────────────────────────────────────

export const PROVIDER_MODELS: Record<AiProvider, AiModel[]> = {
  anthropic: [
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", provider: "anthropic" },
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", provider: "anthropic" },
    { id: "claude-opus-4-6", label: "Claude Opus 4.6", provider: "anthropic" },
  ],
  openai: [
    { id: "gpt-5-nano", label: "GPT-5 Nano", provider: "openai" },
    { id: "gpt-5.4-nano", label: "GPT-5.4 Nano", provider: "openai" },
  ],
  google: [
    { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", provider: "google" },
    { id: "gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash Lite Preview", provider: "google" },
  ],
};

export function getAllModels(): AiModel[] {
  return [
    ...PROVIDER_MODELS.anthropic,
    ...PROVIDER_MODELS.openai,
    ...PROVIDER_MODELS.google,
  ];
}

export function getDefaultModel(provider: AiProvider): string {
  return PROVIDER_MODELS[provider][0].id;
}

export function getProviderLabel(provider: AiProvider): string {
  return PROVIDER_LABELS[provider];
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

async function callAnthropic(
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
  throw new Error("Empty response from Anthropic");
}

async function callOpenAI(
  apiKey: string,
  modelId: string,
  prompt: string,
  mode: "message" | "body" = "message"
): Promise<string> {
  const isBody = mode === "body";

  const body = JSON.stringify({
    model: modelId,
    instructions: isBody
      ? "Generate only a concise git commit body. Plain text only. No title. No markdown. Keep it brief and directly tied to the changed files."
      : "Generate only a conventional git commit title. Plain text only. No body. No markdown.",
    input: prompt,
    max_output_tokens: isBody ? 1024 : 400,
    reasoning: { effort: "low" },
    text: {
      format: { type: "text" },
      verbosity: "low",
    },
  });

  const response = await httpsRequest(
    "https://api.openai.com/v1/responses",
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

  if (parsed.error) {
    throw new Error(
      `OpenAI API error: ${parsed.error.message || JSON.stringify(parsed.error)}`
    );
  }

  if (typeof parsed.output_text === "string" && parsed.output_text.trim()) {
    return parsed.output_text.trim();
  }

  const text =
    parsed.output
      ?.filter((item: any) => item.type === "message")
      ?.flatMap((item: any) => item.content || [])
      ?.filter((c: any) => c.type === "output_text")
      ?.map((c: any) => c.text)
      ?.join("")
      ?.trim();

  if (text) return text;

  if (parsed.status === "incomplete") {
    throw new Error(
      `OpenAI response incomplete: ${parsed.incomplete_details?.reason || "unknown"}`
    );
  }

  throw new Error(`Unexpected OpenAI response: ${response}`);
}

async function callGoogle(
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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`;

  const response = await httpsRequest(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
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
  throw new Error("Empty response from Google");
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
    case "anthropic":
      return callAnthropic(config.apiKey, config.modelId, prompt);
    case "openai":
      return callOpenAI(config.apiKey, config.modelId, prompt, request.mode);
    case "google":
      return callGoogle(config.apiKey, config.modelId, prompt);
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}