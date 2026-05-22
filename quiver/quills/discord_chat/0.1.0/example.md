~~~card-yaml
$quill: discord_chat@0.1.0
$kind: main
theme: dark
server_name: "Joint Task Force 26"
channel_name: "ops-coord"
channel_topic: "Real-time ops coordination · no classified chatter · use the secure channel for TS"
~~~

~~~card-yaml
$kind: message
username: "Capt.Reyes"
user_color: "#ED4245"
avatar_initials: "CR"
avatar_color: "#ED4245"
timestamp: "Today at 3:45 PM"
reactions: "👍:7,🫡:3*"
~~~

Morning all — {@everyone} standup in 15. Agenda is posted in {#announcements}. Bring your **LOG** updates.

~~~card-yaml
$kind: message
username: "Sgt.Park"
user_color: "#3BA55D"
avatar_initials: "SP"
avatar_color: "#3BA55D"
timestamp: "Today at 3:46 PM"
replying_to_user: "Capt.Reyes"
replying_to_color: "#ED4245"
replying_to_initials: "CR"
replying_to_avatar_color: "#ED4245"
replying_to_preview: "Morning all — @everyone standup in 15..."
~~~

Copy {@Capt.Reyes}. LOGs on track — MCOE element at *98%* readiness. One issue: generator #3 at site BRAVO is ||flaking out again||

~~~card-yaml
$kind: message
username: "Sgt.Park"
user_color: "#3BA55D"
avatar_initials: "SP"
avatar_color: "#3BA55D"
timestamp: "3:47 PM"
group_with_previous: true
edited: true
~~~

Maintenance is already on it, ETA 2 hours. Will update.

~~~card-yaml
$kind: message
username: "IntelBot"
user_color: "#5865F2"
avatar_initials: "IB"
avatar_color: "#5865F2"
is_bot: true
is_verified_app: true
timestamp: "Today at 3:52 PM"
~~~

New intel report ingested — tagged **PRIORITY**. Preview below.

~~~card-yaml
$kind: embed
belongs_to_message_index: 3
color: "#FAA61A"
author_name: "J2 Intel Pipeline"
title: "DAILY SIGINT SUMMARY — 15 APR 26"
description: "Unusual comms activity observed in the BRAVO AOR. Signals consistent with pre-movement coord. Recommend shifting watch to condition YELLOW."
image_caption: "[Map overlay — BRAVO AOR]"
footer_text: "Generated 15:52Z · Classification: UNCLASSIFIED (in this channel)"
~~~

~~~card-yaml
$kind: system_message
type: pin
username: "Capt.Reyes"
timestamp: "3:53 PM"
target_message_preview: "DAILY SIGINT SUMMARY — 15 APR 26"
~~~

~~~card-yaml
$kind: message
username: "LtCol.Vance"
user_color: "#FAA61A"
avatar_initials: "LV"
avatar_color: "#FAA61A"
timestamp: "Today at 4:01 PM"
reactions: "🫡:4,🔥:2"
~~~

Team — rolling up pre-brief points. See the `ops-order-26-01` channel for the draft. {@Capt.Reyes} sync with me after standup.

```
BLUF: adversary pattern shift likely within 48h
RECOMMENDATION: shift to condition YELLOW
```

~~~card-yaml
$kind: message
username: "randomintern"
user_color: "#F2F3F5"
avatar_initials: "RI"
avatar_color: "#747F8D"
timestamp: "4:04 PM"
~~~

sorry what does BLUF mean again 😅

~~~card-yaml
$kind: system_message
type: join
username: "NewAnalyst"
timestamp: "4:05 PM"
~~~

~~~card-yaml
$kind: message
username: "Sgt.Park"
user_color: "#3BA55D"
avatar_initials: "SP"
avatar_color: "#3BA55D"
timestamp: "4:06 PM"
replying_to_user: "randomintern"
replying_to_color: "#F2F3F5"
replying_to_initials: "RI"
replying_to_avatar_color: "#747F8D"
replying_to_preview: "sorry what does BLUF mean again 😅"
~~~

Bottom Line Up Front — the *TL;DR* at the top of a brief. See {#training-resources}.
