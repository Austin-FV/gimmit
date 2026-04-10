import { execFileSync } from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as vscode from "vscode";
import { ChangedFile, detectChangeType } from "./detection";

// ─── Git Availability ────────────────────────────────────────────────────────

export function isGitAvailable(): boolean {
  try {
    execFileSync("git", ["--version"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

// ─── Changed Files ───────────────────────────────────────────────────────────

export function getChangedFiles(repoRoot: string): ChangedFile[] {
  try {

    const output = execFileSync("git", ["status", "--porcelain", "-uall"], { 
      cwd: repoRoot 
    }).toString();

    return output
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        const status = line.substring(0, 2).trim();
        const filepath = line.substring(3).trim().replace(/^"(.*)"$/, "$1");
        return { status, filepath, suggestedType: detectChangeType(filepath, status) };
      });
  } catch (e) {
    console.error("getChangedFiles error:", e);
    return [];
  }
}

// ─── Git Diff ────────────────────────────────────────────────────────────────

export function getGitDiff(repoRoot: string, filePaths: string[]): string {
  if (!filePaths.length) return "";
  try {
    // Get diff for tracked files (staged + unstaged)
    const tracked = filePaths.filter((f) => {
      try {
        execFileSync("git", ["ls-files", "--error-unmatch", f], {
          cwd: repoRoot,
          stdio: "pipe",
        });
        return true;
      } catch {
        return false;
      }
    });
    const untracked = filePaths.filter((f) => !tracked.includes(f));

    let diff = "";
    if (tracked.length) {
      try {
        // Staged changes
        const stagedDiff = execFileSync(
          "git", ["diff", "--cached", "--", ...tracked],
          { cwd: repoRoot, maxBuffer: 5 * 1024 * 1024 }
        ).toString();
        diff += stagedDiff;
      } catch { /* ignore partial diff failures */ }
      try {
        // Unstaged changes
        const unstagedDiff = execFileSync(
          "git", ["diff", "--", ...tracked],
          { cwd: repoRoot, maxBuffer: 5 * 1024 * 1024 }
        ).toString();
        diff += unstagedDiff;
      } catch { /* ignore partial diff failures */ }
    }

    // For untracked files, show their content as "new file"
    for (const f of untracked) {
      try {
        const content = fs.readFileSync(path.join(repoRoot, f), "utf-8");
        const truncated = content.slice(0, 2000);
        diff += `\n--- /dev/null\n+++ b/${f}\n@@ -0,0 +1 @@\n${truncated
          .split("\n")
          .map((l) => `+${l}`)
          .join("\n")}\n`;
      } catch { /* ignore */ }
    }

    return diff;
  } catch (e) {
    console.error("getGitDiff error:", e);
    return "";
  }
}

// ─── Repo Root Detection ─────────────────────────────────────────────────────

export function getRepoRoot(filePath: string): string | undefined {
  try {
    let cwd: string;
    try {
      cwd = fs.statSync(filePath).isDirectory() ? filePath : path.dirname(filePath);
    } catch {
      cwd = path.dirname(filePath);
    }
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd }).toString().trim();
  } catch {
    return undefined;
  }
}

// Scan all workspace folders and their immediate children to find a git repo.
// Handles the case where the workspace root is a parent folder containing the repo.
export function findRepoFromWorkspace(folders: readonly vscode.WorkspaceFolder[]): string | undefined {
  for (const folder of folders) {
    const root = getRepoRoot(folder.uri.fsPath);
    if (root) return root;

    // Try immediate subdirectories
    try {
      const entries = fs.readdirSync(folder.uri.fsPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const subRoot = getRepoRoot(path.join(folder.uri.fsPath, entry.name));
        if (subRoot) return subRoot;
      }
    } catch { /* can't read directory */ }
  }
  return undefined;
}