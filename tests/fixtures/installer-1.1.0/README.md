# The v1.1.0 management library

`row-template.sh` is `installer/lib/row-template.sh` the released v1.1.0 library with the
branding strings normalized to this repository (release channel and author);
behaviour is byte-for-byte identical:

```
sha256  c3f28c6045f2adcf346c80eef73b1944707914a95cfc809c18211c3ed43d3738
```

It is the code already running on every host that installed v1.1.0, and it is
what performs the update to a newer release: `row-template update` runs the
*installed* library, so a new release is installed by the old updater. That
updater copies only `template.html`, `VERSION`, `lib/row-template.sh` and
`bin/row-template` from the payload. `tests/release.test.mjs` runs this file
against the real release tarball to prove an upgrade from v1.1.0 works.

It is kept here, rather than read from git history, so the test also runs in a
shallow clone or an unpacked archive. The test pins the checksum above.
