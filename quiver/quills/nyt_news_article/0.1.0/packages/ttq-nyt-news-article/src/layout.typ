// layout.typ — NYT broadsheet typography + page setup.
// Bundled fonts: Manufacturing Consent (masthead textura), Playfair Display
// (headline display serif, Didone feel), Source Serif 4 (body news serif,
// Matthew Carter / Imperial lineage), Libre Franklin (Franklin Gothic revival
// for byline + section labels + metadata).

#let colors = (
  text-primary: rgb("#121212"),
  text-secondary: rgb("#333333"),
  text-muted: rgb("#666666"),
  rule: rgb("#121212"),
  rule-light: rgb("#BFBFBF"),
  correction-bg: rgb("#F6F1E7"),
  correction-border: rgb("#D9CFB8"),
  tag-bg: rgb("#F2F2F2"),
  link: rgb("#326891"),
)

#let config = (
  masthead-font: ("Manufacturing Consent",),
  headline-font: ("Playfair Display",),
  subhead-font: ("Source Serif 4", "Playfair Display"),
  body-font: ("Source Serif 4",),
  sans-font: ("Libre Franklin",),
  base-size: 10pt,
  leading: 12pt,
  paragraph-spacing: 12pt,
  margin: (top: 0.55in, right: 0.5in, bottom: 0.55in, left: 0.5in),
  colors: colors,
)

// Format "2026-04-15" → "April 15, 2026". Returns "" for empty, raw for malformed.
#let format-article-date(value) = {
  let raw = if value == none { "" } else { str(value).trim() }
  if raw == "" { return "" }
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

// Long-date masthead line — "Wednesday, April 15, 2026". Weekday via Zeller.
#let format-long-date(value) = {
  let raw = if value == none { "" } else { str(value).trim() }
  if raw == "" { return "" }
  let parts = raw.split("-")
  if parts.len() != 3 { return raw }
  let short = format-article-date(raw)
  if short == raw { return raw }
  // Zeller's congruence — Gregorian weekday.
  let yr = int(parts.at(0))
  let mo = int(parts.at(1))
  let dy = int(parts.at(2))
  let y = if mo < 3 { yr - 1 } else { yr }
  let m = if mo < 3 { mo + 12 } else { mo }
  let k = calc.rem(y, 100)
  let j = calc.quo(y, 100)
  let h = calc.rem(dy + calc.quo(13 * (m + 1), 5) + k + calc.quo(k, 4) + calc.quo(j, 4) + 5 * j, 7)
  let days = ("Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday")
  days.at(h) + ", " + short
}

// Global article show rule. Runs once at top of plate.typ.
#let article(content) = {
  set page(
    paper: "us-letter",
    margin: config.margin,
  )

  set text(
    font: config.body-font,
    size: config.base-size,
    fill: config.colors.text-primary,
    hyphenate: true,
  )

  set par(
    leading: config.leading,
    justify: true,
    spacing: 1.5em,
    // first-line-indent: 1.2em,
    linebreaks: auto,
  )

  show link: it => text(fill: config.colors.link, it)

  content
}
