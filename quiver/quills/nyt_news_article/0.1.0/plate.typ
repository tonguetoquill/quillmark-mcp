#import "@local/quillmark-helper:0.1.0": data
#import "@local/ttq-nyt-news-article:0.1.0": article, config, masthead, headline-block, byline-block, dateline-lead, article-meta, article-footer, correction-box, format-article-date

#show: article

// 1. MASTHEAD — spans the full page width
#masthead(
  mast-text: data.at("masthead_text", default: "The New York Times"),
  section: data.at("section", default: ""),
  date: data.publication_date,
  edition: data.at("print_edition_date", default: datetime.today().display("[weekday repr:long], [month repr:long] [day], [year]")),
)

// 2. HEADLINE + SUBHEAD + ABSTRACT — full width
#headline-block(
  headline: data.headline,
  subheadline: data.at("subheadline", default: ""),
  abstract: data.at("abstract", default: ""),
)

#v(10pt)
#line(length: 100%, stroke: 0.5pt + config.colors.rule-light)
#v(8pt)

// 3. BYLINE — full width, left-aligned
#byline-block(
  byline: data.byline,
  date: format-article-date(data.publication_date),
)

#v(12pt)

// 4. BODY — flows into three columns like a print front page.
//    Dateline leads the first paragraph in bold small-caps with em-dash.
#columns(3, gutter: 12pt)[
  #dateline-lead(data.at("dateline", default: ""))
  #data.BODY

  // 5. CORRECTION (optional) — inside the column stream so it lands next to
  //    body copy as NYT typically places corrections at article end.
  #if data.at("correction", default: "") != "" {
    v(10pt)
    correction-box(data.correction)
  }

  // 6. METADATA FOOTER + WORD COUNT — floated to the bottom of the last page
  //    so the footer always shares a page with body copy.
  #place(bottom, scope: "parent", float: true)[
    #article-meta(
      tags: data.at("tags", default: ()),
      persons: data.at("persons", default: ()),
      locations: data.at("locations", default: ()),
      organizations: data.at("organizations", default: ()),
    )
    #{
      let wc = data.at("word_count", default: 0)
      if type(wc) == int and wc > 0 {
        article-footer(word-count: wc)
      } else if type(wc) == float and wc > 0 {
        article-footer(word-count: int(wc))
      }
    }
  ]
]
