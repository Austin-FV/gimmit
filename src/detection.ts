// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChangedFile {
  status: string;
  filepath: string;
  suggestedType: CommitType;
}

export type CommitType = "feat" | "fix" | "docs" | "chore" | "refactor" | "style" | "test";

// ─── Detection ────────────────────────────────────────────────────────────────

const TEST_PATTERNS    = [/\.test\./i, /\.spec\./i, /__tests__/i, /test\//i];
const DOC_PATTERNS     = [/readme/i, /\.md$/i, /docs?\//i, /changelog/i, /license/i, /\.txt$/i];
const STYLE_PATTERNS   = [/\.css$/i, /\.scss$/i, /\.less$/i, /\.styled\./i, /theme/i];
const CONFIG_PATTERNS  = [/\.json$/i, /\.yaml$/i, /\.yml$/i, /\.env/i, /config/i, /\.toml$/i, /\.ini$/i, /Dockerfile/i, /\.sh$/i];
const FIX_PATTERNS     = [/bug/i, /fix/i, /patch/i, /hotfix/i, /error/i, /issue/i, /crash/i, /fail/i];

export function detectChangeType(filepath: string, status: string): CommitType {
  if (status === "D") return "chore";
  const name = filepath.toLowerCase();
  if (TEST_PATTERNS.some((p) => p.test(name)))   return "test";
  if (DOC_PATTERNS.some((p) => p.test(name)))    return "docs";
  if (STYLE_PATTERNS.some((p) => p.test(name)))  return "style";
  if (CONFIG_PATTERNS.some((p) => p.test(name))) return "chore";
  if (FIX_PATTERNS.some((p) => p.test(name)))    return "fix";
  return "feat";
}