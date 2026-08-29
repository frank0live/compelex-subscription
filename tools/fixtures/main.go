// Renders the built artifact through Go's html/template exactly as the panel
// does, so that template-level regressions surface here rather than as a
// silent fallback to the panel's own subscription page.
//
//	go -C tools/fixtures run .                         check every fixture
//	go -C tools/fixtures run . -serve 127.0.0.1:8787   preview them
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"html/template"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

type branding struct {
	ServiceName string
	SupportURL  string
	Logo        string
}

type fixture struct {
	Name     string
	Title    string
	Data     map[string]any
	Brand    *branding
	Expect   []string
	Reject   []string
	AllowZgo bool
	InfoFail bool
}

var (
	brandingBlock = regexp.MustCompile(`(?s)/\* row:branding \*/.*?/\* row:branding end \*/`)
	boolLeak      = regexp.MustCompile(`data-[a-z-]+=" (?:true|false) "`)
	jsonIsland    = regexp.MustCompile(`(?s)<script type="application/json" id="i18n-data">(.*?)</script>`)
)

// jsString writes a JS string literal. json.Marshal already escapes <, >, &
// and the two Unicode line separators, which is precisely the set that could
// otherwise close the script element or break the literal. The installer will
// need the same rule, so it is proven here first.
func jsString(s string) string {
	out, err := json.Marshal(s)
	if err != nil {
		return `""`
	}
	return string(out)
}

// applyBranding performs the substitution the installer performs: the block
// between the two markers is replaced wholesale. HTML comments do not survive
// html/template, which is why the markers are JS comments.
func applyBranding(src string, b *branding) (string, error) {
	if b == nil {
		return src, nil
	}
	if !brandingBlock.MatchString(src) {
		return "", fmt.Errorf("branding block not found in the artifact")
	}
	repl := fmt.Sprintf(
		"/* row:branding */\n  var BRANDING = {\n    serviceName: %s,\n    supportUrl: %s,\n    logo: %s\n  };\n  /* row:branding end */",
		jsString(b.ServiceName), jsString(b.SupportURL), jsString(b.Logo))
	return brandingBlock.ReplaceAllLiteralString(src, repl), nil
}

// render reproduces the panel's own sequence: the artifact is written under the
// base name the panel looks for, parsed as a single file, and executed into a
// buffer before anything is inspected. A parse or execute error is exactly what
// makes the panel discard the theme and fall back to its built-in page, so it
// is a hard failure here rather than a warning.
//
// Both sides are kept on disk: index.html is the branded source the panel would
// have installed, rendered.html is what the browser would receive.
func render(artifact string, f fixture, dir string) (string, error) {
	src, err := applyBranding(artifact, f.Brand)
	if err != nil {
		return "", err
	}

	fixDir := filepath.Join(dir, f.Name)
	if err := os.MkdirAll(fixDir, 0o755); err != nil {
		return "", err
	}
	path := filepath.Join(fixDir, "index.html")
	if err := os.WriteFile(path, []byte(src), 0o644); err != nil {
		return "", err
	}

	t, err := template.ParseFiles(path)
	if err != nil {
		return "", fmt.Errorf("parse: %w", err)
	}
	var buf bytes.Buffer
	if err := t.Execute(&buf, f.Data); err != nil {
		return "", fmt.Errorf("execute: %w", err)
	}
	out := buf.String()
	if err := os.WriteFile(filepath.Join(fixDir, "rendered.html"), buf.Bytes(), 0o644); err != nil {
		return "", err
	}
	return out, nil
}

// check looks for the failures a browser would happily hide.
//
// html/template elides the contents of JS and CSS comments, so the branding
// markers themselves are gone from the output by design: what has to survive
// is the substituted value. The i18n island is re-parsed because it travels
// through the escaper as script content, and damage there would only show up
// as an untranslated page.
func check(f fixture, out string) []string {
	var bad []string
	add := func(format string, args ...any) {
		bad = append(bad, fmt.Sprintf(format, args...))
	}

	if strings.Contains(out, "{{") {
		add("a template action survived into the output")
	}
	if !f.AllowZgo && strings.Contains(out, "ZgotmplZ") {
		add("the escaper refused a value (ZgotmplZ)")
	}
	if m := boolLeak.FindString(out); m != "" {
		add("a Go boolean reached an attribute: %s", m)
	}
	if strings.Contains(out, "<script>alert") {
		add("announcement text reached the document unescaped")
	}
	if !strings.Contains(out, "var BRANDING") {
		add("the branding block did not survive rendering")
	}
	if f.Brand != nil && !strings.Contains(out, "serviceName: "+jsString(f.Brand.ServiceName)) {
		add("the injected service name did not survive rendering")
	}
	if m := jsonIsland.FindStringSubmatch(out); m == nil {
		add("the i18n island is no longer recognisable")
	} else if err := json.Unmarshal([]byte(m[1]), new(map[string]map[string]string)); err != nil {
		add("the i18n island no longer parses: %v", err)
	}
	for _, want := range f.Expect {
		if !strings.Contains(out, want) {
			add("missing: %s", want)
		}
	}
	for _, no := range f.Reject {
		if strings.Contains(out, no) {
			add("present but must not be: %s", no)
		}
	}
	return bad
}

func main() {
	tmplPath := flag.String("template", filepath.Join("..", "..", "template", "index.html"),
		"artifact to render")
	outDir := flag.String("out", "out", "directory the rendered pages are written to")
	addr := flag.String("serve", "", "preview the fixtures on this address instead of checking them")
	flag.Parse()

	artifact, err := os.ReadFile(*tmplPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "cannot read %s: %v\nBuild it first: node tools/build.mjs\n",
			*tmplPath, err)
		os.Exit(1)
	}

	all := fixtures()
	if *addr != "" {
		if err := listen(*addr, *tmplPath, all); err != nil {
			fmt.Fprintf(os.Stderr, "%v\n", err)
			os.Exit(1)
		}
		return
	}

	// The installer rewrites the artifact on disk, before the panel renders it,
	// so the markers have to be there exactly once each even though they never
	// reach the browser.
	if n := strings.Count(string(artifact), "/* row:branding */"); n != 1 {
		fmt.Fprintf(os.Stderr, "the artifact carries %d branding markers, expected 1\n", n)
		os.Exit(1)
	}

	failed := 0
	for _, f := range all {
		out, err := render(string(artifact), f, *outDir)
		if err != nil {
			failed++
			fmt.Printf("FAIL %-30s %s\n       %v\n", f.Name, f.Title, err)
			continue
		}
		problems := check(f, out)
		if len(problems) == 0 {
			fmt.Printf("ok   %-30s %6.1f KiB  %s\n", f.Name, float64(len(out))/1024, f.Title)
			continue
		}
		failed++
		fmt.Printf("FAIL %-30s %s\n", f.Name, f.Title)
		for _, p := range problems {
			fmt.Printf("       %s\n", p)
		}
	}

	fmt.Printf("\n%d fixtures rendered into %s, %d failed\n", len(all), *outDir, failed)
	if failed > 0 {
		os.Exit(1)
	}
}
