import { execFile } from "node:child_process";

/**
 * Runs a command with an args array (never a shell string) so untrusted
 * content — narration text, LLM-generated prompts, provider URLs — can never
 * be interpreted as shell syntax. Captures stderr so failures are debuggable
 * (ffmpeg writes all its diagnostic output to stderr, not stdout).
 */
export function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { maxBuffer: 1024 * 1024 * 64 }, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(`${command} failed: ${error.message}\n${stderr.slice(-4000)}`));
        return;
      }
      resolve();
    });
  });
}

export function runCapture(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { maxBuffer: 1024 * 1024 * 64 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${command} failed: ${error.message}\n${stderr.slice(-4000)}`));
        return;
      }
      resolve(stdout);
    });
  });
}

/** ffmpeg filter arguments split filter-graph options on `:` — escape any
 * colon in a filesystem path (Windows drive letters) so it isn't parsed as
 * an option separator. Forward slashes side-step backslash-escaping entirely. */
export function escapeFilterPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:");
}
