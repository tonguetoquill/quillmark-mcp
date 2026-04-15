// layout.typ — CNN.com web-article typography + page setup.
// Bundled font: Inter (neo-grotesque, closest OFL match to CNN Sans).

#let colors = (
  cnn-red: rgb("#CC0000"),
  cnn-red-dark: rgb("#990000"),
  text-primary: rgb("#262626"),
  text-secondary: rgb("#494949"),
  text-muted: rgb("#717171"),
  rule: rgb("#E2E2E2"),
  rule-dark: rgb("#333333"),
  editors-note-bg: rgb("#FFF9E6"),
  editors-note-border: rgb("#F5A623"),
  update-bg: rgb("#F7F7F7"),
  related-bg: rgb("#F9F9F9"),
  related-border: rgb("#E5E5E5"),
  tag-bg: rgb("#F0F0F0"),
  link: rgb("#0F6FEC"),
  white: rgb("#FFFFFF"),
  black: rgb("#000000"),
)

#let config = (
  headline-font: ("Inter",),
  body-font: ("Inter",),
  base-size: 11pt,
  leading: 6pt,
  paragraph-spacing: 14pt,
  margin: (top: 0.5in, right: 0.9in, bottom: 0.6in, left: 0.9in),
  colors: colors,
)

// Format "2026-04-15" → "April 15, 2026". Matches CNN body-text date usage.
#let format-cnn-date(value) = {
  let raw = if value == none { "" } else { str(value).trim() }
  if raw == "" { return none }
  let parts = raw.split("-")
  if parts.len() != 3 { return raw }
  let months = (
    "01": "January", "02": "February", "03": "March", "04": "April",
    "05": "May", "06": "June", "07": "July", "08": "August",
    "09": "September", "10": "October", "11": "November", "12": "December",
  )
  let year = parts.at(0, default: raw)
  let month = months.at(parts.at(1, default: ""), default: none)
  let day-raw = parts.at(2, default: "")
  let day = if day-raw.starts-with("0") and day-raw.len() == 2 { day-raw.slice(1) } else { day-raw }
  if month == none or day == "" { return raw }
  month + " " + day + ", " + year
}

// "Dec 10, 2025" — short form for timestamp line.
#let format-cnn-short(value) = {
  let raw = if value == none { "" } else { str(value).trim() }
  if raw == "" { return none }
  let parts = raw.split("-")
  if parts.len() != 3 { return raw }
  let months = (
    "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr",
    "05": "May", "06": "Jun", "07": "Jul", "08": "Aug",
    "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec",
  )
  let year = parts.at(0, default: raw)
  let month = months.at(parts.at(1, default: ""), default: none)
  let day-raw = parts.at(2, default: "")
  let day = if day-raw.starts-with("0") and day-raw.len() == 2 { day-raw.slice(1) } else { day-raw }
  if month == none or day == "" { return raw }
  month + " " + day + ", " + year
}

// Global article show rule — white page, Inter body, block paragraphs.
#let article(content) = {
  set page(
    paper: "us-letter",
    margin: config.margin,
    fill: config.colors.white,
  )

  set text(
    font: config.body-font,
    size: config.base-size,
    fill: config.colors.text-primary,
  )

  set par(
    leading: config.leading,
    justify: false,
    first-line-indent: 0pt,
    spacing: config.paragraph-spacing,
  )

  show link: it => text(fill: config.colors.link, it)

  content
}
