// layout.typ — Page setup, configuration constants, and global styles for CNN-style article

// =============================================================================
// COLOR PALETTE
// =============================================================================

#let colors = (
  cnn-red: rgb("#CC0000"),
  cnn-red-dark: rgb("#990000"),
  text-primary: rgb("#1A1A1A"),
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
  white: rgb("#FFFFFF"),
)

// =============================================================================
// CONFIGURATION
// =============================================================================

#let config = (
  headline-font: ("Helvetica Neue", "Helvetica", "Arial", "Libertinus Sans"),
  body-font: ("Helvetica Neue", "Helvetica", "Arial", "Libertinus Sans"),
  mono-font: ("Courier New", "DejaVu Sans Mono"),
  base-size: 11pt,
  leading: 0.72em,
  margin: (top: 0.5in, right: 0.75in, bottom: 0.75in, left: 0.75in),
  colors: colors,
)

// =============================================================================
// DATE FORMATTING
// =============================================================================

#let format-cnn-date(value) = {
  let raw = if value == none { "" } else { str(value).trim() }
  if raw == "" { none }
  else {
    let parts = raw.split("-")
    if parts.len() == 3 {
      let month-map = (
        "01": "January", "02": "February", "03": "March", "04": "April",
        "05": "May", "06": "June", "07": "July", "08": "August",
        "09": "September", "10": "October", "11": "November", "12": "December",
      )
      let year = parts.at(0, default: raw)
      let month = month-map.at(parts.at(1, default: ""), default: none)
      let day-raw = parts.at(2, default: "")
      let day = if day-raw.starts-with("0") and day-raw.len() == 2 {
        day-raw.slice(1)
      } else {
        day-raw
      }
      if month != none and day != "" {
        month + " " + day + ", " + year
      } else {
        raw
      }
    } else {
      raw
    }
  }
}

// =============================================================================
// ARTICLE SHOW RULE (GLOBAL SETUP)
// =============================================================================

#let article(content) = {
  set page(
    paper: "us-letter",
    margin: config.margin,
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
    spacing: 0.65em,
  )

  show link: it => text(fill: rgb("#0F6FEC"), underline(it))

  content
}
