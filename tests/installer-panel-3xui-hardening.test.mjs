import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const ROOT = process.cwd();

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
      "D:\\Git\\bin\\bash.exe",
      ["-c", script],
      {
        cwd: ROOT,
        encoding: "utf8"
      }
    );

    console.log("STATUS:", r.status); console.log("STDOUT:", r.stdout); console.log("STDERR:", r.stderr); assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), "failed-closed");

  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
