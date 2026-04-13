// layout.typ — Page setup, configuration constants, and global styles for NYT-style article

// =============================================================================
// COLOR PALETTE
// =============================================================================

#let colors = (
  text-primary: rgb("#1A1A1A"),
  text-secondary: rgb("#555555"),
  text-muted: rgb("#999999"),
  rule: rgb("#333333"),
  rule-light: rgb("#CCCCCC"),
  correction-bg: rgb("#F5F5F5"),
  correction-border: rgb("#DDDDDD"),
  tag-bg: rgb("#F0F0F0"),
)

// =============================================================================
// CONFIGURATION
// =============================================================================

#let config = (
  masthead-font: ("UnifrakturCook",),
  headline-font: ("EB Garamond",),
  body-font: ("EB Garamond",),
  mono-font: ("Courier New", "DejaVu Sans Mono"),
  base-size: 11pt,
  leading: 0.65em,
  margin: (top: 0.75in, right: 0.85in, bottom: 0.75in, left: 0.85in),
  colors: colors,
)

// =============================================================================
// DATE FORMATTING
// =============================================================================

#let format-article-date(value) = {
  let raw = if value == none { "" } else { str(value).trim() }
  if raw == "" { "N/A" }
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
    justify: true,
    first-line-indent: 0.25in,
    spacing: 0pt,
  )

  show link: it => text(fill: rgb("#1A5276"), underline(it))

  content
}
