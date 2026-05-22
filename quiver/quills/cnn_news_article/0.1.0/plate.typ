#import "@local/quillmark-helper:0.1.0": data
#import "@local/ttq-cnn-news-article:0.1.0": article, config, header-bar, breaking-banner, section-kicker, byline-block, timestamp-block, dateline-lead, editors-note-box, summary-block, live-updates, related-stories, article-footer, format-cnn-date, format-cnn-short

#show: article

// 1. HEADER BAR
#header-bar(category: data.category)

// 2. BREAKING NEWS BANNER (optional)
#if data.at("breaking_news", default: "false") == "true" {
  breaking-banner()
}

// 3. SECTION KICKER (red uppercase, above headline)
#v(14pt)
#section-kicker(category: data.category)

// 4. HEADLINE — tight leading, near-black, left aligned
#v(4pt)
#par(leading: 4pt)[
  #set text(
    font: config.headline-font,
    size: 28pt,
    weight: "black",
    fill: config.colors.text-primary,
    tracking: -0.01em,
  )
  #data.headline
]

// 5. SUBHEADLINE / DEK (optional)
#if data.at("subheadline", default: "") != "" {
  v(10pt)
  par(leading: 4pt)[
    #set text(
      font: config.body-font,
      size: 13pt,
      weight: "medium",
      fill: config.colors.text-secondary,
    )
    #data.subheadline
  ]
}

// 6. BYLINE + TIMESTAMP
#v(12pt)
#byline-block(
  author: data.author,
  author-title: data.at("author_title", default: ""),
)
#timestamp-block(
  pub-date: format-cnn-short(data.publication_date),
  updated-date: {
    let ud = data.at("updated_date", default: "")
    if ud != "" { format-cnn-short(ud) } else { none }
  },
)

// 7. SEPARATOR
#v(10pt)
#line(length: 100%, stroke: 0.5pt + config.colors.rule)
#v(8pt)

// 8. EDITOR'S NOTE (optional)
#if data.at("editors_note", default: "") != "" {
  editors-note-box(data.editors_note)
  v(8pt)
}

// 9. SUMMARY / LEDE (optional)
#if data.at("summary", default: "") != "" {
  summary-block(data.summary)
  v(12pt)
}

// 10. BODY — starts with "Location CNN —" dateline inline
#dateline-lead(dateline: data.at("dateline", default: ""))
#data.at("$body", default: [])

// 11. LIVE UPDATES (from cards)
#{
  let updates = data.at("$cards", default: ()).filter(c => c.at("$kind", default: "") == "live_update")
  if updates.len() > 0 { live-updates(updates) }
}

// 12. RELATED STORIES (from cards)
#{
  let related = data.at("$cards", default: ()).filter(c => c.at("$kind", default: "") == "related_story")
  if related.len() > 0 { related-stories(related) }
}

// 13. TAG FOOTER
#article-footer(tags: data.at("tags", default: ()))
