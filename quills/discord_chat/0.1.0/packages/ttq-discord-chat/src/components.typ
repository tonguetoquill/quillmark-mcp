// components.typ — Discord channel chat components.
// Visual reference: discord.com desktop, dark theme 2022-present.

#import "layout.typ": config, theme-of, is-true

// ─── AVATAR ────────────────────────────────────────────────────────────────

#let avatar(initials: "?", color: "#5865F2", size: none) = {
  let d = if size == none { config.avatar-size } else { size }
  let c = if type(color) == str { rgb(color) } else { color }
  box(
    width: d,
    height: d,
    radius: 50%,
    fill: c,
    clip: true,
    align(center + horizon, text(
      font: config.font,
      size: d * 0.42,
      weight: "bold",
      fill: white,
      upper(initials),
    )),
  )
}

// ─── BOT TAG ───────────────────────────────────────────────────────────────

#let bot-tag(verified: false, legacy: false, theme: "dark") = {
  let t = theme-of(theme)
  let label = if legacy { "BOT" } else { "APP" }
  let content = if verified {
    [#text(size: 6.5pt, weight: "black", fill: white, "✓") #h(1pt) #text(size: 7pt, weight: "bold", fill: white, label)]
  } else {
    text(size: 7pt, weight: "bold", fill: white, label)
  }
  box(
    inset: (x: 4pt, y: 1pt),
    radius: 2pt,
    fill: t.bot-tag-bg,
    baseline: 1pt,
    content,
  )
}

// ─── INLINE STYLE TOKENS ───────────────────────────────────────────────────

#let mention-pill(label, theme: "dark") = {
  let t = theme-of(theme)
  box(
    inset: (x: 3pt, y: 0.5pt),
    radius: 3pt,
    fill: t.mention-bg,
    baseline: 1pt,
    text(weight: "medium", fill: t.mention-text, label),
  )
}

#let spoiler(label, theme: "dark") = {
  let t = theme-of(theme)
  box(
    inset: (x: 3pt, y: 0.5pt),
    radius: 3pt,
    fill: t.spoiler,
    baseline: 1pt,
    text(fill: t.spoiler, label),
  )
}

// ─── BODY RENDERING ────────────────────────────────────────────────────────
//
// Authors write message body_md as a string. We transform Discord sentinels
// ({@user}, {#channel}, {@everyone}, {spoiler:...}) into Typst show-rule-
// compatible markers, then hand off to `eval(...)` with markup mode so
// markdown-style **bold**, *italic*, `code`, and code blocks work natively.
//
// Pipeline:
//   1. Split on triple-backtick code fences → render fenced blocks verbatim.
//   2. For inline parts, replace sentinels with Typst function-call text.
//   3. eval(part, mode: "markup", scope: (mention: ..., spoiler: ...))
//      so Typst parses markdown-ish inline markup and resolves our helpers.

#let message-body(raw-body, theme: "dark") = {
  let t = theme-of(theme)
  let s = str(raw-body)

  // Scope passed into eval so our helpers are callable by name.
  let eval-scope = (
    mention: label => mention-pill(label, theme: theme),
    spoiler: label => spoiler(label, theme: theme),
    code: label => box(
      inset: (x: 3pt, y: 1pt),
      radius: 2pt,
      fill: t.code-bg,
      baseline: 1pt,
      text(font: config.mono-font, size: 8.5pt, fill: t.code-text, label),
    ),
  )

  // Pre-process sentinels into Typst function calls. Order matters:
  //   {@everyone} and {@here} first (specific before general)
  //   {@user}    → #mention("@user")
  //   {#channel} → #mention("#channel")
  //   {spoiler:text} → #spoiler("text")
  //   ||text||   → #spoiler("text")
  //   `inline`   → kept, rendered natively by markup as raw; but we override
  //                with our code helper via a replace.
  //
  // We emit Typst markup (not code-mode), so mention/spoiler calls use
  // `#func(...)`. Our eval scope wires those to the theme-aware helpers.
  //
  // We handle code fences ```lang\n...``` as whole-block substitutions prior
  // to inline processing so backticks inside code don't leak into inline pass.

  // Step 1: split on ```
  let parts = s.split("```")
  let out-blocks = ()
  let in-code = false
  for part in parts {
    if in-code {
      // Strip optional language tag on first line
      let body = part
      let nl-idx = body.position("\n")
      if nl-idx != none {
        let first = body.slice(0, nl-idx).trim()
        // Treat as language tag if only letters/digits.
        let is-lang = first != "" and first.match(regex("^[A-Za-z0-9_+-]+$")) != none
        if is-lang {
          body = body.slice(nl-idx + 1)
        }
      }
      out-blocks.push(block(
        width: 100%,
        inset: 8pt,
        radius: 4pt,
        fill: t.code-bg,
        stroke: 1pt + t.divider,
      )[
        #set text(font: config.mono-font, size: 8.5pt, fill: t.code-text)
        #set par(leading: 0.4em)
        #raw(body.trim("\n"))
      ])
    } else {
      // Inline segment — substitute sentinels, then eval as markup.
      let inline = part
      // Sentinel substitutions — use unique unlikely ASCII marker sequences so
      // we don't accidentally collide with normal text.
      inline = inline.replace(
        regex("\\{@(everyone|here)\\}"),
        m => "#mention(\"@" + m.captures.at(0) + "\")",
      )
      inline = inline.replace(
        regex("\\{@([A-Za-z0-9_\\.]+)\\}"),
        m => "#mention(\"@" + m.captures.at(0) + "\")",
      )
      inline = inline.replace(
        regex("\\{#([A-Za-z0-9_\\-]+)\\}"),
        m => "#mention(\"#" + m.captures.at(0) + "\")",
      )
      inline = inline.replace(
        regex("\\{spoiler:([^}]+)\\}"),
        m => "#spoiler(\"" + m.captures.at(0).replace("\"", "\\\"") + "\")",
      )
      inline = inline.replace(
        regex("\\|\\|([^|\\n]+)\\|\\|"),
        m => "#spoiler(\"" + m.captures.at(0).replace("\"", "\\\"") + "\")",
      )
      // eval as markup; wrap in a scope so helpers resolve.
      out-blocks.push(eval(inline, mode: "markup", scope: eval-scope))
    }
    in-code = not in-code
  }
  out-blocks.join()
}

// ─── CHANNEL HEADER ────────────────────────────────────────────────────────

#let channel-header(name: "general", topic: "", server: "", theme: "dark") = {
  let t = theme-of(theme)
  block(
    width: 100%,
    inset: (x: 16pt, y: 10pt),
    stroke: (bottom: 1pt + t.divider),
    fill: t.bg,
  )[
    #set par(spacing: 0pt, leading: 1.1em)
    #text(size: 14pt, weight: "bold", fill: t.muted, "#")
    #text(size: 14pt, weight: "bold", fill: t.text, name)
    #if topic != "" [
      #h(6pt)
      #text(size: 8pt, fill: t.muted, "|")
      #h(6pt)
      #text(size: 9pt, fill: t.muted, topic)
    ]
    #if server != "" [
      #linebreak()
      #text(size: 8pt, fill: t.timestamp, "in " + server)
    ]
  ]
  v(4pt)
}

// ─── REPLY REFERENCE ───────────────────────────────────────────────────────

#let reply-reference(
  to-user: "",
  to-color: "",
  to-preview: "",
  to-avatar-initials: "?",
  to-avatar-color: "#5865F2",
  theme: "dark",
) = {
  let t = theme-of(theme)
  let name-color = if to-color == "" { t.text } else { rgb(to-color) }
  block(
    width: 100%,
    inset: (left: config.text-col-indent, bottom: 2pt),
  )[
    #set par(spacing: 0pt, leading: 1em)
    #grid(
      columns: (14pt, 1fr),
      gutter: 6pt,
      align: (left + horizon, left + horizon),
      avatar(initials: to-avatar-initials, color: to-avatar-color, size: 12pt),
      [
        #text(size: config.timestamp-size, weight: "medium", fill: name-color, "@" + to-user)
        #h(4pt)
        #text(size: config.timestamp-size, fill: t.muted, to-preview)
      ],
    )
  ]
}

// ─── USERNAME LINE ─────────────────────────────────────────────────────────

#let username-line(
  username: "",
  user-color: "#F2F3F5",
  is-bot: false,
  is-verified-app: false,
  timestamp: "",
  pinned: false,
  legacy: false,
  theme: "dark",
) = {
  let t = theme-of(theme)
  let color = if user-color == "" { t.text } else { rgb(user-color) }
  set par(spacing: 0pt, leading: 1em)
  box(text(
    font: config.font,
    size: config.username-size,
    weight: "bold",
    fill: color,
    username,
  ))
  if is-bot {
    h(4pt)
    box(bot-tag(verified: is-verified-app, legacy: legacy, theme: theme))
  }
  h(6pt)
  text(
    font: config.font,
    size: config.timestamp-size,
    fill: t.timestamp,
    timestamp,
  )
  if pinned {
    h(6pt)
    text(size: config.timestamp-size, fill: t.muted, "📌 Pinned")
  }
}

// ─── MESSAGE ROW ───────────────────────────────────────────────────────────

// ─── EMBED CARD ────────────────────────────────────────────────────────────

#let embed-card(embed, theme: "dark") = {
  let t = theme-of(theme)
  let color = rgb(embed.at("color", default: "#5865F2"))
  v(4pt)
  block(
    width: 90%,
    radius: 4pt,
    fill: t.embed-bg,
    stroke: (left: 4pt + color, rest: 1pt + t.embed-border),
    inset: 10pt,
  )[
    #set par(spacing: 4pt, leading: 0.6em)
    #if embed.at("author_name", default: "") != "" {
      text(size: config.small-size, weight: "bold", fill: t.muted, embed.author_name)
      linebreak()
    }
    #if embed.at("title", default: "") != "" {
      text(size: 10pt, weight: "bold", fill: t.link, embed.title)
      linebreak()
    }
    #if embed.at("description", default: "") != "" {
      set text(size: 9pt, fill: t.text)
      embed.description
    }
    #if embed.at("image_caption", default: "") != "" {
      linebreak()
      v(4pt)
      // Placeholder image box
      block(
        width: 80%,
        height: 60pt,
        radius: 3pt,
        fill: t.divider,
        align(center + horizon, text(size: 8pt, fill: t.muted,
          embed.image_caption)),
      )
    }
    #if embed.at("footer_text", default: "") != "" {
      linebreak()
      v(2pt)
      text(size: 7.5pt, fill: t.muted, embed.footer_text)
    }
  ]
}

// ─── REACTIONS ─────────────────────────────────────────────────────────────
//
// Format: "👍:3,❤️:1,:pepe::7*" — comma-separated pairs of `emoji:count`.
// A trailing `*` on a pair means the viewer reacted (highlighted).

#let reactions-row(raw, theme: "dark") = {
  let t = theme-of(theme)
  let s = str(raw).trim()
  if s == "" { return none }
  // Split on "," but respect custom-emoji colon format. For v0.1.0 we
  // assume authors use safe ASCII emoji or single unicode glyph + `:count`.
  let pairs = s.split(",")
  v(4pt)
  for (i, raw-pair) in pairs.enumerate() {
    let p = raw-pair.trim()
    if p == "" { continue }
    let is-self = p.ends-with("*")
    let core = if is-self { p.slice(0, p.len() - 1) } else { p }
    // Find last ":count" — split from right by scanning matches.
    let colons = core.matches(regex(":"))
    if colons.len() == 0 { continue }
    let last-colon = colons.last().start
    let emoji = core.slice(0, last-colon).trim()
    let count = core.slice(last-colon + 1).trim()
    let bg = if is-self { t.reaction-self-bg } else { t.reaction-bg }
    let border = if is-self { t.reaction-self-border } else { t.reaction-border }
    let text-color = if is-self { t.mention-text } else { t.muted }
    box(
      inset: (x: 5pt, y: 4pt),
      radius: 4pt,
      fill: bg,
      stroke: 1pt + border,
      baseline: 1pt,
      grid(
        columns: 2,
        gutter: 3pt,
        align: horizon,
        text(size: 9pt, emoji),
        text(size: 8.5pt, weight: "medium", fill: text-color, count),
      ),
    )
    h(3pt)
  }
}

// ─── MESSAGE ROW ───────────────────────────────────────────────────────────

#let message-row(msg, embed: none, theme: "dark", legacy: false) = {
  let t = theme-of(theme)
  let grouped = is-true(msg.at("group_with_previous", default: "false"))

  if msg.at("replying_to_user", default: "") != "" {
    reply-reference(
      to-user: msg.replying_to_user,
      to-color: msg.at("replying_to_color", default: ""),
      to-preview: msg.at("replying_to_preview", default: ""),
      to-avatar-initials: msg.at("replying_to_initials", default: "?"),
      to-avatar-color: msg.at("replying_to_avatar_color", default: "#5865F2"),
      theme: theme,
    )
  }

  block(
    width: 100%,
    inset: (x: 16pt, y: if grouped { 2pt } else { 6pt }),
  )[
    #grid(
      columns: (config.avatar-size, 1fr),
      gutter: config.gutter,
      align: (left + top, left + top),
      if grouped { [] } else {
        avatar(
          initials: msg.at("avatar_initials", default: "?"),
          color: msg.at("avatar_color", default: "#5865F2"),
        )
      },
      [
        #if not grouped {
          username-line(
            username: msg.at("username", default: ""),
            user-color: msg.at("user_color", default: "#F2F3F5"),
            is-bot: is-true(msg.at("is_bot", default: "false")),
            is-verified-app: is-true(msg.at("is_verified_app", default: "false")),
            timestamp: msg.at("timestamp", default: ""),
            pinned: is-true(msg.at("pinned", default: "false")),
            legacy: legacy,
            theme: theme,
          )
          linebreak()
        }
        #set text(font: config.font, size: config.body-size, fill: t.text)
        #set par(leading: 0.6em, spacing: 4pt)
        #message-body(msg.at("body_md", default: ""), theme: theme)
        #if is-true(msg.at("edited", default: "false")) {
          text(size: 6.5pt, fill: t.timestamp, " (edited)")
        }
        #if embed != none { embed-card(embed, theme: theme) }
        #if msg.at("reactions", default: "") != "" {
          reactions-row(msg.reactions, theme: theme)
        }
      ],
    )
  ]
}

// ─── SYSTEM MESSAGE ────────────────────────────────────────────────────────

#let system-message(sys, theme: "dark") = {
  let t = theme-of(theme)
  let ty = sys.at("type", default: "join")
  let user = sys.at("username", default: "someone")
  let preview = sys.at("target_message_preview", default: "")
  let timestamp = sys.at("timestamp", default: "")

  let icon = if ty == "join" { "→" }
    else if ty == "leave" { "←" }
    else if ty == "pin" { "📌" }
    else if ty == "boost" { "🚀" }
    else if ty == "call_start" { "📞" }
    else if ty == "call_end" { "📴" }
    else { "·" }

  let phrase = if ty == "join" { user + " joined the server." }
    else if ty == "leave" { user + " left the server." }
    else if ty == "pin" { user + " pinned a message to this channel. " + preview }
    else if ty == "boost" { user + " just boosted the server!" }
    else if ty == "call_start" { user + " started a call." }
    else if ty == "call_end" { "The call ended." }
    else { user + " · " + preview }

  block(
    width: 100%,
    inset: (x: 16pt, y: 4pt),
  )[
    #set par(spacing: 0pt, leading: 1em)
    #grid(
      columns: (config.avatar-size, 1fr),
      gutter: config.gutter,
      align: (center + horizon, left + horizon),
      text(size: 13pt, fill: t.muted, icon),
      [
        #text(size: config.small-size, fill: t.muted, phrase)
        #h(6pt)
        #text(size: config.timestamp-size, fill: t.timestamp, timestamp)
      ],
    )
  ]
}
