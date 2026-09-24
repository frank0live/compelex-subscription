package main

import (
	"strings"
	"testing"
	"time"
)

// The fixture clock override exists so the committed documentation screenshots
// can be reproduced on a later day. These tests pin both halves of the
// contract: with ROW_FIXTURE_NOW unset the fixtures still follow the wall
// clock, and with it set they follow the supplied instant exactly — never
// approximately, because expire is rendered as a calendar date and a few
// seconds of drift across a midnight boundary would move it by a whole day.

// pinClock installs a fixed instant for the duration of one test and restores
// whatever was there before, so the tests cannot leak state into each other.
func pinClock(t *testing.T, at time.Time) {
	t.Helper()
	prev := fixedNow
	fixedNow = at
	t.Cleanup(func() { fixedNow = prev })
}

func unpinClock(t *testing.T) {
	t.Helper()
	pinClock(t, time.Time{})
}

func TestParseFixtureNowEmptyMeansLiveClock(t *testing.T) {
	for _, raw := range []string{"", "   ", "\t\n"} {
		got, err := parseFixtureNow(raw)
		if err != nil {
			t.Fatalf("parseFixtureNow(%q) errored: %v", raw, err)
		}
		if !got.IsZero() {
			t.Fatalf("parseFixtureNow(%q) = %v, want the zero Time", raw, got)
		}
	}
}

func TestParseFixtureNowAcceptsUnixSecondsAndRFC3339(t *testing.T) {
	const unix = int64(1789819200) // 2026-09-19T12:00:00Z
	cases := []struct {
		raw  string
		want time.Time
	}{
		{"1789819200", time.Unix(unix, 0).UTC()},
		{" 1789819200 ", time.Unix(unix, 0).UTC()},
		{"2026-09-19T12:00:00Z", time.Unix(unix, 0).UTC()},
		{"2026-09-19T15:30:00+03:30", time.Unix(unix, 0).UTC()},
	}
	for _, c := range cases {
		got, err := parseFixtureNow(c.raw)
		if err != nil {
			t.Fatalf("parseFixtureNow(%q) errored: %v", c.raw, err)
		}
		if !got.Equal(c.want) {
			t.Fatalf("parseFixtureNow(%q) = %v, want %v", c.raw, got, c.want)
		}
	}
}

// An unusable value must fail loudly. Quietly falling back to the wall clock
// would produce a capture that looks successful and is not reproducible, which
// is the exact failure this override was added to remove.
func TestParseFixtureNowRejectsGarbage(t *testing.T) {
	for _, raw := range []string{"yesterday", "2026-09-19", "19/09/2026", "12:00", "1e9", "null"} {
		if got, err := parseFixtureNow(raw); err == nil {
			t.Fatalf("parseFixtureNow(%q) = %v, want an error", raw, got)
		} else if !strings.Contains(err.Error(), fixtureNowEnv) {
			t.Fatalf("parseFixtureNow(%q) error should name %s, got: %v", raw, fixtureNowEnv, err)
		}
	}
}

// With nothing pinned, the data still tracks the live clock. This is the
// behaviour every existing fixture and every interactive run depends on.
func TestUnpinnedClockTracksWallClock(t *testing.T) {
	unpinClock(t)

	before := time.Now().Unix()
	got := fixtureClock().Unix()
	after := time.Now().Unix()
	if got < before || got > after {
		t.Fatalf("unpinned fixtureClock() = %d, want between %d and %d", got, before, after)
	}

	expire, ok := base()["expire"].(int64)
	if !ok {
		t.Fatal("base() has no int64 expire")
	}
	if expire < before+days(45) || expire > after+days(45) {
		t.Fatalf("unpinned base() expire = %d, want between %d and %d",
			expire, before+days(45), after+days(45))
	}
}

// With an instant pinned, expire and lastOnline are exact arithmetic on it and
// nothing else. This is the guarantee the preview capture relies on.
func TestPinnedClockDrivesExpireExactly(t *testing.T) {
	at := time.Date(2026, 9, 19, 12, 0, 0, 0, time.UTC)
	pinClock(t, at)

	if got := fixtureClock(); !got.Equal(at) {
		t.Fatalf("fixtureClock() = %v, want %v", got, at)
	}

	d := base()
	if got := d["expire"].(int64); got != at.Unix()+days(45) {
		t.Fatalf("base() expire = %d, want %d", got, at.Unix()+days(45))
	}
	if got := d["lastOnline"].(int64); got != at.UnixMilli()-90*1000 {
		t.Fatalf("base() lastOnline = %d, want %d", got, at.UnixMilli()-90*1000)
	}
}

// The captured fixture is 00-showcase, which is base() with one field
// overridden. It has to inherit the pinned expire rather than compute its own.
func TestPinnedClockReachesTheShowcaseFixture(t *testing.T) {
	at := time.Date(2026, 9, 19, 12, 0, 0, 0, time.UTC)
	pinClock(t, at)

	var showcase *fixture
	all := fixtures()
	for i := range all {
		if all[i].Name == "00-showcase" {
			showcase = &all[i]
			break
		}
	}
	if showcase == nil {
		t.Fatal("00-showcase is missing from the fixture set")
	}
	if got := showcase.Data["expire"].(int64); got != at.Unix()+days(45) {
		t.Fatalf("showcase expire = %d, want %d", got, at.Unix()+days(45))
	}
	if got := showcase.Data["subTitle"]; got != "Aurora" {
		t.Fatalf("showcase subTitle = %v, want Aurora", got)
	}
}

// The point of the override: two generations from the same instant are
// identical, however much wall-clock time passes between them.
func TestPinnedClockIsStableAcrossGenerations(t *testing.T) {
	at := time.Date(2026, 9, 19, 12, 0, 0, 0, time.UTC)
	pinClock(t, at)

	first := fixtures()
	time.Sleep(20 * time.Millisecond)
	second := fixtures()

	if len(first) != len(second) {
		t.Fatalf("fixture counts differ: %d vs %d", len(first), len(second))
	}
	for i := range first {
		if first[i].Name != second[i].Name {
			t.Fatalf("fixture %d renamed: %q vs %q", i, first[i].Name, second[i].Name)
		}
		for _, key := range []string{"expire", "lastOnline"} {
			a, b := first[i].Data[key], second[i].Data[key]
			if a != b {
				t.Fatalf("%s.%s drifted between generations: %v vs %v", first[i].Name, key, a, b)
			}
		}
	}
}

// Every fixture that derives a date from the clock must do so from the pinned
// instant. 04-expired and 20-expires-today are the other two that use it.
func TestPinnedClockReachesEveryDatedFixture(t *testing.T) {
	at := time.Date(2026, 9, 19, 12, 0, 0, 0, time.UTC)
	pinClock(t, at)

	byName := map[string]fixture{}
	for _, f := range fixtures() {
		byName[f.Name] = f
	}

	if got := byName["04-expired"].Data["expire"].(int64); got != at.Unix()-days(6) {
		t.Fatalf("04-expired expire = %d, want %d", got, at.Unix()-days(6))
	}
	if got := byName["02-active-offline"].Data["lastOnline"].(int64); got != at.UnixMilli()-2*3600*1000 {
		t.Fatalf("02-active-offline lastOnline = %d, want %d",
			got, at.UnixMilli()-2*3600*1000)
	}

	// 20-expires-today is the one fixture that uses the local calendar day, so
	// its expectation is expressed against the pinned instant's own day.
	soon := byName["20-expires-today"].Data["expire"].(int64)
	want := time.Date(at.Year(), at.Month(), at.Day(), 23, 41, 0, 0, at.Location())
	if !want.After(at) {
		want = want.Add(24 * time.Hour)
	}
	if soon != want.Unix() {
		t.Fatalf("20-expires-today expire = %d, want %d", soon, want.Unix())
	}
}
