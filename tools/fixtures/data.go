package main

import "time"

// Byte ladder as the panel uses it: FormatTraffic divides by 1024.
const (
	kb = int64(1024)
	mb = 1024 * kb
	gb = 1024 * mb
)

func days(n int64) int64 { return n * 86400 }

// base returns the same 22-key view model that SubService hands to the
// template. Every fixture starts from it and overrides only what it is about,
// so a missing key in a fixture is a mistake rather than a variation.
func base() map[string]any {
	now := time.Now()
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
		"links":         []string{"vless://example", "vmess://example"},
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
	now := time.Now()

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
			Name:   "01-active-online",
			Title:  "Active, online",
			Data:   base(),
			Expect: []string{`data-enabled="1"`, `data-online="1"`, ">Enabled<", "38.40GB"},
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
	}
}
