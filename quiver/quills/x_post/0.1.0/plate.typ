#import "@local/quillmark-helper:0.1.0": data
#import "@local/ttq-x-post:0.1.0": x-feed, post-card, feed-header-bar, is-true

#let theme = data.at("theme", default: "dim")

#show: x-feed.with(theme-name: theme)

// Feed header ("For you", "Following", profile label, etc.)
#feed-header-bar(label: data.at("feed_header", default: ""), theme: theme)

// Partition cards.
#let all-cards = data.at("$cards", default: ())
#let posts = all-cards.filter(c => c.at("$kind", default: "") == "post")
#let replies = all-cards.filter(c => c.at("$kind", default: "") == "reply")
#let quotes = all-cards.filter(c => c.at("$kind", default: "") == "quoted_tweet")

// Render each top-level post, its quoted tweet (if any), then its replies.
#for (i, post) in posts.enumerate() {
  // Find quote attached to this post (attached_to="post").
  let post-quote = quotes.find(q =>
    q.at("attached_to", default: "post") == "post"
      and int(str(q.at("belongs_to_post_index", default: "-1"))) == i
  )

  post-card(post, theme: theme, is-reply: false, quote: post-quote)

  // Replies to this post, in order of appearance.
  let this-replies = replies.enumerate().filter(((_, r)) =>
    int(str(r.at("belongs_to_post_index", default: "-1"))) == i
  )
  for (j, r) in this-replies {
    v(8pt)
    // Find quote attached to this reply (by belongs_to_post_index of reply card's order).
    let reply-quote = quotes.find(q =>
      q.at("attached_to", default: "post") == "reply"
        and int(str(q.at("belongs_to_post_index", default: "-1"))) == j
    )
    post-card(r, theme: theme, is-reply: true, quote: reply-quote)
  }
}
