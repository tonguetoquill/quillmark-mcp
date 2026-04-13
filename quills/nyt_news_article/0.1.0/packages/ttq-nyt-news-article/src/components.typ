// components.typ — Rendering components for NYT-style news article

#import "layout.typ": config, format-article-date

// =============================================================================
// MASTHEAD
// =============================================================================

#let masthead(mast-text: "The New York Times", section: "World", date: "", edition: "") = {
  // Top thin rule
  line(length: 100%, stroke: 0.5pt + config.colors.rule)
  v(3pt)

  // Date and section info row
  {
    set text(font: config.body-font, size: 8pt, fill: config.colors.text-secondary)
    grid(
      columns: (1fr, 1fr, 1fr),
      align: (left, center, right),
      [#section],
      [],
      [#format-article-date(date)
       #if edition != "" [ | #edition]],
    )
  }

  v(6pt)

  // Masthead title
  align(center, text(
    font: config.masthead-font,
    size: 42pt,
    weight: "bold",
    fill: config.colors.text-primary,
    mast-text,
  ))

  v(6pt)

  // Double rule below masthead
  line(length: 100%, stroke: 1.5pt + config.colors.rule)
  v(1.5pt)
  line(length: 100%, stroke: 0.5pt + config.colors.rule)
  v(10pt)
}

// =============================================================================
// BYLINE BLOCK
// =============================================================================

#let byline-block(byline: "", dateline: "", date: "") = {
  set par(first-line-indent: 0pt, spacing: 3pt)

  // Byline
  if byline != "" {
    text(font: config.body-font, size: 10pt, weight: "bold",
      fill: config.colors.text-secondary, byline)
    linebreak()
  }

  // Date
  if date != "" {
    text(font: config.body-font, size: 9pt, fill: config.colors.text-muted, date)
  }
}

// =============================================================================
// ARTICLE METADATA FOOTER
// =============================================================================

#let article-meta(tags: (), persons: (), locations: (), organizations: ()) = {
  let has-any = tags.len() > 0 or persons.len() > 0 or locations.len() > 0 or organizations.len() > 0
  if has-any {
    v(16pt)
    line(length: 100%, stroke: 0.5pt + config.colors.rule-light)
    v(8pt)

    set text(font: config.body-font, size: 8pt, fill: config.colors.text-muted)
    set par(first-line-indent: 0pt, spacing: 4pt)

    if tags.len() > 0 {
      [*Tags:* #tags.join(", ")]
      linebreak()
    }
    if persons.len() > 0 {
      [*Persons:* #persons.join(", ")]
      linebreak()
    }
    if locations.len() > 0 {
      [*Locations:* #locations.join(", ")]
      linebreak()
    }
    if organizations.len() > 0 {
      [*Organizations:* #organizations.join(", ")]
    }
  }
}

// =============================================================================
// ARTICLE FOOTER
// =============================================================================

#let article-footer(word-count: 0) = {
  if word-count > 0 {
    v(8pt)
    align(right, text(
      font: config.body-font,
      size: 8pt,
      fill: config.colors.text-muted,
      [#word-count words],
    ))
  }
}

// =============================================================================
// CORRECTION BOX
// =============================================================================

#let correction-box(correction-text) = {
  if correction-text != "" {
    block(
      width: 100%,
      inset: 12pt,
      stroke: 1pt + config.colors.correction-border,
      fill: config.colors.correction-bg,
      radius: 0pt,
    )[
      #set par(first-line-indent: 0pt, spacing: 4pt)
      #set text(font: config.body-font, size: 9pt, fill: config.colors.text-primary)
      #text(weight: "bold")[Correction:] #correction-text
    ]
  }
}
