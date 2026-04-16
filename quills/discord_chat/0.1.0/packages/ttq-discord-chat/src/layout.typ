// layout.typ — Discord channel chat typography, themes, and page setup.
// Bundled font: Inter (closest OFL match to gg sans).

#let themes = (
  dark: (
    bg: rgb("#313338"),
    sidebar: rgb("#2B2D31"),
    rail: rgb("#1E1F22"),
    input: rgb("#383A40"),
    text: rgb("#F2F3F5"),
    muted: rgb("#B5BAC1"),
    timestamp: rgb("#949BA4"),
    divider: rgb("#3F4147"),
    reply-line: rgb("#4E5058"),
    brand: rgb("#5865F2"),
    mention-bg: rgb("#3C4270"),
    mention-text: rgb("#C9CDFB"),
    link: rgb("#00A8FC"),
    code-bg: rgb("#2B2D31"),
    code-text: rgb("#DCDDDE"),
    spoiler: rgb("#202225"),
    embed-bg: rgb("#2B2D31"),
    embed-border: rgb("#3F4147"),
    bot-tag-bg: rgb("#5865F2"),
    reaction-bg: rgb("#2B2D31"),
    reaction-border: rgb("#3F4147"),
    reaction-self-bg: rgb("#3C4270"),
    reaction-self-border: rgb("#5865F2"),
  ),
  legacy: (
    bg: rgb("#36393F"),
    sidebar: rgb("#2F3136"),
    rail: rgb("#202225"),
    input: rgb("#40444B"),
    text: rgb("#DCDDDE"),
    muted: rgb("#B9BBBE"),
    timestamp: rgb("#72767D"),
    divider: rgb("#42464D"),
    reply-line: rgb("#4F545C"),
    brand: rgb("#5865F2"),
    mention-bg: rgb("#3C4270"),
    mention-text: rgb("#C9CDFB"),
    link: rgb("#00AFF4"),
    code-bg: rgb("#2F3136"),
    code-text: rgb("#DCDDDE"),
    spoiler: rgb("#202225"),
    embed-bg: rgb("#2F3136"),
    embed-border: rgb("#202225"),
    bot-tag-bg: rgb("#5865F2"),
    reaction-bg: rgb("#2F3136"),
    reaction-border: rgb("#202225"),
    reaction-self-bg: rgb("#3C4270"),
    reaction-self-border: rgb("#5865F2"),
  ),
  light: (
    bg: rgb("#FFFFFF"),
    sidebar: rgb("#F2F3F5"),
    rail: rgb("#E3E5E8"),
    input: rgb("#EBEDEF"),
    text: rgb("#060607"),
    muted: rgb("#4E5058"),
    timestamp: rgb("#6D6F78"),
    divider: rgb("#E3E5E8"),
    reply-line: rgb("#B5BAC1"),
    brand: rgb("#5865F2"),
    mention-bg: rgb("#E6E8FE"),
    mention-text: rgb("#505CDC"),
    link: rgb("#0068E0"),
    code-bg: rgb("#F2F3F5"),
    code-text: rgb("#2E3338"),
    spoiler: rgb("#B9BBBE"),
    embed-bg: rgb("#F2F3F5"),
    embed-border: rgb("#E3E5E8"),
    bot-tag-bg: rgb("#5865F2"),
    reaction-bg: rgb("#F2F3F5"),
    reaction-border: rgb("#E3E5E8"),
    reaction-self-bg: rgb("#E6E8FE"),
    reaction-self-border: rgb("#5865F2"),
  ),
)

#let config = (
  font: ("Inter", "Noto Color Emoji"),
  mono-font: ("Inter", "Noto Color Emoji", "Menlo", "Consolas", "monospace"),
  base-size: 10pt,
  username-size: 10pt,
  timestamp-size: 7.5pt,
  body-size: 10pt,
  small-size: 8.5pt,
  leading: 5pt,
  paragraph-spacing: 4pt,
  avatar-size: 28pt,
  gutter: 8pt,
  text-col-indent: 40pt,
  page-margin: 0pt,
  page-width: 640pt,
)

#let theme-of(name) = {
  let key = str(name).trim()
  if key in themes { themes.at(key) } else { themes.dark }
}

#let is-true(v) = {
  let s = str(v).trim()
  s == "true" or s == "True" or s == "TRUE" or s == "yes" or s == "1"
}

// Global chat show rule — fills page with theme bg, sets Inter body.
#let discord-chat(theme-name: "dark", content) = {
  let t = theme-of(theme-name)
  set page(
    width: config.page-width,
    height: auto,
    margin: config.page-margin,
    fill: t.bg,
  )
  set text(
    font: config.font,
    size: config.base-size,
    fill: t.text,
  )
  set par(
    leading: config.leading,
    justify: false,
    first-line-indent: 0pt,
    spacing: config.paragraph-spacing,
  )
  content
}
