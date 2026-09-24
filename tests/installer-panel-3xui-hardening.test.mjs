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

const VALID = Buffer.concat([Buffer.from("SQLite format 3\0"), Buffer.alloc(84)]);
const CORRUPT = "THIS IS NOT SQLITE";

/* Single-quote a path for bash. mkdtemp names never contain a quote. */
function q(path) {
  assert.equal(path.includes("'"), false, `unexpected quote in ${path}`);
  return `'${path}'`;
}

/* Run rt_detect_xui_db over fixture databases and report which one it chose.
 *
 * `configured` is the contents of the database XUI_DB_FOLDER names: null means
 * the folder is named but holds no database, and undefined leaves XUI_DB_FOLDER
 * unset. `defaults` stands in for the fixed system locations, in priority
 * order, with null for a location that holds no database. The real locations
 * are system paths, so RT_XUI_DB_DEFAULTS is replaced after sourcing and they
 * are never read here.
 *
 * Prints "detected:<name>" (configured, default0, default1, ...) or
 * "failed-closed". */
function detect({ configured, defaults = [] } = {}) {
  const base = mkdtempSync(join(tmpdir(), "row-hardening-"));

  try {
    const rt = join(base, "rt");
    const bin = join(base, "bin");
    mkdirSync(rt, { recursive: true });
    mkdirSync(bin, { recursive: true });

    /* A folder per location, so the chosen database is named by its folder. */
    const place = (name, contents) => {
      const folder = join(base, name);
      mkdirSync(folder, { recursive: true });
      if (contents !== null) writeFileSync(join(folder, "x-ui.db"), contents);
      return folder;
    };

    const folderSetting = configured === undefined
      ? "unset XUI_DB_FOLDER"
      : `XUI_DB_FOLDER=${q(place("configured", configured))}\nexport XUI_DB_FOLDER`;
    const locations = defaults.length
      ? defaults.map((contents, i) => q(join(place(`default${i}`, contents), "x-ui.db")))
      : [q(join(base, "nowhere", "x-ui.db"))];

    const script = `
set -Eeuo pipefail

RT_ROOT=${q(rt)}
export RT_ROOT

${folderSetting}

PATH=${q(bin)}:$PATH
export PATH

source installer/lib/row-template.sh
RT_XUI_DB_DEFAULTS=(${locations.join(" ")})

if rt_detect_xui_db; then
  echo "detected:$(basename "$(dirname "$RT_XUI_DB")")"
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
  const r = detect({ configured: CORRUPT });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), "failed-closed");
  assert.match(r.stderr, /XUI_DB_FOLDER database is not an SQLite database/,
    "the operator must be told why the configured database was refused");
});

test("P5A hardening: a valid configured database is detected without a warning", () => {
  /* The real header is "SQLite format 3" plus a NUL. Reading the NUL into a
   * command substitution makes bash print "ignored null byte" on every run. */
  const r = detect({ configured: VALID });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), "detected:configured");
  assert.doesNotMatch(r.stderr, /null byte|warn/, "a healthy database must be detected silently");
});

test("P5A hardening: a corrupt configured database is not bypassed for a valid default", () => {
  const r = detect({ configured: CORRUPT, defaults: [VALID] });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), "failed-closed",
    "a valid default must not be used in place of the configured database");
});

test("P5A hardening: a corrupt default database fails closed instead of falling through", () => {
  const r = detect({ defaults: [CORRUPT, VALID] });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), "failed-closed",
    "a lower-priority database must not be used in place of a corrupt higher-priority one");
  assert.match(r.stderr, /panel database is not an SQLite database: .*default0/,
    "the warning must name the refused file");
  assert.match(r.stderr, /set XUI_DB_FOLDER/, "and tell the operator how to point at the right one");
});

test("P5A hardening: locations without a database are skipped, in priority order", () => {
  const cases = [
    [{ defaults: [VALID, VALID] }, "detected:default0", "the first default wins"],
    [{ defaults: [null, VALID, VALID] }, "detected:default1", "a missing default is skipped"],
    [{ configured: null, defaults: [null, VALID] }, "detected:default1",
      "a named folder without a database falls back to the defaults"],
    [{ configured: VALID, defaults: [VALID] }, "detected:configured",
      "a configured database takes precedence over the defaults"],
    [{ defaults: [null, null] }, "failed-closed", "no database anywhere is a plain failure"],
  ];
  for (const [spec, want, label] of cases) {
    const r = detect(spec);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), want, label);
    assert.doesNotMatch(r.stderr, /warn/, `${label}: nothing here is corrupt, so nothing warns`);
  }
});
