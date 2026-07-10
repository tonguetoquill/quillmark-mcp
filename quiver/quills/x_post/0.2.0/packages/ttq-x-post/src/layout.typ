// layout.typ — X (Twitter) feed typography, themes, and page setup.
// Measurements and colors mirror vercel/react-tweet (MIT) — the most
// faithful public implementation of x.com's tweet card CSS.

#let themes = (
  // Dim (the canonical "X dark blue" palette)
  dim: (
    bg: rgb("#15202B"),
    card: rgb("#15202B"),
    card-hover: rgb("#1E2732"),
    text: rgb("#F7F9F9"),
    secondary: rgb("#8B98A5"),
    border: rgb("#425364"),
    brand: rgb("#1D9BF0"),
    brand-hover: rgb("#1A8CD8"),
    link: rgb("#6BC9FB"),
    like: rgb("#F91880"),
    repost: rgb("#00BA7C"),
    verified-blue: rgb("#1D9BF0"),
    verified-gold: rgb("#E2B719"),
    verified-gray: rgb("#829AAB"),
  ),
  light: (
    bg: rgb("#FFFFFF"),
    card: rgb("#FFFFFF"),
    card-hover: rgb("#F7F9F9"),
    text: rgb("#0F1419"),
    secondary: rgb("#536471"),
    border: rgb("#EFF3F4"),
    brand: rgb("#1D9BF0"),
    brand-hover: rgb("#1A8CD8"),
    link: rgb("#1D9BF0"),
    like: rgb("#F91880"),
    repost: rgb("#00BA7C"),
    verified-blue: rgb("#1D9BF0"),
    verified-gold: rgb("#E2B719"),
    verified-gray: rgb("#829AAB"),
  ),
  lights_out: (
    bg: rgb("#000000"),
    card: rgb("#000000"),
    card-hover: rgb("#16181C"),
    text: rgb("#E7E9EA"),
    secondary: rgb("#71767B"),
    border: rgb("#2F3336"),
    brand: rgb("#1D9BF0"),
    brand-hover: rgb("#1A8CD8"),
    link: rgb("#6BC9FB"),
    like: rgb("#F91880"),
    repost: rgb("#00BA7C"),
    verified-blue: rgb("#1D9BF0"),
    verified-gold: rgb("#E2B719"),
    verified-gray: rgb("#829AAB"),
  ),
)

// Config — exact pixel measurements from react-tweet.
// 1 pt in Typst = 1/72 in; 1 px ≈ 0.75 pt. We use pt directly with 1pt ≈ 1.333px
// to keep everything on the 600px tweet-card scale at 600pt wide.
//
// For the feed, we render the page at 600pt wide so numeric px values map 1:1
// (treating pt as our px unit for layout purposes). Typography uses pt.

#let config = (
  font: ("Inter", "Noto Color Emoji"),
  // Typography — react-tweet embed sizes (slightly larger than timeline for
  // readability in a static PDF where text is the whole point).
  name-size: 15pt,
  name-weight: "bold",
  handle-size: 14pt,
  body-size: 17pt,             // 20px embed spec → 17pt for PDF readability
  body-leading: 7pt,           // 24px line-height on 20px body = generous lead
  quoted-body-size: 15pt,
  action-count-size: 13pt,
  action-count-weight: "bold",
  replying-to-size: 14pt,
  timestamp-size: 14pt,

  // Layout (px as pt)
  card-width: 600pt,
  card-padding-x: 16pt,
  card-padding-y: 12pt,
  card-radius: 12pt,
  avatar-size: 48pt,
  avatar-quoted-size: 20pt,
  avatar-gutter: 12pt,          // gap between avatar and text column
  body-margin-top: 8pt,
  engagement-margin-top: 12pt,
  engagement-border-top: 1pt,
  engagement-icon-size: 17pt,
  engagement-wrapper-size: 32pt,
  action-gap: 20pt,
  quoted-radius: 12pt,
  quoted-margin-y: 12pt,
  quoted-padding-x: 12pt,
  quoted-padding-y: 12pt,
  quoted-avatar-gap: 6pt,
  community-note-radius: 12pt,
  community-note-padding: 12pt,

  // Verified badge sizing — inline with display name, ~1.25em of name.
  verified-size: 18pt,
)

#let theme-of(name) = {
  let key = str(name).trim()
  if key in themes { themes.at(key) } else { themes.dim }
}

#let is-true(v) = {
  if type(v) == bool {
    v
  } else {
    let s = str(v).trim()
    s == "true" or s == "True" or s == "TRUE" or s == "yes" or s == "1"
  }
}

// format-count — exact react-tweet rules.
//   0–999:       literal integer string (no grouping)
//   1,000–9,999: one decimal + "K"  (1.2K)
//   10,000+:     integer + "K"       (12K, 999K)
//   1,000,000+:  one decimal + "M"
//   1,000,000,000+: one decimal + "B"
// Returns none if empty or zero (caller hides the count).
#let format-count(value) = {
  let raw = if value == none { "" } else { str(value).trim() }
  if raw == "" { return none }
  let digits = raw.replace(",", "")
  // Reject non-integer inputs gracefully.
  let n = 0
  if digits.match(regex("^[0-9]+$")) != none {
    n = int(digits)
  } else {
    return raw
  }
  if n == 0 { return none }
  if n < 1000 { return str(n) }
  if n < 10000 {
    let k = n / 1000.0
    let rounded = calc.round(k, digits: 1)
    return str(rounded) + "K"
  }
  if n < 1000000 {
    return str(int(n / 1000)) + "K"
  }
  if n < 1000000000 {
    let m = n / 1000000.0
    let rounded = calc.round(m, digits: 1)
    return str(rounded) + "M"
  }
  let b = n / 1000000000.0
  return str(calc.round(b, digits: 1)) + "B"
}

// Global feed show rule — fills page with theme bg, sets Inter body.
#let x-feed(theme-name: "dim", content) = {
  let t = theme-of(theme-name)
  set page(
    width: config.card-width,
    height: auto,
    margin: 0pt,
    fill: t.bg,
  )
  set text(
    font: config.font,
    size: config.body-size,
    fill: t.text,
  )
  set par(
    leading: config.body-leading,
    justify: false,
    first-line-indent: 0pt,
    spacing: 6pt,
  )
  content
}
