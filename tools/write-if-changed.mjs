/* Write a build output so that a concurrent reader never sees half a file.
 *
 * The build is deterministic, and the test suite runs its files in parallel:
 * two of them rebuild the committed artifacts (the release test through
 * tools/make-release.sh, the preview test directly) while others read those
 * same files. writeFileSync truncates before it writes, so a reader could see
 * an empty or partial page -- found on Linux, where installer tests failed with
 * "generated template does not begin with <!doctype html>".
 *
 * So: bytes that are already on disk are not rewritten at all, and new bytes
 * go to a sibling temporary file that is renamed over the target in one step.
 * Returns true when the file was written, false when it was already current.
 */
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';

const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

export function writeIfChanged(path, content) {
  const next = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
  try {
    if (readFileSync(path).equals(next)) return false;
  } catch {
    /* absent or unreadable: write it */
  }
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, next);
  for (let attempt = 0; ; attempt += 1) {
    try {
      renameSync(tmp, path);
      return true;
    } catch (err) {
      /* Windows will not replace a file another process has open; a reader
         holds it only for the moment it takes to read it. */
      if (attempt < 40 && ['EPERM', 'EACCES', 'EBUSY'].includes(err.code)) {
        pause(50);
        continue;
      }
      rmSync(tmp, { force: true });
      throw err;
    }
  }
}
