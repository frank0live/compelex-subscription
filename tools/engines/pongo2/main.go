// Command pongo2 renders a Row-Template shell the way Rebecca renders its
// subscription page, so the test suite can check a shell against the real
// template engine rather than against a model of it.
//
// It is TEST TOOLING. Nothing here ships in a release, and nothing here is
// Rebecca's code: Rebecca is AGPL-3.0 and Row-Template is MIT, so this is an
// independent implementation of the behaviour Rebecca documents and exhibits,
// written from the audit in docs/design/REBECCA-ADAPTER-AUDIT.md. The engine
// itself is the real one -- github.com/flosch/pongo2/v6 at v6.1.0, the exact
// version Rebecca pins in its go.mod (pongo2 is MIT).
//
// What Rebecca does to a page template, and what this therefore reproduces:
//
//  1. It rewrites the template text before parsing it (a compatibility pass
//     for templates written for the Python panels): whitespace inside every
//     {{ }} and {% %} tag is collapsed, a handful of Python spellings are
//     mapped to pongo2 ones, and `user.status == 'active'` is widened to also
//     accept on_hold and placeholder users. The pass is applied to the WHOLE
//     document, inline CSS and JavaScript included, which is why a shell must
//     never contain a delimiter outside its own tags.
//  2. It registers three filters globally: bytesformat, datetime and int.
//  3. It renders with pongo2's defaults. Autoescape is ON by default in pongo2
//     and Rebecca never turns it off.
//  4. The context is a map: `user` (itself a map whose online_at is a *string
//     and whose expire/data_limit are int64 or nil), `links`, `links_text`,
//     `usage_url`, `support_url`, `token`, `current_timestamp` (epoch seconds,
//     int64) and `remaining_days`.
//
// Usage:
//
//	pongo2 -batch jobs.json
//
// jobs.json is [{"template": PATH, "context": {...}, "out": PATH}, ...]. Each
// job is rendered and written to its out path; the first failure is printed
// and the command exits 1. Batch mode exists so a test run compiles and starts
// this program once, not once per page.
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/flosch/pongo2/v6"
)

type job struct {
	Template string          `json:"template"`
	Context  json.RawMessage `json:"context"`
	Out      string          `json:"out"`
}

var (
	tagPattern          = regexp.MustCompile(`(?s)(\{\{.*?\}\}|\{%.*?%\})`)
	setNowPattern       = regexp.MustCompile(`(?s)\{%\s*set\s+current_timestamp\s*=.*?%\}`)
	setRemainingPattern = regexp.MustCompile(`(?s)\{%\s*set\s+remaining_days\s*=.*?%\}`)
	pyCallFilter        = regexp.MustCompile(`\|\s*(datetime|bytesformat|int)\s*\([^)]*\)`)
	pyDefaultFilter     = regexp.MustCompile(`\|\s*default\s*\(([^)]*)\)`)
	clampPattern        = regexp.MustCompile(`\{\{\s*remaining_days\s*\|\s*int\s+if\s*\([^}]*remaining_days[^}]*\)\s*>\s*-?1\s+else\s+0\s*\}\}`)
	directLinksPattern  = regexp.MustCompile(`\{\{\s*user\.links\s*\}\}`)
)

// normalize applies the pre-parse rewrite described in the header, step 1.
func normalize(src string) string {
	out := tagPattern.ReplaceAllStringFunc(src, func(tag string) string {
		return strings.Join(strings.Fields(tag), " ")
	})
	out = strings.ReplaceAll(out, "user.status.value", "user.status")
	out = strings.ReplaceAll(out, "user.data_limit_reset_strategy.value", "user.data_limit_reset_strategy")
	out = setNowPattern.ReplaceAllString(out, "")
	out = setRemainingPattern.ReplaceAllString(out, "")
	out = strings.ReplaceAll(out, "datetime.now().timestamp()", "current_timestamp")
	out = strings.ReplaceAll(out, "now().timestamp()", "current_timestamp")
	out = pyCallFilter.ReplaceAllString(out, "| $1")
	out = pyDefaultFilter.ReplaceAllString(out, "| default:$1")
	out = clampPattern.ReplaceAllString(out, "{{ remaining_days | int }}")
	out = directLinksPattern.ReplaceAllString(out, "{{ links_text|safe }}")
	out = strings.ReplaceAll(out, "user.status == 'active'", "user.status == 'active' or user.status == 'on_hold' or user.placeholder")
	out = strings.ReplaceAll(out, `user.status == "active"`, `user.status == "active" or user.status == "on_hold" or user.placeholder`)
	return out
}

// bytesText formats a byte count the way Rebecca's bytesformat filter does:
// whole bytes below 1 KiB, two decimals above, binary units up to PB.
func bytesText(value int64) string {
	if value < 0 {
		value = 0
	}
	units := []string{"B", "KB", "MB", "GB", "TB", "PB"}
	size := float64(value)
	unit := 0
	for size >= 1024 && unit < len(units)-1 {
		size /= 1024
		unit++
	}
	if unit == 0 {
		return strconv.FormatInt(value, 10) + " " + units[0]
	}
	return strconv.FormatFloat(size, 'f', 2, 64) + " " + units[unit]
}

func registerFilters() error {
	filters := map[string]pongo2.FilterFunction{
		"bytesformat": func(in *pongo2.Value, _ *pongo2.Value) (*pongo2.Value, *pongo2.Error) {
			return pongo2.AsValue(bytesText(int64(in.Integer()))), nil
		},
		"datetime": func(in *pongo2.Value, _ *pongo2.Value) (*pongo2.Value, *pongo2.Error) {
			return pongo2.AsValue(time.Unix(int64(in.Integer()), 0).UTC().Format("2006-01-02 15:04:05")), nil
		},
		"int": func(in *pongo2.Value, _ *pongo2.Value) (*pongo2.Value, *pongo2.Error) {
			return pongo2.AsValue(in.Integer()), nil
		},
	}
	for name, fn := range filters {
		if err := pongo2.RegisterFilter(name, fn); err != nil && !strings.Contains(strings.ToLower(err.Error()), "already") {
			return err
		}
	}
	return nil
}

// plain turns decoded JSON (numbers as json.Number) into Go values with the
// types Rebecca puts in its context: integral numbers become int64, the rest
// float64. A float in place of an int64 would change pongo2's arithmetic
// (integer division) and is exactly the kind of drift this harness must not
// introduce.
func plain(v any) any {
	switch t := v.(type) {
	case json.Number:
		if i, err := t.Int64(); err == nil {
			return i
		}
		f, _ := t.Float64()
		return f
	case map[string]any:
		out := make(map[string]any, len(t))
		for k, x := range t {
			out[k] = plain(x)
		}
		return out
	case []any:
		// a list of strings stays a []string, as Rebecca's `links` is
		strs := make([]string, 0, len(t))
		for _, x := range t {
			s, ok := x.(string)
			if !ok {
				out := make([]any, len(t))
				for i, y := range t {
					out[i] = plain(y)
				}
				return out
			}
			strs = append(strs, s)
		}
		return strs
	default:
		return t
	}
}

// buildContext mirrors the SHAPE of Rebecca's page context: pointer-typed
// optional strings, int64-or-nil numbers, and the top-level keys.
func buildContext(raw json.RawMessage) (pongo2.Context, error) {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	var in map[string]any
	if err := dec.Decode(&in); err != nil {
		return nil, err
	}
	ctx := pongo2.Context{}
	for k, v := range in {
		ctx[k] = plain(v)
	}
	if u, ok := ctx["user"].(map[string]any); ok {
		// online_at is *string in Rebecca's UserDetail; nil when never seen.
		if s, ok := u["online_at"].(string); ok {
			v := s
			u["online_at"] = &v
		} else {
			var nilString *string
			u["online_at"] = nilString
		}
		// expire and data_limit reach the template only when positive.
		for _, key := range []string{"expire", "data_limit"} {
			if n, ok := u[key].(int64); !ok || n <= 0 {
				u[key] = nil
			}
		}
		ctx["user"] = u
	}
	return ctx, nil
}

func render(j job) error {
	src, err := os.ReadFile(j.Template)
	if err != nil {
		return err
	}
	text := strings.ReplaceAll(string(src), "\r\n", "\n")
	tpl, err := pongo2.FromString(normalize(text))
	if err != nil {
		return fmt.Errorf("parse %s: %w", j.Template, err)
	}
	ctx, err := buildContext(j.Context)
	if err != nil {
		return fmt.Errorf("context for %s: %w", j.Template, err)
	}
	out, err := tpl.Execute(ctx)
	if err != nil {
		return fmt.Errorf("execute %s: %w", j.Template, err)
	}
	return os.WriteFile(j.Out, []byte(out), 0o644)
}

func main() {
	batch := flag.String("batch", "", "a JSON file of render jobs")
	flag.Parse()
	if *batch == "" {
		fmt.Fprintln(os.Stderr, "usage: pongo2 -batch jobs.json")
		os.Exit(2)
	}
	if err := registerFilters(); err != nil {
		fmt.Fprintln(os.Stderr, "register filters:", err)
		os.Exit(1)
	}
	data, err := os.ReadFile(*batch)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	var jobs []job
	if err := json.Unmarshal(data, &jobs); err != nil {
		fmt.Fprintln(os.Stderr, "jobs:", err)
		os.Exit(1)
	}
	for _, j := range jobs {
		if err := render(j); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
	}
}
