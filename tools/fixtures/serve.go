package main

import (
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net/http"
	"os"
	"strings"
)

// listen previews the fixtures. Artifacts are re-read on every request so a
// rebuild only needs a browser refresh, and the fixture/template selectors are
// injected here rather than in the sources, so they cannot reach the shipped
// artifact.
//
// Each fixture lives at /f/<name>, which means the page's own live refresh —
// location.pathname + "?format=info" — lands on the JSON handler below.
func listen(addr string, tmpls []templateArt, all []fixture) error {
	if len(tmpls) == 0 {
		return fmt.Errorf("no template artifacts found; build first: node tools/build.mjs --all")
	}
	work, err := os.MkdirTemp("", "row-fixtures-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(work)

	byName := make(map[string]fixture, len(all))
	for _, f := range all {
		byName[f.Name] = f
	}
	byID := make(map[string]templateArt, len(tmpls))
	for _, t := range tmpls {
		byID[t.ID] = t
	}

	handler := func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			http.Redirect(w, r, "/f/"+all[0].Name+"?template="+tmpls[0].ID, http.StatusFound)
			return
		}
		f, ok := byName[strings.Trim(strings.TrimPrefix(r.URL.Path, "/f/"), "/")]
		if !ok || !strings.HasPrefix(r.URL.Path, "/f/") {
			http.NotFound(w, r)
			return
		}

		w.Header().Set("Cache-Control", "no-store")
		if r.URL.Query().Get("format") == "info" {
			writeInfo(w, f)
			return
		}

		// The template id is only ever a key into the discovered set, so a
		// crafted query can never reach the filesystem as a path.
		t, ok := byID[r.URL.Query().Get("template")]
		if !ok {
			t = tmpls[0]
		}
		artifact, err := os.ReadFile(t.Path)
		if err == nil {
			var page string
			page, err = render(string(artifact), f, work)
			if err == nil {
				w.Header().Set("Content-Type", "text/html; charset=utf-8")
				io.WriteString(w, withSelector(page, f, all, tmpls, t.ID))
				return
			}
		}
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprintf(w, "%s\n\nRebuild with: node tools/build.mjs\n", err)
	}

	fmt.Printf("http://%s/  (%d fixtures, %d templates)\n", addr, len(all), len(tmpls))
	for _, f := range all {
		fmt.Printf("  http://%s/f/%-30s %s\n", addr, f.Name, f.Title)
	}
	return http.ListenAndServe(addr, http.HandlerFunc(handler))
}

// writeInfo answers ?format=info the way the panel does: the same view model
// without links, and with emails deduplicated on this path only.
func writeInfo(w http.ResponseWriter, f fixture) {
	if f.InfoFail {
		http.Error(w, "live status is unavailable", http.StatusServiceUnavailable)
		return
	}

	info := make(map[string]any, len(f.Data))
	for k, v := range f.Data {
		if k == "links" {
			continue
		}
		info[k] = v
	}
	if list, ok := f.Data["emails"].([]string); ok {
		seen := make(map[string]bool, len(list))
		unique := make([]string, 0, len(list))
		for _, e := range list {
			if !seen[e] {
				seen[e] = true
				unique = append(unique, e)
			}
		}
		info["emails"] = unique
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	json.NewEncoder(w).Encode(info)
}

// withSelector appends the development fixture/template selector to a rendered
// page. It is deliberately self-contained: fixed position, its own colours,
// dir="ltr" so the RTL fixtures do not move it, and no reliance on the page's
// own styles.
func withSelector(page string, cur fixture, all []fixture, tmpls []templateArt, curID string) string {
	var opts strings.Builder
	for _, f := range all {
		selected := ""
		if f.Name == cur.Name {
			selected = " selected"
		}
		fmt.Fprintf(&opts, `<option value="%s"%s>%s &middot; %s</option>`,
			html.EscapeString(f.Name), selected,
			html.EscapeString(f.Name), html.EscapeString(f.Title))
	}

	var topts strings.Builder
	for _, t := range tmpls {
		selected := ""
		if t.ID == curID {
			selected = " selected"
		}
		fmt.Fprintf(&topts, `<option value="%s"%s>%s</option>`,
			html.EscapeString(t.ID), selected, html.EscapeString(t.ID))
	}

	panel := devStyle +
		`<div id="row-dev" dir="ltr"><label for="row-dev-tpl">template</label>` +
		`<select id="row-dev-tpl">` + topts.String() + `</select>` +
		`<label for="row-dev-pick">fixture</label>` +
		`<select id="row-dev-pick">` + opts.String() + `</select></div>` +
		devScript

	if i := strings.LastIndex(page, "</body>"); i > -1 {
		return page[:i] + panel + page[i:]
	}
	return page + panel
}

const devStyle = `<style>
#row-dev {
  position: fixed; inset-block-end: 0; inset-inline: 0; z-index: 9999;
  display: flex; gap: 8px; align-items: center; justify-content: center;
  padding: 6px 10px; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace;
  background: #101215; color: #C9CED6; border-block-start: 1px solid #2A2E35;
}
#row-dev select {
  max-inline-size: 40vw; padding: 4px 6px; font: inherit; border-radius: 6px;
  background: #1A1D22; color: #E6E9EE; border: 1px solid #3A3F48;
}
body { padding-block-end: 46px !important; }
</style>`

const devScript = `<script>
(function () {
  var pick = document.getElementById('row-dev-pick');
  pick.addEventListener('change', function () {
    location.assign('/f/' + pick.value + location.search + location.hash);
  });
  var tpl = document.getElementById('row-dev-tpl');
  tpl.addEventListener('change', function () {
    location.assign('/f/' + pick.value + '?template=' + tpl.value + location.hash);
  });
})();
</script>`
