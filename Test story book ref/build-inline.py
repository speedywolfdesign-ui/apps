#!/usr/bin/env python3
"""
build-inline.py — generate self-contained (single-file) versions of every page.

WHY: browsers block a file:// page from loading local sub-resources
(components/*.css, components/*.js, scurve-forecast.css) — you get
net::ERR_ACCESS_DENIED and a totally unstyled page. Inlining those
files into each HTML removes all local sub-resources, so every page
works when simply double-clicked (no server, no Chrome flag).

SOURCE OF TRUTH stays the external files:
  - Edit components/*.css, components/*.js, scurve-forecast.css, or the
    page structure in page-templates/*.html
  - Re-run:  python3 build-inline.py
  - The self-contained pages in the project root are regenerated.

CDN resources (Google Fonts, PrimeIcons, Chart.js, Phosphor) are https
and load fine over file://, so they are left as-is.
"""
import os, re, shutil, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
TEMPLATES = os.path.join(ROOT, "page-templates")

# Root-level pages to build (everything else is a component/backup).
PAGES = [
    "home.html", "project-home.html", "projects.html", "contracts.html",
    "scurve-forecast.html", "AI centric s-curve.html", "navigation.html",
    "userstorymapping.html", "icon.html", "test.html", "dna-loader.html",
]

def is_local(url):
    u = url.strip()
    return not (u.startswith("http://") or u.startswith("https://")
                or u.startswith("//") or u.startswith("data:") or u.startswith("#"))

def read_asset(rel):
    """Read a local asset (path is relative to project root)."""
    with open(os.path.join(ROOT, rel), "r", encoding="utf-8") as f:
        return f.read()

def safe_for_script(js):
    # A literal </script (even inside a comment/string) would close the
    # inline <script> block early. Escape the slash — harmless in JS.
    return re.sub(r"</(script)", r"<\\/\1", js, flags=re.IGNORECASE)

LINK_RE   = re.compile(r'<link\b[^>]*?>', re.IGNORECASE)
SCRIPT_RE = re.compile(r'<script\b[^>]*?\bsrc\s*=\s*["\']([^"\']+)["\'][^>]*?>\s*</script>', re.IGNORECASE)
HREF_RE   = re.compile(r'href\s*=\s*["\']([^"\']+)["\']', re.IGNORECASE)

def inline_links(html, stats):
    def repl(m):
        tag = m.group(0)
        href_m = HREF_RE.search(tag)
        if not href_m:
            return tag
        href = href_m.group(1)
        if not (is_local(href) and href.lower().endswith(".css")):
            return tag  # CDN font/icon or non-css link — leave alone
        try:
            css = read_asset(href)
        except FileNotFoundError:
            print(f"    ! missing css: {href}", file=sys.stderr)
            return tag
        stats.append(href)
        return f'<style data-inlined-from="{href}">\n{css}\n</style>'
    return LINK_RE.sub(repl, html)

def inline_scripts(html, stats):
    def repl(m):
        src = m.group(1)
        if not (is_local(src) and src.lower().endswith(".js")):
            return m.group(0)  # CDN script — leave alone
        try:
            js = read_asset(src)
        except FileNotFoundError:
            print(f"    ! missing js: {src}", file=sys.stderr)
            return m.group(0)
        stats.append(src)
        return f'<script data-inlined-from="{src}">\n{safe_for_script(js)}\n</script>'
    return SCRIPT_RE.sub(repl, html)

def main():
    # First run: capture the current (external-linked) pages as templates.
    if not os.path.isdir(TEMPLATES):
        os.makedirs(TEMPLATES)
        for p in PAGES:
            src = os.path.join(ROOT, p)
            if os.path.exists(src):
                shutil.copy2(src, os.path.join(TEMPLATES, p))
        print(f"Created page-templates/ from current pages ({len(PAGES)} files).")

    for p in PAGES:
        tpl = os.path.join(TEMPLATES, p)
        if not os.path.exists(tpl):
            print(f"skip {p} (no template)")
            continue
        with open(tpl, "r", encoding="utf-8") as f:
            html = f.read()
        css_hits, js_hits = [], []
        html = inline_links(html, css_hits)
        html = inline_scripts(html, js_hits)
        with open(os.path.join(ROOT, p), "w", encoding="utf-8") as f:
            f.write(html)
        print(f"built {p:32}  css:{len(css_hits)}  js:{len(js_hits)}")

if __name__ == "__main__":
    main()
