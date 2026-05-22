#import "@local/quillmark-helper:0.1.0": data
#import "@local/ttq-discord-chat:0.1.0": discord-chat, channel-header, message-row, system-message, is-true

#let theme = data.at("theme", default: "dark")
#let legacy = theme == "legacy"

#show: discord-chat.with(theme-name: theme)

#channel-header(
  name: data.at("channel_name", default: "general"),
  topic: data.at("channel_topic", default: ""),
  server: data.at("server_name", default: ""),
  theme: theme,
)

// Partition cards.
#let all-cards = data.at("$cards", default: ())
#let messages = all-cards.filter(c => c.at("$kind", default: "") == "message")
#let embeds = all-cards.filter(c => c.at("$kind", default: "") == "embed")
#let system-msgs = all-cards.filter(c => c.at("$kind", default: "") == "system_message")

// Render in the order cards appear in the document so authors control flow.
#let msg-idx = 0
#for card in all-cards {
  let kind = card.at("$kind", default: "")
  if kind == "message" {
    let attached = embeds.find(e =>
      int(str(e.at("belongs_to_message_index", default: "-1"))) == msg-idx
    )
    message-row(card, embed: attached, theme: theme, legacy: legacy)
    msg-idx = msg-idx + 1
  } else if kind == "system_message" {
    system-message(card, theme: theme)
  }
}
