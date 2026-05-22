// layout.typ — USAF/DoD intel brief typography, CAPCO palette, and page setup.
// 16:9 landscape (13.333" × 7.5"). Real briefs use Arial system-wide; Inter is
// bundled as a portable fallback.

// CAPCO banner palette (Astro UXDS alignment with STANAG 4774 / ODNI CAPCO).
#let capco-palette = (
  "UNCLASSIFIED":      (bg: rgb("#007A33"), text: white),
  "CUI":               (bg: rgb("#502B85"), text: white),
  "CONFIDENTIAL":      (bg: rgb("#0033A0"), text: white),
  "SECRET":            (bg: rgb("#C8102E"), text: white),
  "TOP SECRET":        (bg: rgb("#FF8C00"), text: black),
  "TOP SECRET//SCI":   (bg: rgb("#FCE300"), text: black),
)

#let af-colors = (
  af-blue: rgb("#00308F"),
  af-blue-dark: rgb("#001F5C"),
  af-blue-tint: rgb("#E8EEF8"),
  af-gold: rgb("#D2AF39"),
  af-gold-tint: rgb("#FAF4E0"),
  text: rgb("#0F1419"),
  muted: rgb("#555555"),
  label: rgb("#6B7280"),
  body-bg: rgb("#FFFFFF"),
  panel-bg: rgb("#F6F7F9"),
  sidebar-bg: rgb("#EFF2F6"),
  content-rule: rgb("#BBBBBB"),
  bluf-accent: rgb("#C8102E"),
  bluf-bg: rgb("#FFF5F0"),
  severity-low: rgb("#2E7D32"),
  severity-mod: rgb("#ED6C02"),
  severity-high: rgb("#C8102E"),
  severity-critical: rgb("#6A1B9A"),
  int-pill-bg: rgb("#E8EEF8"),
  int-pill-border: rgb("#B7C4DC"),
  int-pill-text: rgb("#00308F"),
  notional: rgb("#B0B0B0"),
)

#let config = (
  // Typography — per DAF Brand Guide (Libre Franklin / Source Sans 3) with
  // Arial fallback for NIPR/SIPR portability. Inter is the bundled OFL fallback.
  fonts: ("Libre Franklin", "Arial", "Liberation Sans", "Inter"),
  body-fonts: ("Source Sans 3", "Source Sans Pro", "Arial", "Liberation Sans", "Inter"),
  // Sizes per observed AF/DoD briefing convention (ISOO booklet examples).
  title-size: 32pt,
  subtitle-size: 20pt,
  slide-title-size: 28pt,          // 24–28pt per AF standard
  bullet-size: 18pt,               // 18–22pt body text
  sub-bullet-size: 16pt,
  caption-size: 12pt,
  footer-size: 9pt,
  banner-size: 12pt,               // Arial Bold 11–12pt per ISOO convention
  authority-size: 8pt,
  // Page — 16:9 widescreen, the modern AF default.
  page-width: 13.333in,
  page-height: 7.5in,
  margin-x: 0.35in,
  margin-y: 0.1in,
  content-pad-x: 0.4in,
  content-pad-y: 0.15in,
  banner-height: 0.30in,           // ~22px at 96 DPI per ISOO standard
  banner-pad-y: 5pt,
  title-bar-height: 0.55in,        // AF Blue fill title bar
  footer-pad-y: 4pt,
)

#let is-true(v) = {
  if type(v) == bool { return v }
  let s = str(v).trim()
  s == "true" or s == "True" or s == "TRUE" or s == "yes" or s == "1"
}

// Normalize a classification string to its primary-level key for color lookup.
// "TOP SECRET//SI//NOFORN" → "TOP SECRET//SCI" when SCI/SI/TK/HCS present,
// otherwise → "TOP SECRET". "SECRET//NOFORN" → "SECRET". Etc.
#let classification-key(class-str, caveats-str: "") = {
  let c = upper(str(class-str).trim())
  let caveats = upper(str(caveats-str).trim())
  let sci-tokens = ("SCI", "SI", "TK", "HCS", "GAMMA")
  let has-sci = sci-tokens.any(tok => caveats.contains(tok) or c.contains("//" + tok))
  if c.starts-with("TOP SECRET") and has-sci { return "TOP SECRET//SCI" }
  if c.starts-with("TOP SECRET") { return "TOP SECRET" }
  if c.starts-with("SECRET") { return "SECRET" }
  if c.starts-with("CONFIDENTIAL") { return "CONFIDENTIAL" }
  if c.starts-with("CUI") { return "CUI" }
  "UNCLASSIFIED"
}

// Build a full banner string from classification + caveats, uppercased and
// joined per CAPCO syntax (primary // caveats...).
// Enforce canonical dissemination ordering.
#let canonical-caveat-order = (
  "NOFORN", "REL TO", "RELIDO", "DISPLAY ONLY", "EYES ONLY",
  "ORCON", "PROPIN", "FISA", "IMCON", "DSEN", "NF", "OC", "PR",
)

#let _sort-caveats(tokens) = {
  // Partition tokens into known + unknown. Known get ordered; unknown kept
  // in author order at the end.
  let known = ()
  let unknown = ()
  for tok in tokens {
    let t = upper(tok.trim())
    if t == "" { continue }
    // REL TO groups may have trailing country list — match prefix.
    let is-known = canonical-caveat-order.any(canon => t == canon or t.starts-with(canon + " "))
    if is-known { known.push(t) } else { unknown.push(t) }
  }
  // Order known by position in canonical list (stable otherwise).
  let ranked = known.enumerate().map(((i, k)) => {
    let rank = 999
    for (r, canon) in canonical-caveat-order.enumerate() {
      if k == canon or k.starts-with(canon + " ") { rank = r; break }
    }
    (rank, i, k)
  })
  ranked = ranked.sorted(key: ((r, i, k)) => r * 10000 + i)
  ranked.map(((r, i, k)) => k) + unknown
}

#let build-banner-string(classification, caveats: "") = {
  let c = upper(str(classification).trim())
  if c == "" { return "UNCLASSIFIED" }
  let cav = str(caveats).trim()
  if cav == "" { return c }
  let toks = cav.split("//").map(s => s.trim()).filter(s => s != "")
  let ordered = _sort-caveats(toks)
  if ordered.len() == 0 { return c }
  c + "//" + ordered.join("//")
}

// Validate a full CAPCO-shaped banner string.
#let validate-banner(banner) = {
  let b = str(banner).trim()
  if b == "" { return (ok: false, reason: "Empty banner") }
  let ok = b.match(regex("^(UNCLASSIFIED|CUI|CONFIDENTIAL|SECRET|TOP SECRET)(//[A-Z0-9 ,/]+)*$")) != none
  if not ok {
    return (ok: false, reason: "Banner does not match CAPCO syntax: " + b)
  }
  (ok: true, reason: "")
}

// Render one banner bar (full-width strip).
#let banner-bar(banner-str, key) = {
  let pal = if key in capco-palette { capco-palette.at(key) } else { capco-palette.UNCLASSIFIED }
  block(
    width: 100%,
    fill: pal.bg,
    inset: (y: config.banner-pad-y, x: 6pt),
  )[
    #set par(spacing: 0pt)
    #align(center, text(
      font: config.fonts,
      size: config.banner-size,
      weight: "bold",
      fill: pal.text,
      upper(banner-str),
    ))
  ]
}

// Exercise strap (above/below the classification banner).
#let exercise-strap(exercise-name: "") = {
  let label = if exercise-name != "" {
    "EXERCISE — " + upper(exercise-name) + " — EXERCISE"
  } else {
    "EXERCISE — EXERCISE — EXERCISE"
  }
  block(
    width: 100%,
    fill: rgb("#000000"),
    inset: (y: 2pt),
  )[
    #set par(spacing: 0pt)
    #align(center, text(
      font: config.fonts,
      size: 9pt,
      weight: "bold",
      fill: rgb("#FFD700"),
      label,
    ))
  ]
}

// NOTIONAL watermark — diagonal gray text across slide body.
#let notional-watermark() = {
  place(
    center + horizon,
    rotate(-30deg, text(
      font: config.fonts,
      size: 96pt,
      weight: "black",
      fill: rgb(176, 176, 176, 65),
      "NOTIONAL",
    )),
  )
}

// Global brief show rule: page setup, fonts.
#let intel-brief(content) = {
  set page(
    width: config.page-width,
    height: config.page-height,
    margin: (x: 0pt, y: 0pt),
    fill: af-colors.body-bg,
  )
  set text(
    font: config.fonts,
    size: config.bullet-size,
    fill: af-colors.text,
  )
  set par(
    leading: 5pt,
    justify: false,
    first-line-indent: 0pt,
    spacing: 6pt,
  )
  content
}
