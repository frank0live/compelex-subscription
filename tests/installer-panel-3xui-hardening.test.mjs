import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = process.cwd();

/* Git for Windows' Bash on Windows (BASH_PATH overrides it), plain bash
 * elsewhere: the same resolution as installer-panel-3xui.test.mjs, rather than
 * baking one machine's drive into the test. */
function bashProgram() {
  if (process.platform !== "win32") return "bash";
  if (process.env.BASH_PATH) return process.env.BASH_PATH;
  const git = spawnSync("git", ["--exec-path"], { encoding: "utf8" });
  if (!git.error && git.status === 0) {
    const candidate = resolve(git.stdout.trim(), "..", "..", "..", "bin", "bash.exe");
    if (existsSync(candidate)) return candidate;
  }
  return "bash";
}

test("P5A hardening: corrupt sqlite database fails closed", () => {
  const base = mkdtempSync(join(tmpdir(), "row-hardening-"));

  try {
    const dbFolder = join(base, "db");
    const rt = join(base, "rt");
    const bin = join(base, "bin");

    mkdirSync(dbFolder, { recursive: true });
    mkdirSync(rt, { recursive: true });
    mkdirSync(bin, { recursive: true });

    writeFileSync(
      join(dbFolder, "x-ui.db"),
      "THIS IS NOT SQLITE"
    );

    const script = `
set -Eeuo pipefail

RT_ROOT="${rt}"
export RT_ROOT

XUI_DB_FOLDER="${dbFolder}"
export XUI_DB_FOLDER

PATH="${bin}:$PATH"
export PATH

source installer/lib/row-template.sh

if rt_detect_xui_db; then
  echo "unexpected-success"
  exit 1
else
  echo "failed-closed"
fi
`;

    const r = spawnSync(
      bashProgram(),
      ["-c", script],
      {
        cwd: ROOT,
        encoding: "utf8"
      }
    );
    if (r.error) throw r.error;

    console.log("STATUS:", r.status); console.log("STDOUT:", r.stdout); console.log("STDERR:", r.stderr); assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), "failed-closed");

  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
