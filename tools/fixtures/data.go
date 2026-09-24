package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// Byte ladder as the panel uses it: FormatTraffic divides by 1024.
const (
	kb = int64(1024)
	mb = 1024 * kb
	gb = 1024 * mb
)

func days(n int64) int64 { return n * 86400 }

// The fixture clock.
//
// Every fixture derives its expire and lastOnline from one instant, so what the
// page renders moves with the wall clock. expire is now+45d, which the page
// shows as a calendar date: the same fixture renders a different day tomorrow.
// That is right for interactive use and fatal for the committed documentation
// screenshots, which could not be reproduced a day later with the product
// unchanged — the whole preview set would appear to change for no reason.
//
// ROW_FIXTURE_NOW pins that instant. Unset, nothing changes at all: the
// fixtures are generated from time.Now() exactly as they always were. Set, they
// are generated from the supplied instant, so a capture taken today matches one
// taken next week. The value is read once, at process start, so a single server
// run can never mix two instants between requests.
//
// It is an environment variable rather than a flag because the only caller is
// the documentation capture, which spawns this server itself. The product, the
// installer and the release payload never set it and never read it.
const fixtureNowEnv = "ROW_FIXTURE_NOW"

// fixedNow is the pinned instant, or the zero Time when the clock is live.
var fixedNow = mustFixtureNow(os.Getenv(fixtureNowEnv))

// parseFixtureNow accepts Unix seconds — the unit the panel itself uses for
// expire and lastOnline — or an RFC3339 instant. Anything else is an error
// rather than a silent fall back to the wall clock: a capture that quietly used
// the wrong instant would be worse than one that refused to run.
func parseFixtureNow(raw string) (time.Time, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return time.Time{}, nil
	}
	if n, err := strconv.ParseInt(raw, 10, 64); err == nil {
		return time.Unix(n, 0).UTC(), nil
	}
	if t, err := time.Parse(time.RFC3339, raw); err == nil {
		return t.UTC(), nil
	}
	return time.Time{}, fmt.Errorf(
		"%s: %q is neither Unix seconds nor an RFC3339 instant", fixtureNowEnv, raw)
}

func mustFixtureNow(raw string) time.Time {
	t, err := parseFixtureNow(raw)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	return t
}

// fixtureClock is the instant the fixture data is generated from. It is the
// live clock unless ROW_FIXTURE_NOW pinned it, so the default path is
// byte-for-byte the behaviour this file had before the override existed.
func fixtureClock() time.Time {
	if !fixedNow.IsZero() {
		return fixedNow
	}
	return time.Now()
}

// The share-link builders below produce the exact byte shapes the panel emits,
// so the Explorer's client-side parser is exercised here on real inputs rather
// than on the "vless://example" placeholders it used to see. A fragment remark
// is QueryEscaped upstream (space -> "+", non-ASCII -> %XX), which frag mirrors.
func frag(name string) string { return url.QueryEscape(name) }

// vmess carries its remark in the JSON "ps" field of a base64 body.
func vmessLink(ps, add string) string {
	obj := map[string]string{
		"v": "2", "ps": ps, "add": add, "port": "443",
		"id": "11111111-2222-3333-4444-555555555555", "aid": "0",
		"net": "ws", "type": "none", "host": add, "path": "/", "tls": "tls",
	}
	b, _ := json.Marshal(obj)
	return "vmess://" + base64.StdEncoding.EncodeToString(b)
}

// AmneziaWG's vpn:// is a base64url .conf whose remark is its first comment
// line. RawURLEncoding (URL-safe, unpadded) is the alphabet the app writes.
func awgLink(remark string) string {
	conf := "# " + remark + "\n" +
		"[Interface]\nPrivateKey = aFakePrivateKeyForFixturesOnly000000000000=\n" +
		"Address = 10.8.0.2/32\nDNS = 1.1.1.1\n" +
		"Jc = 4\nJmin = 40\nJmax = 70\nS1 = 15\nS2 = 66\n" +
		"H1 = 1234567\nH2 = 2345678\nH3 = 3456789\nH4 = 4567890\n" +
		"[Peer]\nPublicKey = aFakePublicKeyForFixturesOnly0000000000000=\n" +
		"Endpoint = awg.example.com:51820\nAllowedIPs = 0.0.0.0/0"
	return "vpn://" + base64.RawURLEncoding.EncodeToString([]byte(conf))
}

// A realistic set covering every protocol the Explorer recognises, each with a
// country flag in its remark except MTProto, which carries no remark at all.
func baseLinks() []string {
	return []string{
		"vless://11111111-2222-3333-4444-555555555555@de.example.com:443?type=ws&security=tls&host=de.example.com&path=%2Fws#" + frag("🇩🇪 Frankfurt"),
		vmessLink("🇫🇷 Paris", "fr.example.com"),
		"trojan://aFakePassword@nl.example.com:443?security=tls&type=tcp#" + frag("🇳🇱 Rotterdam"),
		"ss://YWVzLTI1Ni1nY206YUZha2VQYXNzd29yZA==@jp.example.com:8388#" + frag("🇯🇵 Tokyo"),
		"hysteria2://aFakeAuth@us.example.com:443?sni=us.example.com&insecure=0#" + frag("🇺🇸 New York"),
		"hysteria://sg.example.com:443?protocol=udp&auth=aFakeAuth&peer=sg.example.com&upmbps=50&downmbps=200#" + frag("🇸🇬 Singapore"),
		"wireguard://aFakePrivKeyForFixtures000000000000=@wg.example.com:51820?publickey=aFakePubKeyForFixtures0000000000=&address=10.0.0.2%2F32#" + frag("🇳🇱 Amsterdam WG"),
		awgLink("🇸🇪 Stockholm"),
		"tg://proxy?server=91.108.56.1&port=443&secret=ee1234567890abcdef1234567890abcdef7777772e676f6f676c652e636f6d",
	}
}

// base returns the same 22-key view model that SubService hands to the
// template. Every fixture starts from it and overrides only what it is about,
// so a missing key in a fixture is a mistake rather than a variation.
func base() map[string]any {
	now := fixtureClock()
	return map[string]any{
		"sId":           "e3b0c44298fc1c14",
		"enabled":       true,
		"isOnline":      true,
		"download":      "32.00GB",
		"upload":        "6.40GB",
		"total":         "100.00GB",
		"used":          "38.40GB",
		"remained":      "61.60GB",
		"expire":        now.Unix() + days(45),
		"lastOnline":    now.UnixMilli() - 90*1000,
		"downloadByte":  int64(34359738368),
		"uploadByte":    int64(6871947674),
		"totalByte":     100 * gb,
		"subUrl":        "https://sub.example.com/sub/e3b0c44298fc1c14",
		"subJsonUrl":    "https://sub.example.com/json/e3b0c44298fc1c14",
		"subClashUrl":   "https://sub.example.com/clash/e3b0c44298fc1c14",
		"subTitle":      "Premium 100 GB",
		"subSupportUrl": "https://t.me/example_support",
		"announce":      "Scheduled maintenance on Sunday, 03:00-04:00 UTC.\nReconnect if your client drops during the window.",
		"links":         baseLinks(),
		"emails":        []string{"alice@example.com"},
		"datepicker":    "gregorian",
	}
}

func with(over map[string]any) map[string]any {
	m := base()
	for k, v := range over {
		m[k] = v
	}
	return m
}

func fixtures() []fixture {
	now := fixtureClock()

	// The clock-time caption of UX-SPEC 14.1 has no other coverage: every other
	// fixture expires days away, never within a calendar day. Run late in the
	// evening this lands on tomorrow rather than today, which is the adjacent
	// row of the same table and renders the same caption.
	soon := time.Date(now.Year(), now.Month(), now.Day(), 23, 41, 0, 0, now.Location())
	if !soon.After(now) {
		soon = soon.Add(24 * time.Hour)
	}

	return []fixture{
		{
			// Marketing capture only: a clean, obviously-fictional service brand
			// ("Aurora") over the full protocol spread, so the README screenshots
			// show a white-label page with a real config list — flags, names,
			// protocol badges, View/Copy — and no plan-descriptor doubling as a
			// brand. Nothing here is real: example.com hosts, placeholder secrets.
			Name:   "00-showcase",
			Title:  "Showcase (README capture)",
			Data:   with(map[string]any{"subTitle": "Aurora"}),
			Expect: []string{`data-enabled="1"`, `data-online="1"`, `id="links-source"`, "de.example.com:443?type=ws"},
		},
		{
			Name:   "01-active-online",
			Title:  "Active, online",
			Data:   base(),
			Expect: []string{`data-enabled="1"`, `data-online="1"`, ">Enabled<", "38.40GB", `id="links-source"`, "de.example.com:443?type=ws", "tg://proxy?server=91.108.56.1"},
		},
		{
			Name:  "02-active-offline",
			Title: "Active, last seen earlier",
			Data: with(map[string]any{
				"isOnline":     false,
				"lastOnline":   now.UnixMilli() - 2*3600*1000,
				"used":         "12.50GB",
				"total":        "50.00GB",
				"remained":     "37.50GB",
				"download":     "10.00GB",
				"upload":       "2.50GB",
				"downloadByte": 10 * gb,
				"uploadByte":   int64(2684354560),
				"totalByte":    50 * gb,
			}),
			Expect: []string{`data-enabled="1"`, `data-online="0"`, ">Enabled<"},
		},
		{
			// Disabled while the node still reports traffic: health must win.
			Name:  "03-disabled",
			Title: "Disabled (reported online)",
			Data: with(map[string]any{
				"enabled":      false,
				"isOnline":     true,
				"used":         "5.25GB",
				"total":        "20.00GB",
				"remained":     "14.75GB",
				"totalByte":    20 * gb,
				"downloadByte": int64(4831838208),
				"uploadByte":   int64(805306368),
			}),
			Expect: []string{`data-enabled="0"`, `data-online="1"`, ">Disabled<"},
			Reject: []string{">Enabled<"},
		},
		{
			Name:  "04-expired",
			Title: "Expired (reported online)",
			Data: with(map[string]any{
				"expire":       now.Unix() - days(6),
				"isOnline":     true,
				"used":         "72.10GB",
				"remained":     "27.90GB",
				"download":     "60.00GB",
				"upload":       "12.10GB",
				"downloadByte": 60 * gb,
				"uploadByte":   int64(12993276314),
			}),
			Expect: []string{`data-enabled="1"`, ">Enabled<"},
		},
		{
			Name:  "05-traffic-exhausted",
			Title: "Traffic limit reached",
			Data: with(map[string]any{
				"used":         "50.00GB",
				"total":        "50.00GB",
				"remained":     "0.00B",
				"download":     "42.00GB",
				"upload":       "8.00GB",
				"downloadByte": 42 * gb,
				"uploadByte":   8 * gb,
				"totalByte":    50 * gb,
			}),
			Expect: []string{`data-total-byte="53687091200"`, "50.00GB"},
		},
		{
			Name:  "06-unlimited-traffic",
			Title: "Unlimited traffic",
			Data: with(map[string]any{
				"total":        "∞",
				"used":         "2.75GB",
				"remained":     "",
				"download":     "2.25GB",
				"upload":       "0.50GB",
				"downloadByte": int64(2415919104),
				"uploadByte":   int64(536870912),
				"totalByte":    int64(0),
			}),
			Expect: []string{`data-total-byte="0"`, ">used<"},
			// The catalogue island carries every phrase, so the rejection has to
			// name the shell's own markup rather than the wording.
			Reject: []string{`used of <span`},
		},
		{
			Name:   "07-never-expires",
			Title:  "Never expires",
			Data:   with(map[string]any{"expire": int64(0)}),
			Expect: []string{`data-expire="0"`, "Never expires"},
		},
		{
			// A negative expire is a duration, not a date: the clock starts on
			// the first connection.
			Name:  "08-start-after-first-use",
			Title: "Starts on first connection",
			Data: with(map[string]any{
				"expire":       -days(30),
				"isOnline":     false,
				"lastOnline":   int64(0),
				"used":         "0.00B",
				"remained":     "100.00GB",
				"download":     "0.00B",
				"upload":       "0.00B",
				"downloadByte": int64(0),
				"uploadByte":   int64(0),
			}),
			Expect: []string{`data-expire="-2592000"`, "Starts on first connection"},
		},
		{
			Name:  "09-zero-total",
			Title: "No limit, nothing used yet",
			Data: with(map[string]any{
				"total":        "∞",
				"used":         "0.00B",
				"remained":     "",
				"download":     "0.00B",
				"upload":       "0.00B",
				"downloadByte": int64(0),
				"uploadByte":   int64(0),
				"totalByte":    int64(0),
				"lastOnline":   int64(0),
				"isOnline":     false,
			}),
			Expect: []string{`data-total-byte="0"`, `data-last-online="0"`},
		},
		{
			Name:   "10-no-support",
			Title:  "No support link",
			Data:   with(map[string]any{"subSupportUrl": ""}),
			Reject: []string{`id="support-link"`},
		},
		{
			Name:   "11-no-announcement",
			Title:  "No announcement",
			Data:   with(map[string]any{"announce": ""}),
			Reject: []string{"Scheduled maintenance"},
		},
		{
			// The monogram path: two initials derived from the service name.
			Name:  "12-no-logo",
			Title: "Branded, no logo file",
			Data:  base(),
			Brand: &branding{ServiceName: "Katze-VPN", SupportURL: "https://t.me/katze_support"},
		},
		{
			Name:  "13-long-service-name",
			Title: "Long names everywhere",
			Data: with(map[string]any{
				"subTitle": "Premium Unlimited Residential Gigabit Plan - Tier Three Extended",
				"emails":   []string{"very.long.customer.address.for.testing@subdomain.example.com"},
				// Long enough to be clamped on a phone, so the show-more toggle
				// has a fixture that actually produces it.
				"announce": "Scheduled maintenance on Sunday, 03:00-04:00 UTC. Two of the three entry nodes will be rebuilt during the window and connections through them will drop once.\nIf your client does not reconnect on its own, copy the subscription link again and refresh the profile; the link itself does not change.\nSupport replies within a few hours on t.me/example_support during the weekend.",
			}),
			Brand: &branding{
				ServiceName: "Northern Lights Secure Networking Cooperative",
				SupportURL:  "https://support.northern-lights.example.com/help/contact",
			},
		},
		{
			Name:  "14-persian",
			Title: "Persian, Jalali calendar",
			Data: with(map[string]any{
				"subTitle":   "اشتراک ویژه",
				"announce":   "تعمیرات برنامه\u200cریزی\u200cشده روز یکشنبه از ساعت ۰۳:۰۰ تا ۰۴:۰۰ به وقت UTC انجام می\u200cشود.",
				"datepicker": "jalali",
				"emails":     []string{"سارا@example.com"},
			}),
			Brand:  &branding{ServiceName: "کاتزه وی\u200cپی\u200cان", SupportURL: "https://t.me/katze_support"},
			Expect: []string{`data-datepicker="jalali"`},
		},
		{
			Name:  "15-arabic",
			Title: "Arabic",
			Data: with(map[string]any{
				"subTitle": "الاشتراك المميز",
				"announce": "صيانة مجدولة يوم الأحد من الساعة 03:00 إلى 04:00 بالتوقيت العالمي.",
				"emails":   []string{"omar@example.com"},
			}),
			Brand: &branding{ServiceName: "شبكة الأمان", SupportURL: "mailto:help@example.com"},
		},
		{
			Name:  "16-chinese",
			Title: "Chinese",
			Data: with(map[string]any{
				"subTitle": "高级订阅",
				"announce": "计划维护：周日 03:00 至 04:00（UTC）。如客户端断开，请重新连接。",
				"emails":   []string{"li.wei@example.com"},
			}),
			Brand: &branding{ServiceName: "极速网络", SupportURL: "https://t.me/example_support"},
		},
		{
			// Same markup as 01; the dev server refuses ?format=info so the
			// page has to keep the server-rendered values.
			Name:     "17-live-info-failure",
			Title:    "Live refresh failing",
			Data:     base(),
			InfoFail: true,
			Expect:   []string{`data-enabled="1"`},
		},
		{
			// Every optional value is wrong in a different way. The escaping
			// backstop is expected to fire on the support URL.
			Name:  "18-malformed-optional-values",
			Title: "Malformed values",
			Data: with(map[string]any{
				"download":      "",
				"upload":        "",
				"total":         "",
				"used":          "",
				"remained":      "",
				"downloadByte":  int64(-1),
				"uploadByte":    int64(0),
				"totalByte":     int64(-5),
				"expire":        int64(99999999999999),
				"lastOnline":    now.UnixMilli() + 7*24*3600*1000,
				"subUrl":        "",
				"subJsonUrl":    "",
				"subClashUrl":   "",
				"subTitle":      "   ",
				"subSupportUrl": "javascript:alert(document.domain)",
				"announce":      "<script>alert(1)</script>\nPlan A & Plan B <b>both</b> renew today.",
				"links":         []string{},
				"emails":        []string{"", "   ", "user@example.com"},
				"datepicker":    "not-a-calendar",
			}),
			AllowZgo: true,
			Expect:   []string{"#ZgotmplZ", "&lt;script&gt;", "&amp;"},
			Reject:   []string{"<script>alert(1)"},
		},
		{
			// A stopped account that has never connected: UX-SPEC 12.3 asks for
			// no last-seen line at all rather than a sentence about an absence.
			Name:  "19-stopped-never-connected",
			Title: "Disabled, never connected",
			Data: with(map[string]any{
				"enabled":      false,
				"isOnline":     false,
				"lastOnline":   int64(0),
				"used":         "0.00B",
				"remained":     "100.00GB",
				"download":     "0.00B",
				"upload":       "0.00B",
				"downloadByte": int64(0),
				"uploadByte":   int64(0),
			}),
			Expect: []string{`data-last-online="0"`, `data-enabled="0"`},
		},
		{
			Name:  "20-expires-today",
			Title: "Expires within the day",
			Data: with(map[string]any{
				"expire":       soon.Unix(),
				"used":         "91.20GB",
				"remained":     "8.80GB",
				"download":     "76.00GB",
				"upload":       "15.20GB",
				"downloadByte": int64(81604378624),
				"uploadByte":   int64(16320875725),
			}),
			Expect: []string{`data-enabled="1"`, ">Enabled<"},
		},
		{
			// One clearly-named configuration per recognised protocol, each with
			// its own flag: the Explorer's showcase and the per-protocol emission
			// check. The MTProto link carries a secret but no remark.
			Name:  "21-explorer-all-protocols",
			Title: "Explorer: every protocol",
			Data: with(map[string]any{
				"links": []string{
					"vless://11111111-2222-3333-4444-555555555555@de.example.com:443?type=tcp&security=reality&pbk=aFakeKey&fp=chrome#" + frag("🇩🇪 VLESS Reality"),
					vmessLink("🇬🇧 VMess London", "gb.example.com"),
					"trojan://aFakePassword@fr.example.com:443?security=tls#" + frag("🇫🇷 Trojan Paris"),
					"ss://YWVzLTI1Ni1nY206YUZha2VQYXNzd29yZA==@jp.example.com:8388#" + frag("🇯🇵 SS Tokyo"),
					"hysteria2://aFakeAuth@us.example.com:443?sni=us.example.com#" + frag("🇺🇸 Hysteria2 NY"),
					"hysteria://ca.example.com:443?auth=aFakeAuth&peer=ca.example.com#" + frag("🇨🇦 Hysteria Toronto"),
					"wireguard://aFakePrivKey000000000000000000000000=@wg.example.com:51820?publickey=aFakePubKey00000000000000000000=#" + frag("🇨🇭 WireGuard Zurich"),
					awgLink("🇸🇪 AmneziaWG Stockholm"),
					"tg://proxy?server=149.154.167.51&port=443&secret=ee1234567890abcdef1234567890abcdef7777772e676f6f676c652e636f6d",
				},
			}),
			Expect: []string{"de.example.com:443?type=tcp", "vmess://", "wireguard://", "vpn://", "tg://proxy?server=149.154.167.51"},
		},
		{
			// Adversarial, deliberately un-escaped remarks — the shape a hostile
			// or malformed link takes when its fragment was never QueryEscaped.
			// links-source is element content, so html/template turns the angle
			// brackets and the ampersand into entities; the raw script text must
			// never reach the document as markup. The client parser (config.test
			// .mjs) is what drops the http/javascript/data entries — here they
			// only have to survive as inert, escaped text without breaking the
			// page, and the browser proves textContent renders them harmlessly.
			Name:  "22-explorer-hostile-links",
			Title: "Explorer: hostile remarks",
			Data: with(map[string]any{
				"links": []string{
					"vless://u@h1.example.com:443#<script>alert(1)</script>",
					"trojan://p@h2.example.com:443#Tom & Jerry <3",
					"vless://u@h3.example.com:443#\"><img src=x onerror=alert(4)>",
					"javascript:alert(document.domain)",
					"http://plain.example.com/not-a-config",
					"data:text/html,<b>x</b>",
					"ss://not-valid-base64!!!@h4.example.com:8388#Broken SS",
				},
			}),
			Expect: []string{"&lt;script&gt;alert(1)&lt;/script&gt;", "Tom &amp; Jerry &lt;3", "&#34;&gt;&lt;img", "h1.example.com", "h3.example.com"},
			Reject: []string{"<script>alert(1)", "<img src=x onerror", "<b>x</b>"},
		},
		{
			// Bidirectional remarks: RTL names beside Latin ones. The Explorer
			// isolates each name and forces the credential itself to ltr; here the
			// point is that the mixed-direction text emits intact.
			Name:  "23-explorer-bidi-names",
			Title: "Explorer: bidi names",
			Data: with(map[string]any{
				"links": []string{
					"vless://u@ir.example.com:443?type=ws#" + frag("🇮🇷 سرور تهران"),
					"trojan://p@sa.example.com:443#" + frag("🇸🇦 خادم الرياض"),
					vmessLink("🇮🇷 وی\u200cمس ۱", "ir2.example.com"),
					"ss://YWVzLTI1Ni1nY206cA==@il.example.com:8388#" + frag("mixed اختلاط 42"),
				},
			}),
			Expect: []string{"ir.example.com", "sa.example.com", "il.example.com"},
		},
		{
			// The same link three times, interleaved with distinct ones. The
			// server emits them all; the parser collapses exact duplicates to a
			// single row (config.test.mjs proves the collapse).
			Name:  "24-explorer-duplicates",
			Title: "Explorer: duplicate links",
			Data: with(map[string]any{
				"links": []string{
					"vless://u@dup.example.com:443#" + frag("🇺🇸 Same"),
					"vless://u@dup.example.com:443#" + frag("🇺🇸 Same"),
					"trojan://p@other.example.com:443#" + frag("🇬🇧 Other"),
					"vless://u@dup.example.com:443#" + frag("🇺🇸 Same"),
				},
			}),
			Expect: []string{"dup.example.com", "other.example.com"},
		},
		{
			// Names with no country flag at all, and one with an unassigned
			// regional-indicator pair (ZZ): both take the monogram fallback in the
			// browser rather than an empty or invented badge.
			Name:  "25-explorer-monogram-fallback",
			Title: "Explorer: monogram fallback",
			Data: with(map[string]any{
				"links": []string{
					"vless://u@a.example.com:443#" + frag("Fast Reality Node"),
					"trojan://p@b.example.com:443#" + frag("🇿🇿 Nowhere"),
					"ss://YWVzOnA=@c.example.com:8388#" + frag("⚡ Turbo 🔥"),
					"vless://u@d.example.com:443", // no fragment: numbered fallback
				},
			}),
			Expect: []string{"a.example.com", "b.example.com", "c.example.com", "d.example.com"},
		},
		{
			// A single configuration: below the search threshold, so the filter
			// field stays hidden in the browser.
			Name:  "26-explorer-single",
			Title: "Explorer: one configuration",
			Data: with(map[string]any{
				"links": []string{"vless://u@solo.example.com:443?type=ws#" + frag("🇩🇪 Only Server")},
			}),
			Expect: []string{"solo.example.com"},
		},
		{
			// Fifty configurations: past the search threshold, and enough to
			// exercise the list build at a realistic subscription size.
			Name:   "27-explorer-fifty",
			Title:  "Explorer: fifty configurations",
			Data:   with(map[string]any{"links": manyLinks(50)}),
			Expect: []string{"n01.example.com", "n50.example.com"},
		},
		{
			// One hundred configurations: the stress case for the client-side
			// build and filter.
			Name:   "28-explorer-hundred",
			Title:  "Explorer: one hundred configurations",
			Data:   with(map[string]any{"links": manyLinks(100)}),
			Expect: []string{"n001.example.com", "n100.example.com"},
		},
		{
			// Very long remarks: the row name is clamped to a single line in the
			// browser; here it only has to emit whole.
			Name:  "29-explorer-long-names",
			Title: "Explorer: long names",
			Data: with(map[string]any{
				"links": []string{
					"vless://u@long.example.com:443?type=ws#" + frag("🇳🇱 Premium Residential Gigabit Reality Node — Tier Three Extended, Amsterdam Datacenter West"),
					"trojan://p@long2.example.com:443#" + frag("🇩🇪 Frankfurt Failover Secondary Path With A Deliberately Overlong Descriptive Label"),
				},
			}),
			Expect: []string{"long.example.com", "long2.example.com"},
		},
		{
			// No configurations at all: the Explorer section stays hidden and the
			// links container is empty.
			Name:   "30-explorer-empty",
			Title:  "Explorer: no configurations",
			Data:   with(map[string]any{"links": []string{}}),
			Expect: []string{`id="links-source"`},
			Reject: []string{"<span>vless"},
		},
	}
}

// manyLinks builds n distinct vless configurations with zero-padded hostnames,
// alternating flags, so a large-list fixture can assert on its first and last
// entry. The width of the index matches the count so ordering reads naturally.
func manyLinks(n int) []string {
	flags := []string{"🇩🇪", "🇺🇸", "🇯🇵", "🇳🇱", "🇸🇬", "🇫🇷", "🇬🇧", "🇸🇪"}
	width := len(fmt.Sprintf("%d", n))
	out := make([]string, 0, n)
	for i := 1; i <= n; i++ {
		host := fmt.Sprintf("n%0*d.example.com", width, i)
		name := fmt.Sprintf("%s Node %d", flags[i%len(flags)], i)
		out = append(out, "vless://u@"+host+":443?type=ws&security=tls#"+frag(name))
	}
	return out
}
