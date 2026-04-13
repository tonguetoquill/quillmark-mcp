#import "@local/quillmark-helper:0.1.0": data
#import "@local/ttq-cnn-news-article:0.1.0": article, config, header-bar, breaking-banner, byline-block, timestamp-block, editors-note-box, live-updates, related-stories, article-footer, format-cnn-date

// Apply global article styling
#show: article

// 1. CNN HEADER BAR
#header-bar(category: data.category)

// 2. BREAKING NEWS BANNER (conditional)
#if data.at("breaking_news", default: "false") == "true" {
  breaking-banner()
}

// 3. HEADLINE
#v(10pt)
#text(font: config.headline-font, size: 26pt, weight: "bold",
  fill: config.colors.text-primary)[
  #data.headline
]

// 4. SUBHEADLINE (optional)
#if data.at("subheadline", default: "") != "" {
  v(4pt)
  text(font: config.body-font, size: 13pt,
    fill: config.colors.text-secondary, data.subheadline)
}

// 5. BYLINE AND TIMESTAMPS
#v(10pt)
#byline-block(
  author: data.author,
  author-title: data.at("author_title", default: ""),
  dateline: data.at("dateline", default: ""),
)
#timestamp-block(
  pub-date: format-cnn-date(data.publication_date),
  updated-date: {
    let ud = data.at("updated_date", default: "")
    if ud != "" { format-cnn-date(ud) } else { none }
  },
)

// 6. EDITOR'S NOTE (optional)
#if data.at("editors_note", default: "") != "" {
  v(8pt)
  editors-note-box(data.editors_note)
}

// 7. SUMMARY (optional)
#if data.at("summary", default: "") != "" {
  v(8pt)
  block(
    width: 100%,
    inset: (left: 12pt, y: 4pt),
    stroke: (left: 3pt + config.colors.cnn-red, rest: none),
  )[
    #set text(font: config.body-font, size: 10.5pt, weight: "bold",
      fill: config.colors.text-secondary)
    #data.summary
  ]
}

// 8. BODY
#v(10pt)
#data.BODY

// 9. LIVE UPDATES (from cards)
#{
  let updates = data.CARDS.filter(c => c.CARD == "live_update")
  if updates.len() > 0 {
    live-updates(updates)
  }
}

// 10. RELATED STORIES (from cards)
#{
  let related = data.CARDS.filter(c => c.CARD == "related_story")
  if related.len() > 0 {
    related-stories(related)
  }
}

// 11. TAG FOOTER
#article-footer(tags: data.at("tags", default: ()))
