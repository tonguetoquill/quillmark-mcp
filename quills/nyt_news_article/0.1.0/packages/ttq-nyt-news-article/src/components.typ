// components.typ — NYT-style rendering components.
//
// Visual reference: nytimes.com front-page articles. Fonts land directly on
// the Typst family names as reported by fc-scan against the bundled TTFs:
// Manufacturing Consent, Playfair Display, Source Serif 4, Libre Franklin.

#import "layout.typ": config, format-long-date, format-article-date

// ─── MASTHEAD ───────────────────────────────────────────────────────────────

#let masthead(
  mast-text: "The New York Times",
  section: "World",
  date: "",
  edition: "",
  volume: "",
) = {
  // Top hairline
  line(length: 100%, stroke: 0.5pt + config.colors.rule)
  v(2pt)

  // Volume / tagline / edition row — small sans in all caps.
  {
    set text(font: config.sans-font, size: 7pt, tracking: 0.08em,
      fill: config.colors.text-secondary, weight: "medium")
    let vol-line = if volume != "" { volume } else {
      "VOL. CLXXV ...... NO. " + (
        if date != "" { "61,234" } else { "XX,XXX" }
      )
    }
    grid(
      columns: (1fr, 2fr, 1fr),
      align: (left + horizon, center + horizon, right + horizon),
      upper(vol-line),
      upper("\"All the News That's Fit to Print\""),
      upper(if edition != "" { edition } else { "Late Edition" }),
    )
  }

  v(6pt)

  // Masthead title (Manufacturing Consent — English blackletter)
  align(center, text(
    font: config.masthead-font,
    size: 60pt,
    weight: "regular",
    fill: config.colors.text-primary,
    mast-text,
  ))

  v(6pt)

  // Long-date line centered below masthead
  {
    set text(font: config.sans-font, size: 8pt, tracking: 0.10em,
      fill: config.colors.text-primary, weight: "medium")
    align(center, upper("New York, " + format-long-date(date)))
  }

  v(5pt)

  // Double rule below masthead
  line(length: 100%, stroke: 1.2pt + config.colors.rule)
  v(1.6pt)
  line(length: 100%, stroke: 0.4pt + config.colors.rule)
  v(10pt)

  // Section kicker — small caps sans, centered
  if section != "" {
    align(center, text(
      font: config.sans-font,
      size: 8pt,
      weight: "bold",
      tracking: 0.14em,
      fill: config.colors.text-primary,
      upper(section),
    ))
    v(12pt)
  }
}

// ─── HEADLINE BLOCK ─────────────────────────────────────────────────────────

#let headline-block(headline: "", subheadline: "", abstract: "") = {
  set par(first-line-indent: 0pt, justify: false, leading: 1.05em)

  // Main headline — Playfair Display Black, centered, tight leading
  align(center, text(
    font: config.headline-font,
    size: 32pt,
    weight: "black",
    fill: config.colors.text-primary,
    tracking: -0.01em,
    headline,
  ))

  if subheadline != "" {
    v(8pt)
    align(center, text(
      font: config.subhead-font,
      size: 14pt,
      style: "italic",
      weight: "regular",
      fill: config.colors.text-secondary,
      subheadline,
    ))
  }

  if abstract != "" {
    v(10pt)
    align(center, block(
      width: 75%,
      text(
        font: config.body-font,
        size: 11pt,
        weight: "regular",
        fill: config.colors.text-secondary,
        abstract,
      ),
    ))
  }
}

// ─── BYLINE BLOCK ───────────────────────────────────────────────────────────

#let byline-block(byline: "", date: "") = {
  set par(first-line-indent: 0pt, justify: false, spacing: 2pt, leading: 1em)

  if byline != "" {
    // NYT uses "By JANE DOE" — "By" in mixed case, name in small-caps sans bold.
    let name = byline
    if byline.starts-with("By ") { name = byline.slice(3) }
    text(font: config.sans-font, size: 10pt, weight: "medium",
      fill: config.colors.text-primary)[By ]
    text(font: config.sans-font, size: 10pt, weight: "bold",
      tracking: 0.08em, fill: config.colors.text-primary)[#upper(name)]
    linebreak()
  }

  if date != "" {
    text(font: config.sans-font, size: 8pt, style: "italic",
      fill: config.colors.text-muted, date)
  }
}

// ─── DATELINE LEAD ─────────────────────────────────────────────────────────
//
// NYT convention: first paragraph starts with "WASHINGTON — " in bold small
// caps with an em-dash. This inline fragment renders only the lead so the
// body markdown following it picks up the paragraph naturally.

#let dateline-lead(dateline) = {
  if dateline == "" { return none }
  let clean = dateline.trim(",").trim()
  box(text(
    font: config.body-font,
    size: config.base-size,
    weight: "bold",
    tracking: 0.05em,
    fill: config.colors.text-primary,
    upper(clean) + " ",
  ))
  [— ]
}

// ─── CORRECTION BOX ────────────────────────────────────────────────────────

#let correction-box(correction-text) = {
  if correction-text != "" {
    block(
      width: 100%,
      inset: 10pt,
      stroke: (left: 2pt + config.colors.rule),
      fill: config.colors.correction-bg,
    )[
      #set par(first-line-indent: 0pt, spacing: 4pt, justify: false)
      #set text(font: config.body-font, size: 9pt, fill: config.colors.text-primary)
      #text(font: config.sans-font, weight: "bold",
        tracking: 0.08em, upper("Correction: "))#correction-text
    ]
  }
}

// ─── METADATA FOOTER ───────────────────────────────────────────────────────

#let article-meta(tags: (), persons: (), locations: (), organizations: ()) = {
  let has-any = (tags.len() > 0) or (persons.len() > 0) or (locations.len() > 0) or (organizations.len() > 0)
  if not has-any { return none }

  v(14pt)
  line(length: 100%, stroke: 0.5pt + config.colors.rule-light)
  v(8pt)

  set par(first-line-indent: 0pt, spacing: 4pt, justify: false, leading: 1.1em)
  set text(font: config.sans-font, size: 8pt, fill: config.colors.text-secondary)

  let row(label, values) = if values.len() > 0 {
    text(weight: "bold", tracking: 0.08em, upper(label + ": "))
    values.join(" · ")
    linebreak()
  }

  row("Tags", tags)
  row("People", persons)
  row("Places", locations)
  row("Organizations", organizations)
}

// ─── FOOTER / WORD COUNT ───────────────────────────────────────────────────

#let article-footer(word-count: 0) = {
  if word-count > 0 {
    v(8pt)
    align(right, text(
      font: config.sans-font,
      size: 8pt,
      style: "italic",
      fill: config.colors.text-muted,
      [#word-count words],
    ))
  }
}
