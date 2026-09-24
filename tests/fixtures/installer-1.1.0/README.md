# The v1.1.0 management library

`row-template.sh` is `installer/lib/row-template.sh` exactly as released in
Row-Template v1.1.0 (tag `v1.1.0`, commit `137075a`), byte for byte:

```
sha256  c5a2b069826e5f1b46c1ace42d111d8f7a035c3c9651f064b69e62ca41ed32ac
```

It is the code already running on every host that installed v1.1.0, and it is
what performs the update to a newer release: `row-template update` runs the
*installed* library, so a new release is installed by the old updater. That
updater copies only `template.html`, `VERSION`, `lib/row-template.sh` and
`bin/row-template` from the payload. `tests/release.test.mjs` runs this file
against the real release tarball to prove an upgrade from v1.1.0 works.

It is kept here, rather than read from git history, so the test also runs in a
shallow clone or an unpacked archive. Never edit it: the test pins the checksum
above.
