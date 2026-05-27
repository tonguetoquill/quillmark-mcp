// components.typ — X (Twitter) feed components.
// Layout specs mirror vercel/react-tweet (MIT), the canonical public clone of
// x.com's tweet card CSS. See layout.typ for hex/px source.

#import "layout.typ": config, theme-of, format-count, is-true
#import "icons.typ": icon, reply-path, repost-path, like-path, views-path, bookmark-path, share-path, verified-path, pin-path, svg-of

// ─── AVATAR (initials circle) ──────────────────────────────────────────────

#let avatar(initials: "?", color: "#1D9BF0", size: none, theme: "dim") = {
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
      size: d * 0.45,
      weight: "bold",
      fill: white,
      upper(initials),
    )),
  )
}

// ─── VERIFIED BADGE ────────────────────────────────────────────────────────

#let verified-badge(kind: "blue", theme: "dim", size: none) = {
  let t = theme-of(theme)
  let fill = if kind == "gold" {
    t.verified-gold
  } else if kind == "gray" {
    t.verified-gray
  } else {
    t.verified-blue
  }
  let d = if size == none { config.verified-size } else { size }
  box(
    width: d,
    height: d,
    baseline: 3pt,
    image(bytes(svg-of(verified-path, fill)), width: d, height: d, format: "svg"),
  )
}

// ─── IDENTITY ROW ──────────────────────────────────────────────────────────
//
// Exact react-tweet shape:
//   [ Display Name (bold 15/20) ] [✓] [@handle (15/20 secondary)] · [time]

#let identity-row(
  display-name: "",
  handle: "",
  verified: false,
  verified-type: "blue",
  timestamp: "",
  stacked: false,
  theme: "dim",
) = {
  let t = theme-of(theme)
  set par(leading: 5pt, spacing: 0pt)
  if stacked {
    // Display name row
    text(
      font: config.font,
      size: config.name-size,
      weight: config.name-weight,
      fill: t.text,
      display-name,
    )
    if verified {
      h(3pt)
      verified-badge(kind: verified-type, theme: theme, size: 16pt)
    }
    linebreak()
    text(
      font: config.font,
      size: config.handle-size,
      fill: t.secondary,
      "@" + handle,
    )
  } else {
    // Inline: name ✓ @handle · timestamp
    text(
      font: config.font,
      size: config.name-size,
      weight: config.name-weight,
      fill: t.text,
      display-name,
    )
    if verified {
      h(3pt)
      verified-badge(kind: verified-type, theme: theme, size: 16pt)
    }
    h(4pt)
    text(
      font: config.font,
      size: config.handle-size,
      fill: t.secondary,
      "@" + handle,
    )
    if timestamp != "" {
      text(font: config.font, size: config.handle-size, fill: t.secondary, " · " + timestamp)
    }
  }
}

// ─── REPLYING-TO PREFIX ────────────────────────────────────────────────────

#let replying-to(handles: "", theme: "dim") = {
  let t = theme-of(theme)
  let raw = str(handles).trim()
  if raw == "" { return none }
  let parts = raw.split(",").map(s => s.trim()).filter(s => s != "")
  if parts.len() == 0 { return none }
  set par(leading: 4pt, spacing: 0pt)
  text(
    font: config.font,
    size: config.replying-to-size,
    fill: t.secondary,
    "Replying to ",
  )
  for (i, p) in parts.enumerate() {
    text(
      font: config.font,
      size: config.replying-to-size,
      fill: t.brand,
      "@" + p,
    )
    if i < parts.len() - 2 {
      text(size: config.replying-to-size, fill: t.secondary, ", ")
    } else if i == parts.len() - 2 {
      text(size: config.replying-to-size, fill: t.secondary, " and ")
    }
  }
}

// ─── ENGAGEMENT ACTION ─────────────────────────────────────────────────────
//
// Single action = stroke-icon + optional count, muted secondary color, with
// hover behaviour (not modeled in a static PDF).

#let action(path-d, count-str, theme: "dim", tint: none) = {
  let t = theme-of(theme)
  let col = if tint == "like" { t.secondary }
    else if tint == "repost" { t.secondary }
    else { t.secondary }
  box(baseline: 4pt, icon(path-d, size: config.engagement-icon-size, color: col))
  if count-str != none {
    h(5pt)
    text(
      font: config.font,
      size: config.action-count-size,
      weight: config.action-count-weight,
      fill: col,
      count-str,
    )
  }
}

// ─── ENGAGEMENT BAR ────────────────────────────────────────────────────────

#let engagement-bar(
  replies: "",
  reposts: "",
  likes: "",
  views: "",
  bookmarks: "",
  theme: "dim",
) = {
  let t = theme-of(theme)
  let reply-n = format-count(replies)
  let repost-n = format-count(reposts)
  let like-n = format-count(likes)
  let view-n = format-count(views)
  let bookmark-n = format-count(bookmarks)

  // Border-top hairline
  v(config.engagement-margin-top)
  line(length: 100%, stroke: config.engagement-border-top + t.border)
  v(8pt)

  // Five columns: reply | repost | like | views | bookmark+share
  grid(
    columns: (1fr, 1fr, 1fr, 1fr, auto),
    align: (left + horizon, left + horizon, left + horizon, left + horizon, right + horizon),
    gutter: 0pt,
    action(reply-path, reply-n, theme: theme, tint: "reply"),
    action(repost-path, repost-n, theme: theme, tint: "repost"),
    action(like-path, like-n, theme: theme, tint: "like"),
    action(views-path, view-n, theme: theme, tint: "views"),
    [
      #action(bookmark-path, bookmark-n, theme: theme, tint: "bookmark")
      #h(12pt)
      #box(baseline: 4pt, icon(share-path, size: config.engagement-icon-size, color: t.secondary))
    ],
  )
}

// ─── COMMUNITY NOTE ────────────────────────────────────────────────────────

#let community-note(text-content: "", theme: "dim") = {
  let t = theme-of(theme)
  if text-content == "" { return none }
  v(8pt)
  block(
    width: 100%,
    inset: config.community-note-padding,
    radius: config.community-note-radius,
    stroke: 1pt + t.border,
  )[
    #set par(leading: 4pt, spacing: 6pt, justify: false)
    #set text(font: config.font, size: 14pt, fill: t.text)
    #text(weight: "bold", fill: t.text, "Readers added context they thought people might want to know")
    #linebreak()
    #v(4pt)
    #text(text-content)
    #linebreak()
    #v(4pt)
    #text(size: 13pt, weight: "bold", fill: t.secondary, "Do you find this helpful?")
  ]
}

// ─── QUOTED TWEET CARD ─────────────────────────────────────────────────────

#let quoted-tweet(quote, theme: "dim") = {
  let t = theme-of(theme)
  v(config.quoted-margin-y)
  block(
    width: 100%,
    inset: config.quoted-padding-y,
    radius: config.quoted-radius,
    stroke: 1pt + t.border,
  )[
    #set par(leading: 4pt, spacing: 4pt, justify: false)
    #grid(
      columns: (config.avatar-quoted-size, 1fr),
      gutter: config.quoted-avatar-gap,
      align: (left + horizon, left + horizon),
      avatar(
        initials: quote.at("avatar_initials", default: "?"),
        color: quote.at("avatar_color", default: "#1D9BF0"),
        size: config.avatar-quoted-size,
        theme: theme,
      ),
      [
        #text(font: config.font, size: config.quoted-body-size, weight: "bold", fill: t.text, quote.at("display_name", default: ""))
        #if quote.at("verified", default: false) {
          h(3pt)
          verified-badge(kind: quote.at("verified_type", default: "blue"), theme: theme, size: 13pt)
        }
        #text(font: config.font, size: config.quoted-body-size, fill: t.secondary, " @" + quote.at("handle", default: "") + " · " + quote.at("timestamp", default: ""))
      ],
    )
    #v(6pt)
    #set text(font: config.font, size: config.quoted-body-size, fill: t.text)
    #set par(leading: 4pt)
    #quote.at("$body", default: [])
  ]
}

// ─── PINNED INDICATOR ──────────────────────────────────────────────────────

#let pinned-indicator(theme: "dim") = {
  let t = theme-of(theme)
  box(baseline: 2pt, icon(pin-path, size: 14pt, color: t.secondary))
  h(8pt)
  text(font: config.font, size: 13pt, weight: "bold", fill: t.secondary, "Pinned")
}

// ─── POST CARD ─────────────────────────────────────────────────────────────

#let post-card(
  post,
  theme: "dim",
  is-reply: false,
  quote: none,
) = {
  let t = theme-of(theme)
  let av-size = if is-reply { config.avatar-size } else { config.avatar-size }

  block(
    width: 100%,
    inset: (x: config.card-padding-x, y: config.card-padding-y),
    stroke: (bottom: 1pt + t.border),
  )[
    #if post.at("pinned", default: false) and not is-reply {
      pad(left: av-size + config.avatar-gutter, pinned-indicator(theme: theme))
      v(4pt)
    }

    #grid(
      columns: (av-size, 1fr),
      gutter: config.avatar-gutter,
      align: (left + top, left + top),
      avatar(
        initials: post.at("avatar_initials", default: "?"),
        color: post.at("avatar_color", default: "#1D9BF0"),
        size: av-size,
        theme: theme,
      ),
      [
        #identity-row(
          display-name: post.at("display_name", default: ""),
          handle: post.at("handle", default: ""),
          verified: post.at("verified", default: false),
          verified-type: post.at("verified_type", default: "blue"),
          timestamp: post.at("timestamp", default: ""),
          theme: theme,
        )
        #if is-reply {
          v(6pt)
          replying-to(handles: post.at("replying_to_handles", default: ""), theme: theme)
        }
        #v(config.body-margin-top)
        #set par(leading: config.body-leading, spacing: 8pt, justify: false)
        #set text(font: config.font, size: config.body-size, fill: t.text)
        #post.at("$body", default: [])

        #if quote != none { quoted-tweet(quote, theme: theme) }

        #community-note(text-content: post.at("community_note", default: ""), theme: theme)

        #engagement-bar(
          replies: post.at("reply_count", default: ""),
          reposts: post.at("repost_count", default: ""),
          likes: post.at("like_count", default: ""),
          views: post.at("view_count", default: ""),
          bookmarks: post.at("bookmark_count", default: ""),
          theme: theme,
        )
      ],
    )
  ]
}

// ─── FEED HEADER ───────────────────────────────────────────────────────────

#let feed-header-bar(label: "For you", theme: "dim") = {
  let t = theme-of(theme)
  if str(label).trim() == "" { return none }
  block(
    width: 100%,
    inset: (x: config.card-padding-x, y: 10pt),
    stroke: (bottom: 1pt + t.border),
  )[
    #set par(spacing: 0pt)
    #text(
      font: config.font,
      size: 17pt,
      weight: "bold",
      fill: t.text,
      label,
    )
  ]
}
