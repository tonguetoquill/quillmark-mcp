#import "@local/quillmark-helper:0.1.0": data
#import "@local/ttq-nyt-news-article:0.1.0": article, config, masthead, byline-block, article-meta, article-footer, correction-box, format-article-date

// Apply global article styling
#show: article

// 1. MASTHEAD
#masthead(
  mast-text: data.at("masthead_text", default: "The New York Times"),
  section: data.at("section", default: "World"),
  date: data.publication_date,
  edition: data.at("print_edition_date", default: ""),
)

// 2. HEADLINE
#align(center)[
  #set par(first-line-indent: 0pt)
  #text(font: config.headline-font, size: 28pt, weight: "bold")[
    #data.headline
  ]
]

// 3. SUBHEADLINE (optional)
#if data.at("subheadline", default: "") != "" {
  v(4pt)
  align(center)[
    #set par(first-line-indent: 0pt)
    #text(font: config.body-font, size: 14pt, style: "italic",
      fill: config.colors.text-secondary, data.subheadline)
  ]
}

// 4. ABSTRACT / STANDFIRST (optional)
#if data.at("abstract", default: "") != "" {
  v(6pt)
  align(center)[
    #set par(first-line-indent: 0pt)
    #text(font: config.body-font, size: 11pt,
      fill: config.colors.text-secondary, data.abstract)
  ]
}

// 5. HORIZONTAL RULE
#v(8pt)
#line(length: 100%, stroke: 0.5pt + config.colors.rule-light)
#v(4pt)

// 6. BYLINE AND DATE
#byline-block(
  byline: data.byline,
  dateline: data.at("dateline", default: ""),
  date: format-article-date(data.publication_date),
)

// 7. BODY
// If dateline is present, prepend it in small-caps at the start of the body
#v(10pt)
#{
  let dl = data.at("dateline", default: "")
  if dl != "" {
    set par(first-line-indent: 0pt)
    text(font: config.body-font, size: config.base-size,
      weight: "bold", upper(dl))
    [ --- ]
  }
}
#data.BODY

// 8. CORRECTION (optional)
#if data.at("correction", default: "") != "" {
  v(14pt)
  correction-box(data.correction)
}

// 9. METADATA FOOTER
#article-meta(
  tags: data.at("tags", default: ()),
  persons: data.at("persons", default: ()),
  locations: data.at("locations", default: ()),
  organizations: data.at("organizations", default: ()),
)

// 10. WORD COUNT FOOTER (optional)
#{
  let wc = data.at("word_count", default: 0)
  if type(wc) == int and wc > 0 {
    article-footer(word-count: wc)
  } else if type(wc) == float and wc > 0 {
    article-footer(word-count: int(wc))
  }
}
