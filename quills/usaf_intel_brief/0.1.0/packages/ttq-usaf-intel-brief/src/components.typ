// components.typ — USAF intel brief slide components.

#import "layout.typ": config, af-colors, capco-palette, classification-key, build-banner-string, banner-bar, exercise-strap, notional-watermark, is-true

// ─── SEAL / IMAGE HELPERS ──────────────────────────────────────────────────

// seal-image accepts either a path string (resolved from components.typ) or
// a pre-loaded content block passed from plate.typ. Prefer the content
// form — plate.typ can call image("assets/X.svg") and pass the result.
#let seal-image(src, size: 1.6in) = {
  if src == none { return none }
  if type(src) == str {
    if src.trim() == "" { return none }
    return box(width: size, height: size,
      image(src, width: size, height: size, fit: "contain"))
  }
  // Content passed directly
  box(width: size, height: size, src)
}

// ─── BANNER + STRAPS ───────────────────────────────────────────────────────

#let top-banners(classification, caveats, notional: false, exercise-name: "") = {
  let banner = build-banner-string(classification, caveats: caveats)
  let key = classification-key(classification, caveats-str: caveats)
  if notional { exercise-strap(exercise-name: exercise-name) }
  banner-bar(banner, key)
}

#let bottom-banners(classification, caveats, notional: false, exercise-name: "") = {
  let banner = build-banner-string(classification, caveats: caveats)
  let key = classification-key(classification, caveats-str: caveats)
  banner-bar(banner, key)
  if notional { exercise-strap(exercise-name: exercise-name) }
}

// ─── PORTION MARKER ────────────────────────────────────────────────────────

#let portion-prefix(p) = {
  let s = upper(str(p).trim())
  if s == "" { return "(U) " }
  if s.starts-with("(") and s.ends-with(")") { return s + " " }
  "(" + s + ") "
}

// ─── SLIDE FOOTER ──────────────────────────────────────────────────────────

#let slide-footer(unit, slide-n, slide-total, dtg) = {
  set par(spacing: 0pt)
  grid(
    columns: (1fr, 1fr, 1fr),
    align: (left + horizon, center + horizon, right + horizon),
    text(font: config.fonts, size: config.footer-size, fill: af-colors.muted, unit),
    text(font: config.fonts, size: config.footer-size, fill: af-colors.muted,
      "Slide " + str(slide-n) + " of " + str(slide-total)),
    text(font: config.fonts, size: config.footer-size, fill: af-colors.muted, dtg),
  )
}

// ─── AUTHORITY BLOCK ───────────────────────────────────────────────────────

#let authority-block(classified-by, derived-from, declassify-on, reason) = {
  if str(classified-by).trim() == "" { return none }
  block(
    inset: 4pt,
    [
      #set par(spacing: 1pt, leading: 1em)
      #set text(font: config.fonts, size: config.authority-size, fill: af-colors.text)
      *Classified By:* #classified-by
      #linebreak()
      #if str(reason).trim() != "" [
        *Reason:* #reason
        #linebreak()
      ] else if str(derived-from).trim() != "" [
        *Derived From:* #derived-from
        #linebreak()
      ]
      *Declassify On:* #declassify-on
    ]
  )
}

// ─── TITLE SLIDE ───────────────────────────────────────────────────────────

#let title-slide(
  brief-title: "",
  subtitle: "",
  briefer: "",
  prepared-for: "",
  dtg: "",
  unit: "",
  left-seal: none,
  center-seal: none,
  right-seal: none,
  wordmark: none,
  show-wordmark: true,
  classified-by: "",
  derived-from: "",
  declassify-on: "",
  reason: "",
  classification: "",
  caveats: "",
  notional: false,
  exercise-name: "",
) = {
  // Body region: everything between top and bottom banner straps.
  block(
    width: 100%,
    height: 100%,
    inset: (x: config.content-pad-x, y: config.content-pad-y),
  )[
    #if notional { notional-watermark() }
    #v(0.15in)

    // Seals row
    #grid(
      columns: (1fr, 1fr, 1fr),
      align: (center + horizon,) * 3,
      gutter: 12pt,
      seal-image(left-seal, size: 1.6in),
      seal-image(center-seal, size: 1.8in),
      seal-image(right-seal, size: 1.6in),
    )
    #v(0.2in)

    #align(center)[
      #text(font: config.fonts, size: config.title-size, weight: "bold",
        fill: af-colors.af-blue, upper(brief-title))
      #if subtitle != "" [
        #v(6pt)
        #text(font: config.fonts, size: config.subtitle-size, weight: "regular",
          fill: af-colors.text, subtitle)
      ]
    ]

    #v(0.2in)

    #align(center)[
      #set par(leading: 1em, spacing: 3pt)
      #set text(font: config.fonts, size: 12pt, fill: af-colors.text)
      #if briefer != "" [*Briefer:* #briefer \ ]
      #if prepared-for != "" [*Prepared for:* #prepared-for \ ]
      #if dtg != "" [*As of:* #dtg \ ]
      #if unit != "" [*Prepared by:* #unit]
    ]

    #if show-wordmark and wordmark != none [
      #v(1fr)
      #align(center, seal-image(wordmark, size: 1.4in))
    ]

    #place(
      bottom + left,
      authority-block(classified-by, derived-from, declassify-on, reason),
    )
  ]
}

// ─── SEVERITY BADGE ────────────────────────────────────────────────────────

#let severity-badge(level) = {
  let lvl = lower(str(level).trim())
  if lvl == "" { return none }
  let (fill, label) = if lvl == "low" {
    (af-colors.severity-low, "LOW")
  } else if lvl == "moderate" or lvl == "mod" {
    (af-colors.severity-mod, "MODERATE")
  } else if lvl == "high" {
    (af-colors.severity-high, "HIGH")
  } else if lvl == "critical" or lvl == "crit" {
    (af-colors.severity-critical, "CRITICAL")
  } else {
    (af-colors.muted, upper(lvl))
  }
  box(
    inset: (x: 8pt, y: 3pt),
    radius: 3pt,
    fill: fill,
    baseline: 2pt,
    text(font: config.fonts, size: 9pt, weight: "bold", tracking: 0.1em,
      fill: white, "THREAT " + label),
  )
}

// ─── INT SOURCE PILLS ──────────────────────────────────────────────────────

#let int-pills(sources-str) = {
  let s = str(sources-str).trim()
  if s == "" { return none }
  let tokens = s.split(",").map(t => t.trim()).filter(t => t != "")
  for (i, tok) in tokens.enumerate() {
    box(
      inset: (x: 6pt, y: 2pt),
      radius: 2pt,
      fill: af-colors.int-pill-bg,
      stroke: 0.5pt + af-colors.int-pill-border,
      baseline: 1pt,
      text(font: config.fonts, size: 8.5pt, weight: "bold", tracking: 0.08em,
        fill: af-colors.int-pill-text, upper(tok)),
    )
    if i < tokens.len() - 1 { h(3pt) }
  }
}

// ─── AOR / TIMEFRAME BAND ──────────────────────────────────────────────────

#let aor-band(aor: "", timeframe: "", severity: "") = {
  if aor == "" and timeframe == "" and severity == "" { return none }
  block(
    width: 100%,
    fill: af-colors.af-blue-tint,
    stroke: (left: 4pt + af-colors.af-blue, rest: 0pt),
    inset: (x: 10pt, y: 5pt),
  )[
    #set par(spacing: 0pt)
    #grid(
      columns: (1fr, auto),
      align: (left + horizon, right + horizon),
      [
        #if aor != "" [
          #text(size: 9pt, weight: "bold", tracking: 0.1em,
            fill: af-colors.af-blue, "AOR: ")
          #text(size: 11pt, weight: "medium", fill: af-colors.text, aor)
        ]
        #if timeframe != "" [
          #h(14pt)
          #text(size: 9pt, weight: "bold", tracking: 0.1em,
            fill: af-colors.af-blue, "TIMEFRAME: ")
          #text(size: 11pt, weight: "medium", fill: af-colors.text, timeframe)
        ]
      ],
      severity-badge(severity),
    )
  ]
}

// ─── LIKELIHOOD SCALE (ICD 203 VISUAL) ─────────────────────────────────────
//
// Seven-step scale per ICD 203:
//  [Almost No Chance | Very Unlikely | Unlikely | Roughly Even Chance |
//   Likely | Very Likely | Almost Certainly]

#let _likelihood-steps = (
  ("almost no chance", "Almost\nNo Chance"),
  ("very unlikely",    "Very\nUnlikely"),
  ("unlikely",         "Unlikely"),
  ("roughly even",     "Roughly\nEven Chance"),
  ("likely",           "Likely"),
  ("very likely",      "Very\nLikely"),
  ("almost certainly", "Almost\nCertainly"),
)

#let _match-likelihood-index(text-value) = {
  let t = lower(str(text-value).trim())
  if t == "" { return -1 }
  // Find last step whose key is contained in t.
  let best = -1
  for (i, (key, _label)) in _likelihood-steps.enumerate() {
    if t.contains(key) { best = i }
  }
  best
}

#let likelihood-scale(likelihood-text) = {
  let idx = _match-likelihood-index(likelihood-text)
  let step-colors = (
    af-colors.severity-low,
    rgb("#66A36B"),
    rgb("#CAB55B"),
    af-colors.muted,
    rgb("#E48A3B"),
    af-colors.severity-mod,
    af-colors.severity-high,
  )
  block(
    width: 100%,
    inset: (y: 4pt),
  )[
    #set par(spacing: 0pt)
    #grid(
      columns: (1fr,) * 7,
      align: (center + horizon,) * 7,
      gutter: 2pt,
      ..for i in range(7) {
        let (_, label) = _likelihood-steps.at(i)
        let is-sel = i == idx
        let bg = if is-sel { step-colors.at(i) } else { af-colors.panel-bg }
        let fg = if is-sel { white } else { af-colors.muted }
        let weight = if is-sel { "bold" } else { "regular" }
        (box(
          width: 100%,
          inset: (x: 2pt, y: 4pt),
          radius: 2pt,
          fill: bg,
          align(center, text(size: 7.5pt, weight: weight, fill: fg, label)),
        ),)
      }
    )
  ]
}

// ─── CONFIDENCE METER ──────────────────────────────────────────────────────
//
// Three-step Low / Moderate / High with selected segment highlighted.

#let confidence-meter(confidence-text) = {
  let c = lower(str(confidence-text).trim())
  let idx = if c.contains("high") { 2 }
    else if c.contains("mod") { 1 }
    else if c.contains("low") { 0 }
    else { -1 }
  let step-colors = (
    af-colors.severity-high,
    af-colors.severity-mod,
    af-colors.severity-low,
  )
  let labels = ("LOW", "MODERATE", "HIGH")
  block(width: 100%)[
    #grid(
      columns: (1fr, 1fr, 1fr),
      gutter: 3pt,
      ..for i in range(3) {
        let is-sel = i == idx
        let bg = if is-sel { step-colors.at(i) } else { af-colors.panel-bg }
        let fg = if is-sel { white } else { af-colors.muted }
        let weight = if is-sel { "bold" } else { "regular" }
        (box(
          width: 100%,
          inset: (x: 4pt, y: 5pt),
          radius: 2pt,
          fill: bg,
          align(center, text(size: 9pt, weight: weight, tracking: 0.1em,
            fill: fg, labels.at(i))),
        ),)
      }
    )
  ]
}

// ─── BULLET PARSER ─────────────────────────────────────────────────────────
//
// Parse a bullets string: one bullet per line. Leading characters set level:
//   -       → level 1 (hyphen)
//   *       → level 2 (bullet)
//   –       → level 3 (en-dash)
//   ◦       → level 4 (open circle)
// Any other leading character is treated as raw level-1 text.
//
// Each bullet's text should start with a portion mark like "(U)" — if missing,
// we prepend the slide's default portion.

#let render-bullets(bullets-str, default-portion: "U") = {
  let lines = str(bullets-str).split("\n")
  let items = ()
  for raw-line in lines {
    let line = raw-line.trim()
    if line == "" { continue }
    let level = 1
    let content-text = line
    if line.starts-with("- ") { level = 1; content-text = line.slice(2) }
    else if line.starts-with("* ") { level = 2; content-text = line.slice(2) }
    else if line.starts-with("– ") { level = 3; content-text = line.slice(2) }
    else if line.starts-with("◦ ") { level = 4; content-text = line.slice(2) }
    let has-portion = content-text.match(regex("^\\([A-Z/\\s,]+\\)")) != none
    let with-portion = if has-portion { content-text } else {
      portion-prefix(default-portion) + content-text
    }
    items.push((level: level, text: with-portion))
  }

  set par(spacing: 8pt, leading: 7pt)
  for item in items {
    let marker = if item.level == 1 { "▸" }
      else if item.level == 2 { "•" }
      else if item.level == 3 { "▪" }
      else { "◦" }
    let marker-color = if item.level == 1 { af-colors.af-blue }
      else if item.level == 2 { af-colors.af-gold }
      else { af-colors.muted }
    let indent = (item.level - 1) * 24pt
    let size = if item.level == 1 { config.bullet-size }
      else if item.level == 2 { config.sub-bullet-size }
      else { config.sub-bullet-size - 1pt }
    block(
      inset: (left: indent, y: 2pt),
      [
        #text(font: config.fonts, size: size + 2pt, weight: "bold",
          fill: marker-color, marker)
        #h(8pt)
        #text(font: config.body-fonts, size: size, fill: af-colors.text, item.text)
      ],
    )
  }
}

// ─── BLUF BLOCK ────────────────────────────────────────────────────────────

#let bluf-block(bluf-text, portion: "U", hero: false) = {
  if str(bluf-text).trim() == "" { return none }
  block(
    width: 100%,
    inset: 14pt,
    stroke: (left: 6pt + af-colors.bluf-accent, rest: 0.5pt + af-colors.content-rule),
    fill: af-colors.bluf-bg,
  )[
    #set par(leading: 6pt, spacing: 6pt, justify: false)
    #text(font: config.fonts, size: 11pt, weight: "bold", tracking: 0.12em,
      fill: af-colors.bluf-accent, "BLUF ")
    #text(font: config.fonts, size: 10pt, weight: "bold", tracking: 0.05em,
      fill: af-colors.muted, "BOTTOM LINE UP FRONT")
    #v(4pt)
    #set text(font: config.fonts, size: if hero { 18pt } else { 15pt },
      weight: if hero { "bold" } else { "regular" }, fill: af-colors.text)
    #portion-prefix(portion) #bluf-text
  ]
}

// ─── CONFIDENCE / LIKELIHOOD (ICD 203) ────────────────────────────────────

#let confidence-block(likelihood-text, confidence-text, portion: "U") = {
  block(
    width: 100%,
    inset: 14pt,
    stroke: (left: 4pt + af-colors.af-blue, rest: 0.5pt + af-colors.content-rule),
    fill: af-colors.af-blue-tint,
  )[
    #set par(leading: 6pt, spacing: 6pt)
    #text(size: 10pt, weight: "bold", tracking: 0.12em, fill: af-colors.af-blue,
      "ANALYTIC ASSESSMENT")
    #h(6pt)
    #text(size: 9pt, weight: "regular", fill: af-colors.muted,
      "per ICD 203")
    #v(8pt)

    // LIKELIHOOD
    #text(size: 10pt, weight: "bold", tracking: 0.08em, fill: af-colors.af-blue,
      "LIKELIHOOD")
    #v(2pt)
    #likelihood-scale(likelihood-text)
    #if str(likelihood-text).trim() != "" [
      #v(3pt)
      #align(center, text(size: 14pt, weight: "bold", fill: af-colors.text,
        portion-prefix(portion) + likelihood-text))
    ]

    #v(10pt)

    // CONFIDENCE
    #text(size: 10pt, weight: "bold", tracking: 0.08em, fill: af-colors.af-blue,
      "ANALYST CONFIDENCE")
    #v(2pt)
    #confidence-meter(confidence-text)
    #if str(confidence-text).trim() != "" [
      #v(3pt)
      #align(center, text(size: 14pt, weight: "bold", fill: af-colors.text,
        portion-prefix(portion) + confidence-text))
    ]
  ]
}

// ─── COA LAYOUT (MLCOA / MDCOA) ───────────────────────────────────────────

#let coa-layout(label, coa-title, bullets-str, portion: "U", severity: "") = {
  let accent = if label.contains("Dangerous") { af-colors.severity-high }
    else { af-colors.af-blue }
  block(
    width: 100%,
    inset: 14pt,
    stroke: (left: 6pt + accent, rest: 0.5pt + af-colors.content-rule),
    fill: af-colors.panel-bg,
  )[
    #grid(
      columns: (1fr, auto),
      align: (left + horizon, right + horizon),
      [
        #text(size: 10pt, weight: "bold", tracking: 0.12em, fill: accent,
          upper(label))
        #if coa-title != "" [
          #linebreak()
          #text(size: 18pt, weight: "bold", fill: af-colors.text, coa-title)
        ]
      ],
      severity-badge(severity),
    )
    #v(8pt)
    #render-bullets(bullets-str, default-portion: portion)
  ]
}

// ─── SLIDE TITLE BAR ───────────────────────────────────────────────────────

// AF Blue filled title bar — white text, severity badge right-aligned.
#let slide-title-bar(portion: "U", title-text: "", severity: "") = {
  block(
    width: 100%,
    fill: af-colors.af-blue,
    inset: (x: 14pt, y: 8pt),
    radius: (top: 3pt),
  )[
    #set par(spacing: 0pt)
    #grid(
      columns: (1fr, auto),
      align: (left + horizon, right + horizon),
      text(font: config.fonts, size: config.slide-title-size, weight: "bold",
        fill: white, portion-prefix(portion) + title-text),
      severity-badge(severity),
    )
  ]
}

// ─── SIDEBAR ───────────────────────────────────────────────────────────────

#let sidebar-block(
  title: "",
  body: "",
  int-sources: "",
  key-judgments: (),
  portion: "U",
) = {
  block(
    width: 100%,
    inset: 12pt,
    fill: af-colors.sidebar-bg,
    stroke: (left: 3pt + af-colors.af-gold, rest: 0pt),
  )[
    #set par(leading: 5pt, spacing: 6pt, justify: false)
    #if title != "" [
      #text(size: 10pt, weight: "bold", tracking: 0.12em, fill: af-colors.af-blue,
        upper(title))
      #v(4pt)
    ]

    #if int-sources != "" [
      #text(size: 8pt, weight: "bold", tracking: 0.1em, fill: af-colors.muted,
        "SOURCES")
      #linebreak()
      #int-pills(int-sources)
      #v(6pt)
    ]

    #if key-judgments.len() > 0 [
      #text(size: 8pt, weight: "bold", tracking: 0.1em, fill: af-colors.muted,
        "KEY JUDGMENTS")
      #v(2pt)
      #for (i, kj) in key-judgments.enumerate() [
        #block(inset: (y: 2pt))[
          #text(size: 10pt, weight: "bold", fill: af-colors.af-blue,
            str(i + 1) + ".")
          #h(4pt)
          #text(size: 10pt, fill: af-colors.text, kj)
        ]
      ]
      #v(2pt)
    ]

    #if body != "" [
      #set text(size: 10pt, fill: af-colors.text)
      #portion-prefix(portion) #body
    ]
  ]
}

// ─── CONTENT SLIDE ─────────────────────────────────────────────────────────

#let content-slide(
  slide-type: "generic",
  portion: "U",
  title: "",
  bullets: "",
  bluf: "",
  likelihood-text: "",
  confidence-text: "",
  notes: "",
  aor: "",
  timeframe: "",
  severity: "",
  int-sources: "",
  sidebar-title: "",
  sidebar-body: "",
  key-judgments-str: "",
  notional: false,
) = {
  // Parse key judgments (one per line).
  let kjs = str(key-judgments-str).split("\n")
    .map(l => l.trim())
    .filter(l => l != "")

  let has-sidebar = sidebar-title != "" or sidebar-body != "" or int-sources != "" or kjs.len() > 0

  block(
    width: 100%,
    height: 100%,
    inset: (x: config.content-pad-x, y: config.content-pad-y),
  )[
    #if notional { notional-watermark() }

    #slide-title-bar(portion: portion, title-text: title, severity: severity)
    #v(4pt)
    #aor-band(aor: aor, timeframe: timeframe, severity: "")
    #v(8pt)

    // Main body: two-column if sidebar provided, else single-column.
    #if has-sidebar {
      grid(
        columns: (1.9fr, 1fr),
        gutter: 14pt,
        // MAIN COLUMN
        [
          #if slide-type == "bluf" {
            bluf-block(bluf, portion: portion, hero: true)
            if bullets != "" {
              v(10pt)
              render-bullets(bullets, default-portion: portion)
            }
          } else if slide-type == "confidence" {
            if bullets != "" {
              render-bullets(bullets, default-portion: portion)
              v(10pt)
            }
            confidence-block(likelihood-text, confidence-text, portion: portion)
          } else if slide-type == "mlcoa" {
            coa-layout("Most Likely COA", title, bullets, portion: portion, severity: severity)
          } else if slide-type == "mdcoa" {
            coa-layout("Most Dangerous COA", title, bullets, portion: portion, severity: severity)
          } else {
            if bluf != "" {
              bluf-block(bluf, portion: portion)
              v(10pt)
            }
            render-bullets(bullets, default-portion: portion)
          }
        ],
        // SIDEBAR
        sidebar-block(
          title: sidebar-title,
          body: sidebar-body,
          int-sources: int-sources,
          key-judgments: kjs,
          portion: portion,
        ),
      )
    } else {
      if slide-type == "bluf" {
        bluf-block(bluf, portion: portion, hero: true)
        if bullets != "" {
          v(10pt)
          render-bullets(bullets, default-portion: portion)
        }
      } else if slide-type == "confidence" {
        if bullets != "" {
          render-bullets(bullets, default-portion: portion)
          v(10pt)
        }
        confidence-block(likelihood-text, confidence-text, portion: portion)
      } else if slide-type == "mlcoa" {
        coa-layout("Most Likely COA", title, bullets, portion: portion, severity: severity)
      } else if slide-type == "mdcoa" {
        coa-layout("Most Dangerous COA", title, bullets, portion: portion, severity: severity)
      } else {
        if bluf != "" {
          bluf-block(bluf, portion: portion)
          v(10pt)
        }
        render-bullets(bullets, default-portion: portion)
      }
    }

    #if str(notes).trim() != "" {
      v(1fr)
      block(
        width: 100%,
        inset: (x: 10pt, y: 6pt),
        fill: af-colors.panel-bg,
        stroke: (top: 0.5pt + af-colors.content-rule),
      )[
        #set text(size: 9pt, style: "italic", fill: af-colors.muted)
        #text(weight: "bold", tracking: 0.1em, fill: af-colors.muted, "ANALYST NOTE: ")
        #notes
      ]
    }
  ]
}

// ─── IMAGE SLIDE ───────────────────────────────────────────────────────────

#let image-slide(
  portion: "U",
  title: "",
  image-content: none,
  caption: "",
  notional: false,
) = {
  block(
    width: 100%,
    height: 100%,
    inset: (x: config.content-pad-x, y: config.content-pad-y),
  )[
    #if notional { notional-watermark() }

    #block(
      width: 100%,
      inset: (bottom: 4pt),
      stroke: (bottom: 1.5pt + af-colors.af-blue),
    )[
      #set par(spacing: 0pt)
      #text(font: config.fonts, size: config.slide-title-size, weight: "bold",
        fill: af-colors.af-blue, portion-prefix(portion) + title)
    ]

    #v(8pt)
    #if image-content != none { align(center + horizon, image-content) }

    #if caption != "" [
      #align(center)[
        #text(size: 10pt, style: "italic", fill: af-colors.muted,
          portion-prefix(portion) + caption)
      ]
    ]
  ]
}
