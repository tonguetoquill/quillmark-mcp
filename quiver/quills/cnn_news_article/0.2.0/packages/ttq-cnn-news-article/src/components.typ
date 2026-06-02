// components.typ — CNN.com web-article components.
// Visual reference: cnn.com/2026 articles. Inter stands in for CNN Sans.

#import "layout.typ": config, format-cnn-date, format-cnn-short

// ─── HEADER ────────────────────────────────────────────────────────────────
//
// Post-2024 CNN header: white background, red CNN logo box left-aligned,
// thin black underline across the full width.

#let header-bar(category: "News") = {
  block(
    width: 100%,
    inset: (y: 4pt),
    stroke: (bottom: 1pt + config.colors.black),
  )[
    #set par(spacing: 0pt)
    #grid(
      columns: (auto, 1fr),
      align: (left + horizon, right + horizon),
      box(
        inset: (x: 10pt, y: 6pt),
        fill: config.colors.cnn-red,
        text(
          font: config.headline-font,
          size: 22pt,
          weight: "black",
          style: "italic",
          fill: config.colors.white,
          tracking: -0.02em,
          "CNN",
        ),
      ),
      text(
        font: config.body-font,
        size: 9pt,
        weight: "bold",
        tracking: 0.1em,
        fill: config.colors.text-primary,
        upper(category),
      ),
    )
  ]
}

// ─── BREAKING BANNER ───────────────────────────────────────────────────────

#let breaking-banner() = {
  v(6pt)
  block(
    width: 100%,
    inset: (x: 12pt, y: 6pt),
    fill: config.colors.cnn-red,
  )[
    #set par(spacing: 0pt)
    #text(
      font: config.headline-font,
      size: 11pt,
      weight: "black",
      fill: config.colors.white,
      tracking: 0.1em,
      upper("Breaking News"),
    )
  ]
}

// ─── SECTION KICKER (above headline) ──────────────────────────────────────
//
// Red uppercase label like "POLITICS" in CNN red, Inter Bold, tracked — the
// tell-tale signature above every CNN headline.

#let section-kicker(category: "") = {
  if category == "" { return none }
  text(
    font: config.headline-font,
    size: 9pt,
    weight: "bold",
    tracking: 0.14em,
    fill: config.colors.cnn-red,
    upper(category),
  )
}

// ─── BYLINE BLOCK ──────────────────────────────────────────────────────────
//
// CNN convention: "By Jane Doe, CNN" — the ", CNN" suffix is load-bearing.
// Rendered bold, sans, at body size.

#let byline-block(author: "", author-title: "") = {
  set par(spacing: 3pt, justify: false, leading: 1em)
  if author == "" { return none }

  text(font: config.body-font, size: 11pt, weight: "bold",
    fill: config.colors.text-primary)[By #author, ]
  text(font: config.body-font, size: 11pt, weight: "bold",
    fill: config.colors.cnn-red)[CNN]

  if author-title != "" {
    linebreak()
    text(font: config.body-font, size: 9pt, weight: "regular",
      fill: config.colors.text-muted, author-title)
  }
}

// ─── TIMESTAMP BLOCK ───────────────────────────────────────────────────────
//
// "Updated Apr 15, 2026, 9:42 AM ET" — tight grey sans below byline.

#let timestamp-block(pub-date: none, updated-date: none) = {
  set par(spacing: 0pt, justify: false, leading: 1em)
  v(4pt)

  let shown-date = if updated-date != none { updated-date } else { pub-date }
  let label = if updated-date != none { "Updated" } else { "Published" }
  if shown-date == none { return none }

  text(font: config.body-font, size: 9pt, weight: "regular",
    fill: config.colors.text-muted, label + " " + shown-date)
}

// ─── DATELINE LEAD ─────────────────────────────────────────────────────────
//
// First-paragraph convention: "Washington CNN — " with CNN in bold red,
// followed by an em-dash. Inline fragment — emits no paragraph break so the
// body markdown continues naturally.

#let dateline-lead(dateline: "") = {
  if dateline == "" { return none }
  let clean = dateline.trim(",").trim()
  box(text(font: config.body-font, size: config.base-size, weight: "bold",
    fill: config.colors.text-primary, clean + " "))
  box(text(font: config.body-font, size: config.base-size, weight: "black",
    fill: config.colors.cnn-red, "CNN"))
  [ — ]
}

// ─── EDITOR'S NOTE ─────────────────────────────────────────────────────────

#let editors-note-box(note-text) = {
  if note-text == "" { return none }
  block(
    width: 100%,
    inset: 12pt,
    stroke: (left: 3pt + config.colors.editors-note-border),
    fill: config.colors.editors-note-bg,
  )[
    #set par(spacing: 4pt, justify: false)
    #set text(font: config.body-font, size: 10pt, fill: config.colors.text-primary)
    #text(weight: "bold", fill: config.colors.editors-note-border)[Editor's Note: ]
    #note-text
  ]
}

// ─── SUMMARY / LEDE BLOCK ──────────────────────────────────────────────────
//
// Red-left-rule bolded summary, CNN-standard placement above body.

#let summary-block(summary-text) = {
  if summary-text == "" { return none }
  block(
    width: 100%,
    inset: (left: 12pt, y: 4pt),
    stroke: (left: 3pt + config.colors.cnn-red),
  )[
    #set text(font: config.body-font, size: 11pt, weight: "bold",
      fill: config.colors.text-primary)
    #set par(justify: false, leading: 1.35em)
    #summary-text
  ]
}

// ─── LIVE UPDATES ──────────────────────────────────────────────────────────

#let live-updates(cards) = {
  v(14pt)
  line(length: 100%, stroke: 1pt + config.colors.rule)
  v(8pt)

  text(font: config.headline-font, size: 16pt, weight: "black",
    fill: config.colors.text-primary, "Live Updates")
  v(3pt)
  text(font: config.body-font, size: 9pt, style: "italic",
    fill: config.colors.text-muted,
    "This is a developing story and will be updated.")

  v(10pt)

  for card in cards {
    block(
      width: 100%,
      inset: (left: 14pt, y: 6pt),
      stroke: (left: 2pt + config.colors.cnn-red),
    )[
      #set par(spacing: 3pt, justify: false, leading: 1.3em)
      #text(font: config.body-font, size: 8pt, weight: "bold",
        tracking: 0.08em, fill: config.colors.cnn-red,
        upper(card.at("timestamp", default: "")))

      #if card.at("update_headline", default: "") != "" {
        linebreak()
        text(font: config.body-font, size: 11pt, weight: "bold",
          fill: config.colors.text-primary, card.update_headline)
      }

      #if card.at("$body", default: "") != "" {
        linebreak()
        set text(font: config.body-font, size: 10pt,
          fill: config.colors.text-secondary)
        card.at("$body", default: [])
      }
    ]
    v(6pt)
  }
}

// ─── RELATED STORIES ───────────────────────────────────────────────────────

#let related-stories(cards) = {
  v(14pt)
  line(length: 100%, stroke: 1pt + config.colors.rule)
  v(6pt)

  text(font: config.headline-font, size: 12pt, weight: "bold",
    tracking: 0.06em, fill: config.colors.text-primary, upper("Related"))

  v(6pt)

  for card in cards {
    block(
      width: 100%,
      inset: (x: 10pt, y: 8pt),
      stroke: 1pt + config.colors.related-border,
      fill: config.colors.related-bg,
      radius: 3pt,
    )[
      #set par(spacing: 2pt, justify: false, leading: 1.25em)
      #text(font: config.body-font, size: 10pt, weight: "bold",
        fill: config.colors.text-primary, card.story_headline)
      #linebreak()
      #text(font: config.body-font, size: 8pt, weight: "medium",
        tracking: 0.06em, fill: config.colors.text-muted,
        upper(card.at("story_source", default: "CNN")))
    ]
    v(4pt)
  }
}

// ─── TAG FOOTER ────────────────────────────────────────────────────────────

#let article-footer(tags: ()) = {
  if tags.len() == 0 { return none }
  v(14pt)
  line(length: 100%, stroke: 0.5pt + config.colors.rule)
  v(8pt)

  set par(spacing: 0pt)
  for (i, tag) in tags.enumerate() {
    box(
      inset: (x: 10pt, y: 4pt),
      fill: config.colors.tag-bg,
      radius: 3pt,
      text(font: config.body-font, size: 8pt, weight: "medium",
        tracking: 0.06em, fill: config.colors.text-secondary, upper(tag)),
    )
    if i < tags.len() - 1 { h(5pt) }
  }
}
