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

/* Run rt_detect_xui_db against a database file holding CONTENTS, named through
 * XUI_DB_FOLDER. Prints "detected" or "failed-closed". */
function detectWith(contents) {
  const base = mkdtempSync(join(tmpdir(), "row-hardening-"));

  try {
    const dbFolder = join(base, "db");
    const rt = join(base, "rt");
    const bin = join(base, "bin");

    mkdirSync(dbFolder, { recursive: true });
    mkdirSync(rt, { recursive: true });
    mkdirSync(bin, { recursive: true });

    writeFileSync(join(dbFolder, "x-ui.db"), contents);

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
  echo "detected"
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
    return r;
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

test("P5A hardening: corrupt sqlite database fails closed", () => {
  const r = detectWith("THIS IS NOT SQLITE");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), "failed-closed");
  assert.match(r.stderr, /XUI_DB_FOLDER database is not an SQLite database/,
    "the operator must be told why the configured database was refused");
});

test("P5A hardening: a valid configured database is detected without a warning", () => {
  /* The real header is "SQLite format 3" plus a NUL. Reading the NUL into a
   * command substitution makes bash print "ignored null byte" on every run. */
  const r = detectWith(Buffer.concat([Buffer.from("SQLite format 3\0"), Buffer.alloc(84)]));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), "detected");
  assert.doesNotMatch(r.stderr, /null byte|warn/, "a healthy database must be detected silently");
});
