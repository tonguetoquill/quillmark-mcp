// components.typ — Rendering components for CNN-style news article

#import "layout.typ": config, format-cnn-date

// =============================================================================
// CNN HEADER BAR
// =============================================================================

#let header-bar(category: "News") = {
  block(
    width: 100%,
    inset: (x: 12pt, y: 8pt),
    fill: config.colors.cnn-red,
    radius: 0pt,
  )[
    #set par(spacing: 0pt)
    #grid(
      columns: (auto, 1fr, auto),
      align: (left + horizon, center, right + horizon),
      text(font: config.headline-font, size: 22pt, weight: "bold",
        fill: config.colors.white, "CNN"),
      [],
      text(font: config.body-font, size: 10pt, weight: "bold",
        fill: config.colors.white, upper(category)),
    )
  ]
}

// =============================================================================
// BREAKING NEWS BANNER
// =============================================================================

#let breaking-banner() = {
  block(
    width: 100%,
    inset: (x: 12pt, y: 6pt),
    fill: config.colors.cnn-red-dark,
    radius: 0pt,
  )[
    #set par(spacing: 0pt)
    #align(center, text(
      font: config.headline-font,
      size: 14pt,
      weight: "bold",
      fill: config.colors.white,
      tracking: 2pt,
      upper("Breaking News"),
    ))
  ]
}

// =============================================================================
// BYLINE BLOCK
// =============================================================================

#let byline-block(author: "", author-title: "", dateline: "") = {
  set par(spacing: 2pt)

  if author != "" {
    text(font: config.body-font, size: 10pt, weight: "bold",
      fill: config.colors.text-primary,
      [By #author])
    if dateline != "" {
      text(font: config.body-font, size: 10pt,
        fill: config.colors.text-muted, [, #dateline])
    }
    linebreak()
  }

  if author-title != "" {
    text(font: config.body-font, size: 9pt, style: "italic",
      fill: config.colors.text-muted, author-title)
  }
}

// =============================================================================
// TIMESTAMP BLOCK
// =============================================================================

#let timestamp-block(pub-date: none, updated-date: none) = {
  set par(spacing: 2pt)
  v(4pt)

  if pub-date != none {
    text(font: config.body-font, size: 9pt,
      fill: config.colors.text-muted,
      [Published #pub-date])
  }
  if updated-date != none {
    if pub-date != none { linebreak() }
    text(font: config.body-font, size: 9pt, weight: "bold",
      fill: config.colors.text-muted,
      [Updated #updated-date])
  }
}

// =============================================================================
// EDITOR'S NOTE BOX
// =============================================================================

#let editors-note-box(note-text) = {
  if note-text != "" {
    block(
      width: 100%,
      inset: 12pt,
      stroke: (left: 3pt + config.colors.editors-note-border, rest: none),
      fill: config.colors.editors-note-bg,
      radius: 0pt,
    )[
      #set par(spacing: 4pt)
      #set text(font: config.body-font, size: 10pt, fill: config.colors.text-primary)
      #text(weight: "bold", fill: config.colors.editors-note-border)[Editor's Note:] #note-text
    ]
  }
}

// =============================================================================
// LIVE UPDATES
// =============================================================================

#let live-updates(cards) = {
  v(12pt)
  line(length: 100%, stroke: 1pt + config.colors.rule)
  v(6pt)

  text(font: config.headline-font, size: 14pt, weight: "bold",
    fill: config.colors.text-primary, "Live Updates")
  v(2pt)
  text(font: config.body-font, size: 9pt, style: "italic",
    fill: config.colors.text-muted,
    "This is a developing story and will be updated.")

  v(8pt)

  for card in cards {
    // Timeline entry
    block(
      width: 100%,
      inset: (left: 16pt, y: 6pt),
      stroke: (left: 2pt + config.colors.cnn-red, rest: none),
    )[
      #set par(spacing: 4pt)
      // Timestamp
      #text(font: config.mono-font, size: 8pt, weight: "bold",
        fill: config.colors.cnn-red,
        card.at("timestamp", default: ""))

      // Headline
      #if card.at("update_headline", default: "") != "" {
        linebreak()
        text(font: config.body-font, size: 10pt, weight: "bold",
          fill: config.colors.text-primary,
          card.update_headline)
      }

      // Body
      #if card.BODY != "" {
        linebreak()
        set text(font: config.body-font, size: 10pt, fill: config.colors.text-secondary)
        card.BODY
      }
    ]
    v(4pt)
  }
}

// =============================================================================
// RELATED STORIES
// =============================================================================

#let related-stories(cards) = {
  v(12pt)
  line(length: 100%, stroke: 1pt + config.colors.rule)
  v(6pt)

  text(font: config.headline-font, size: 12pt, weight: "bold",
    fill: config.colors.text-primary, "Related Stories")

  v(6pt)

  for card in cards {
    block(
      width: 100%,
      inset: 10pt,
      stroke: 1pt + config.colors.related-border,
      fill: config.colors.related-bg,
      radius: 3pt,
    )[
      #set par(spacing: 2pt)
      #text(font: config.body-font, size: 10pt, weight: "bold",
        fill: config.colors.text-primary,
        card.story_headline)
      #linebreak()
      #text(font: config.body-font, size: 8pt, style: "italic",
        fill: config.colors.text-muted,
        card.at("story_source", default: "CNN"))
    ]
    v(4pt)
  }
}

// =============================================================================
// ARTICLE FOOTER
// =============================================================================

#let article-footer(tags: ()) = {
  if tags.len() > 0 {
    v(12pt)
    line(length: 100%, stroke: 0.5pt + config.colors.rule)
    v(6pt)

    // Tags as pill badges
    set par(spacing: 0pt)
    for (i, tag) in tags.enumerate() {
      box(
        inset: (x: 8pt, y: 3pt),
        fill: config.colors.tag-bg,
        radius: 10pt,
      )[
        #text(font: config.body-font, size: 8pt, fill: config.colors.text-secondary, tag)
      ]
      if i < tags.len() - 1 {
        h(4pt)
      }
    }
  }
}
