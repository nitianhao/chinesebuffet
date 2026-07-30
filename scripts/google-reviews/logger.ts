// Structured JSONL logger. One valid-JSON object per line, appended to
// .runtime/google-reviews/logs/<runId>.jsonl (git-ignored). Never log secrets
// (admin token, cookies) — callers pass only safe, already-public fields.

import fs from "node:fs";
import path from "node:path";

export type Logger = {
  runId: string;
  logPath: string;
  log: (event: Record<string, unknown>) => void;
  close: () => void;
};

export function createLogger(runId: string): Logger {
  const dir = path.join(process.cwd(), ".runtime", "google-reviews", "logs");
  fs.mkdirSync(dir, { recursive: true });
  const logPath = path.join(dir, `${runId}.jsonl`);
  // Append mode so an interrupted run keeps its earlier lines; each write is
  // flushed so a crash can't lose already-emitted events.
  const stream = fs.createWriteStream(logPath, { flags: "a" });

  return {
    runId,
    logPath,
    log(event) {
      stream.write(`${JSON.stringify({ ts: new Date().toISOString(), ...event })}\n`);
    },
    close() {
      stream.end();
    },
  };
}
