// components.typ
#import "layout.typ": config, vgap, get-severity, validate-severity, validate-column-index, format-official-date

// --- Utility Functions ---

/// Load an icon from the assets directory.
///
/// Parameters:
/// - name: Icon filename (without extension)
/// - size: Icon height (default: 12pt)
/// - fill: Icon color (default: text-primary)
/// - variant: Icon set to use: "solid", "regular", or "brands" (default: "solid")
///
/// Returns: A box containing the icon image
#let icon(
  name, 
  size: config.icon.default-size,
  fill: none,
  variant: config.icon.default-variant,
) = {
  let icon-fill = if fill != none { fill } else { config.colors.text-primary }
  if lower(str(config.icon.style)) == "geometric" {
    let shape-map = (
      "triangle-exclamation": "▲",
      "circle-info": "●",
      "check": "■",
      "fire-alt": "◆",
      "fire": "◆",
    )
    let glyph = shape-map.at(str(name), default: "●")
    box(
      height: size,
      baseline: config.icon.baseline,
      text(glyph, size: size * 0.9, weight: "bold", fill: icon-fill),
    )
  } else {
    let path = "assets/" + variant + "/" + name + ".svg"
    box(
      height: size,
      baseline: config.icon.baseline,
      image(path, height: size),
    )
  }
}

/// Horizontal rule for section dividers.
///
/// Returns: A horizontal line with header accent color
#let hrule = {
  block(width: 100%, {
    line(length: 100%, stroke: 2pt + config.colors.institutional-primary)
    v(1.5pt)
    line(length: 100%, stroke: 0.8pt + config.colors.institutional-secondary)
  })
}

/// Create a severity badge with appropriate color and styling.
///
/// Parameters:
/// - level: Severity level (case-insensitive: "high", "medium", "warning", "info", "secure", "hotspot")
///
/// Returns: A centered box with colored badge
#let severity-badge(level) = {
  let sev = get-severity(level, standard: config.severity-standard)
  
  align(center, box(
    fill: sev.color.lighten(85%),
    outset: config.badge.padding,
    radius: config.badge.radius,
    stroke: 1pt + sev.color,
    {
      icon(sev.icon, size: config.badge.font-size + 0.5pt, fill: sev.color.darken(10%))
      h(3pt)
      text(
        fill: sev.color.darken(10%),
        weight: "bold",
        size: config.badge.font-size,
        upper(sev.label),
      )
    }
  ))
}

// --- Component Exports ---

/// Create a report header with branding, title, and metadata.
///
/// Parameters:
/// - title: Main report title (default: "Security Analysis Report")
/// - subtitle: Optional subtitle text (default: none)
/// - system-name: System name or designation (default: "")
/// - system-icon: Optional system emblem or icon (default: none)
/// - metadata: Dictionary of key-value pairs to display (default: (:))
/// - banner: Optional banner image path (default: none)
///
/// Returns: A formatted header block
#let report-header(
  title: "Security Analysis Report",
  subtitle: none,
  system-name: "",
  system-icon: none,
  metadata: (:),
  banner: none,
) = {
  set align(center)
  
  // Custom Banner (if provided)
  if banner != none {
    block(
      width: 100%,
      {
        image(banner, width: 100%)
      }
    )
    vgap(config.section-spacing * 1.5)
  }

  // Title/Branding
  block({
    text(font: config.display-font, size: 36pt, weight: "bold", fill: config.colors.text-primary, title)
    if subtitle != none {
      linebreak()
      v(8pt)
      text(font: config.display-font, size: 14pt, weight: "regular", fill: config.colors.text-secondary, subtitle)
    }
  })

  vgap(config.section-spacing * 2)

  // System icon (if provided)
  if system-icon != none {
    block(system-icon)
    vgap(config.entry-spacing)
  }

  set align(left)

  // Key Metadata Block
  if metadata.len() > 0 {
    vgap(config.section-spacing * 2.5)
    block(
      width: 100%,
      inset: 18pt,
      radius: 4pt,
      stroke: 0.5pt + config.colors.border.lighten(20%),
      fill: config.colors.bg-primary,
      {
        grid(
          columns: (auto, 1fr),
          row-gutter: 0.75em,
          column-gutter: 2.5em,
          ..metadata.pairs().map(((key, value)) => (
            text(weight: "bold", fill: config.colors.text-primary, size: 10pt, key + ":"),
            text(fill: config.colors.text-primary, size: 10pt, value),
          )).flatten()
        )
      }
    )
  }
}

/// Display a security scorecard with score and findings summary.
///
/// Parameters:
/// - score: Security score (0-100)
/// - risk-level: Risk level label (e.g., "HIGH", "MEDIUM", "LOW")
/// - findings: Dictionary of finding categories and their counts
///
/// Returns: A formatted scorecard block
#let scorecard(score: 0, risk-level: "UNKNOWN", findings: (:)) = {
  vgap(config.section-spacing)

  block(
    width: 100%,
    inset: 16pt,
    radius: 4pt,
    stroke: config.table-stroke,
    fill: config.colors.bg-primary,
    {
      // Score Display
      align(center, {
        icon("shield-halved", size: 22pt, fill: config.colors.text-primary)
        h(9pt)
        text(size: 18pt, weight: "bold", fill: config.colors.text-primary, "System Security Score")
        v(8pt)
        text(size: 46pt, weight: "bold", fill: config.colors.text-primary, str(score) + "/100")
        v(6pt)
        severity-badge(risk-level.replace(" RISK", ""))
        text(fill: config.colors.text-secondary, size: 10pt, weight: "medium", " RISK")
      })

      vgap(config.entry-spacing * 1.3)

      // Findings Summary Table
      if findings.len() > 0 {
        align(center, {
          text(size: 11.5pt, weight: "bold", fill: config.colors.text-primary, "Findings by Severity")
          vgap(0.6em)
          table(
            columns: findings.keys().len() + 1,
            stroke: 0.8pt + config.colors.border,
            align: center + horizon,
            inset: (x: 10pt, y: 6.5pt),
            fill: (col, row) => if row == 0 { config.colors.institutional-primary } else { none },
            text(weight: "bold", size: 9.5pt, fill: config.colors.on-institutional, [Category]),
            ..findings.keys().map(k => text(weight: "bold", size: 9.5pt, fill: config.colors.on-institutional, upper(k))),
            text(weight: "bold", size: 9.5pt, fill: config.colors.on-institutional, [Count]),
            ..findings.values().map(v => text(size: 10.5pt, weight: "medium", str(v))),
          )
        })
      }
    }
  )
}

/// Display a horizontal summary grid of severity counts.
///
/// Parameters:
/// - counts: Dictionary mapping severity levels to counts (e.g., (high: 5, medium: 3))
///
/// Returns: A grid block with severity cards
#let severity-summary(counts: (:)) = {
  let order = ("high", "medium", "info", "secure", "hotspot")
  
  block(
    width: 100%,
    breakable: false,
    {
      // Severity bars in a horizontal grid layout - no wrapper card
      grid(
        columns: (1fr,) * order.len(),
        row-gutter: 0pt,
        column-gutter: 8pt,
        align: (center, horizon),
        ..order.map(level => {
          let sev = get-severity(level, standard: config.severity-standard)
          let count = counts.at(level, default: counts.at(sev.label, default: 0))
          
          // Severity card
          block(
            width: 100%,
            height: 46pt,
            inset: (x: 7pt, y: 8pt),
            fill: sev.color,
            stroke: 1pt + sev.color.darken(5%),
            radius: 4pt,
            {
              align(center + horizon, {
                v(5pt)
                // Icon and label
                icon(sev.icon, size: 9pt, fill: white)
                h(4pt)
                text(size: 8pt, weight: "semibold", fill: white, upper(sev.label))

                v(-8pt)
                // Count
                text(size: 18pt, weight: "bold", fill: white, str(count))
                v(4pt)
              })
            }
          )
        })
      )
    }
  )
}

/// Create a section header with optional icon and outline entry.
///
/// Parameters:
/// - title: Section title text
/// - extra: Optional extra text to append to title (default: none)
/// - icon-name: Optional icon name (default: none)
/// - level: Heading level for Typst outline/numbering (default: 1)
/// - label: Prefix label before title (default: "SECTION", set to none to omit)
/// - numbered: Enable heading numbering (default: true)
///
/// Returns: A formatted section header with horizontal rule
#let section-header(
  title,
  extra: none,
  icon-name: none,
  level: 1,
  label: "SECTION",
  numbered: true,
) = {
  vgap(config.section-spacing)
  set align(left)

  let title-text = if extra != none {
    upper(title) + " " + upper(str(extra))
  } else {
    upper(title)
  }
  let heading-text = if label != none {
    upper(str(label)) + " " + title-text
  } else {
    title-text
  }

  block(sticky: true, {
    heading(
      level: level,
      outlined: true,
      numbering: if numbered { "1.1" } else { none },
      {
        if icon-name != none {
          icon(icon-name, size: 13pt, fill: config.colors.text-primary)
          h(6pt)
        }
        text(font: config.display-font, size: 12pt, weight: "bold", fill: config.colors.text-primary, heading-text)
      }
    )
    v(2pt)
    hrule
    v(3pt)
  })
}

/// Create an appendix header using appendix lettering instead of numeric numbering.
#let appendix-header(letter, title, icon-name: none) = {
  section-header(
    "APPENDIX " + upper(str(letter)) + " — " + upper(title),
    icon-name: icon-name,
    label: none,
    numbered: false,
  )
}

/// Display a key-value metadata block.
///
/// Parameters:
/// - title: Optional block title (default: none)
/// - data: Dictionary of key-value pairs to display
/// - columns: Number of columns for the grid layout (default: 1)
///
/// Returns: A formatted metadata block
#let metadata-block(title: none, data: (:), columns: 1) = {
  vgap(config.entry-spacing)

  if title != none {
    text(weight: "bold", size: 11pt, title)
    vgap(0.3em)
  }

  block(
    width: 100%,
    inset: config.metadata-block-inset,
    radius: 5pt,
    stroke: 1pt + config.colors.border,
    fill: config.colors.bg-primary,
    {
      let items = data.pairs().map(((key, value)) => (
        text(weight: "bold", fill: config.colors.text-secondary, size: 10pt, key + ":"),
        text(fill: config.colors.text-primary, size: 10pt, value),
      )).flatten()

      grid(
        columns: (auto, 1fr) * columns,
        row-gutter: 0.5em,
        column-gutter: 2em,
        ..items
      )
    }
  )

  v(4pt)
}

/// Base table wrapper with consistent styling.
///
/// Parameters:
/// - columns: Column width specification (auto or array of sizes)
/// - headers: Array of header cells
/// - rows: Array of row cells (flattened)
/// - align: Alignment function or auto (default: auto)
/// - severity-columns: Array of column indices containing severity badges (default: ())
///
/// Returns: A formatted table block
#let base-table(
  columns: auto,
  headers: (),
  rows: (),
  align: auto,
  severity-columns: (), // Array of column indices that contain severity badges
) = {
  let default-align = (col, row) => {
    if row == 0 { center + horizon }
    else if col in severity-columns { center + horizon }
    else { left + horizon }
  }
  
  block(breakable: false, {
    table(
      columns: columns,
      stroke: config.table-stroke,
      inset: config.table-inset,
      align: if align == auto { default-align } else { align },
      fill: (col, row) => {
        if row == 0 {
          config.colors.institutional-primary
        } else if calc.rem(row, 2) == 0 {
          config.colors.bg-primary
        } else {
          none
        }
      },
      ..headers.map(h => text(weight: "bold", size: 10pt, fill: config.colors.on-institutional, h)),
      ..rows,
    )
  })
}

/// Create a flexible data table with optional auto-numbering and severity highlighting.
///
/// Parameters:
/// - headers: Array of column header strings
/// - rows: Array of row data (each row is an array)
/// - columns: Column width specification (auto or array of sizes) (default: auto)
/// - severity-column: Index of column to apply severity badge, or none to disable (default: none)
/// - auto-number: Add automatic row numbering column (default: false)
/// - title: Optional table title shown above table (default: none)
/// - transform: Optional function to transform row data (default: none)
///
/// Returns: A formatted table block
///
/// Example:
/// ```typst
/// #data-table(
///   headers: ("Issue", "Severity"),
///   rows: ((\"SQL Injection\", \"high\"), (\"XSS\", \"medium\")),
///   severity-column: 1,
///   auto-number: true,
/// )
/// ```
#let data-table(
  headers: (),
  rows: (),
  columns: auto,  // Can be array of sizes or auto
  severity-column: none,
  auto-number: false,
  title: none,
  transform: none,  // Optional row transformation function
) = {
  // Validation
  assert(headers.len() > 0, message: "Headers cannot be empty")
  
  // Validate severity-column index
  if severity-column != none {
    validate-column-index(severity-column, headers.len(), param-name: "severity-column")
  }
  
  vgap(config.entry-spacing)
  
  if rows.len() == 0 { return }
  
  // Add title if provided
  if title != none {
    text(weight: "bold", size: 11pt, fill: config.colors.text-primary, title)
    vgap(0.5em)
  }
  
  // Auto-numbering adds a "NO" column
  let final-headers = if auto-number {
    ([*NO*],) + headers.map(h => text(weight: "bold", size: 9.5pt, h))
  } else {
    headers.map(h => text(weight: "bold", size: 9.5pt, h))
  }
  
  // Adjust severity column index if auto-numbering
  let severity-idx = if severity-column != none and auto-number {
    severity-column + 1
  } else {
    severity-column
  }
  
  // Process rows
  let final-rows = rows.enumerate().map(((idx, row)) => {
    let processed-row = if transform != none {
      transform(row, idx)
    } else {
      row
    }
    
    // Add auto-number if enabled
    let numbered-row = if auto-number {
      (str(idx + 1),) + processed-row
    } else {
      processed-row
    }
    
    // Apply severity highlighting
    numbered-row.enumerate().map(((i, cell)) => {
      if severity-idx != none and i == severity-idx {
        severity-badge(cell)
      } else {
        cell
      }
    })
  }).flatten()
  
  base-table(
    columns: if columns == auto { final-headers.len() } else { columns },
    headers: final-headers.map(h => text(weight: "bold", size: 10pt, h)),
    rows: final-rows,
    severity-columns: if severity-idx != none { (severity-idx,) } else { () },
  )
}

/// Create a security findings table with auto-numbering.
///
/// Parameters:
/// - headers: Array of column header strings
/// - rows: Array of row data (each row is an array)
/// - severity-column: Index of column to apply severity badge, or none (default: none)
///
/// Returns: A formatted security table
#let security-table(headers: (), rows: (), severity-column: none) = {
  vgap(config.entry-spacing)

  if rows.len() == 0 { return }

  let final-headers = ([*NO*],) + headers.map(h => text(weight: "bold", size: 10pt, h))

  let severity-idx = if severity-column != none { severity-column + 1 } else { none }

  let final-rows = rows.enumerate().map(((idx, row)) => {
    let numbered-row = (str(idx + 1),) + row

    numbered-row.enumerate().map(((i, cell)) => {
      if severity-idx != none and i == severity-idx {
        severity-badge(cell)
      } else {
        cell
      }
    })
  }).flatten()

  base-table(
    columns: final-headers.len(),
    headers: final-headers,
    rows: final-rows,
    severity-columns: if severity-idx != none { (severity-idx,) } else { () },
  )
}

/// Create a table displaying binary security features.
///
/// Parameters:
/// - entries: Array of dictionaries with keys: path, nx, stack-canary, arc, rpath, code-signature, encrypted
/// - columns: Column width specification (default: pre-configured)
///
/// Returns: A formatted binary analysis table
#let binary-table(
  entries: (),
  columns: (auto, 2.8fr, 0.8fr, 0.9fr, 0.7fr, 0.8fr, 0.8fr, 0.9fr),
) = {
  vgap(config.entry-spacing)

  if entries.len() == 0 { return }

  let headers = (
    [*NO*],
    [*DYLIB/FRAMEWORK*],
    [*NX*],
    [*STACK#linebreak()CANARY*],
    [*ARC*],
    [*RPATH*],
    [*CODE#linebreak()SIG*],
    [*ENCRYPTED*]
  )

  let rows = entries.enumerate().map(((idx, entry)) => (
    str(idx + 1),
    text(size: 8.5pt, font: config.mono-font, entry.path),
    severity-badge(entry.nx),
    severity-badge(entry.at("stack-canary")),
    severity-badge(entry.arc),
    severity-badge(entry.rpath),
    severity-badge(entry.at("code-signature")),
    severity-badge(entry.encrypted),
  )).flatten()

  base-table(
    columns: columns,
    headers: headers,
    rows: rows,
    severity-columns: (2, 3, 4, 5, 6, 7), // All badge columns
    align: (col, row) => {
      if col == 0 { center + horizon }
      else if row == 0 { center + horizon }
      else if col == 1 { left + horizon }
      else { center + horizon }
    },
  )
}

/// Create a table displaying domain information.
///
/// Parameters:
/// - domains: Array of dictionaries with keys: url, status, geolocation (optional)
/// - columns: Column width specification (default: pre-configured)
///
/// Returns: A formatted domain table
#let domain-table(
  domains: (),
  columns: (auto, 2fr, auto, 3fr),
) = {
  vgap(config.entry-spacing)

  if domains.len() == 0 { return }

  let headers = ([*NO*], [*DOMAIN*], [*STATUS*], [*GEOLOCATION*])

  let rows = domains.enumerate().map(((idx, domain)) => (
    str(idx + 1),
    text(font: config.mono-font, size: 9pt, domain.url),
    text(size: 9pt, weight: "medium", fill: config.colors.secure, domain.status),
    if "geolocation" in domain {
      let geo = domain.geolocation
      text(size: 8.5pt, [IP: #geo.ip | Country: #geo.country | City: #geo.city])
    } else {
      text(size: 8.5pt, [N/A])
    },
  )).flatten()

  base-table(
    columns: columns,
    headers: headers,
    rows: rows,
    align: (col, row) => {
      if row == 0 { center + horizon }
      else if col == 0 or col == 2 { center + horizon }
      else { left + horizon }
    },
  )
}

/// Create a table displaying log entries.
///
/// Parameters:
/// - logs: Array of dictionaries with keys: timestamp, event, status
/// - columns: Column width specification (default: pre-configured)
///
/// Returns: A formatted log table
#let log-table(
  logs: (),
  columns: (auto, 1.8fr, 3fr, auto),
) = {
  vgap(config.entry-spacing)

  if logs.len() == 0 { return }

  let headers = ([*NO*], [*TIMESTAMP*], [*EVENT*], [*STATUS*])

  let rows = logs.enumerate().map(((idx, log)) => (
    str(idx + 1),
    text(size: 9pt, log.timestamp),
    text(size: 9pt, log.event),
    if log.status == "OK" {
      text(fill: config.colors.secure, weight: "bold", size: 9pt, "OK")
    } else {
      text(fill: config.colors.high, weight: "bold", size: 9pt, log.status)
    },
  )).flatten()

  base-table(
    columns: columns,
    headers: headers,
    rows: rows,
    align: (col, row) => {
      if row == 0 { center + horizon }
      else if col == 0 or col == 3 { center + horizon }
      else { left + horizon }
    },
  )
}

/// Create a reconnaissance table for discovered items.
///
/// Parameters:
/// - title: Table title (default: "Discovered Items")
/// - items: Array of dictionaries with keys: value, source
/// - item-label: Column label for items (default: "Item")
/// - source-label: Column label for sources (default: "Source")
/// - icon-name: Optional icon for the title (default: none)
/// - columns: Column width specification (default: pre-configured)
///
/// Returns: A formatted reconnaissance table
#let recon-table(
  title: "Discovered Items",
  items: (),
  item-label: "Item",
  source-label: "Source",
  icon-name: none,
  columns: (auto, 2.5fr, 2fr),
) = {
  vgap(config.entry-spacing * 1.2)

  if title != none {
    block({
      if icon-name != none {
        icon(icon-name, size: 12pt, fill: config.colors.text-primary)
        h(7pt)
      }
      text(weight: "bold", size: 12pt, fill: config.colors.text-primary, title)
      vgap(0.6em)
    }, sticky: true)
  }

  if items.len() == 0 { return }

  let headers = ([*NO*], [*#item-label*], [*#source-label*])

  let rows = items.enumerate().map(((idx, item)) => (
    str(idx + 1),
    text(font: config.mono-font, size: 9pt, item.value),
    text(size: 9pt, item.source),
  )).flatten()

  base-table(
    columns: columns,
    headers: headers,
    rows: rows,
    align: (col, row) => {
      if row == 0 { center + horizon }
      else if col == 0 { center + horizon }
      else { left + horizon }
    },
  )
}

/// Render an official seal placeholder with optional image.
#let official-seal(image: none, diameter: 1.35in, fallback-label: "TTQ") = {
  block(
    width: diameter,
    height: diameter,
    stroke: 1.5pt + config.colors.institutional-primary,
    radius: 50%,
    fill: config.colors.bg-dark,
    align(center + horizon, {
      block(
        width: diameter - 0.22in,
        height: diameter - 0.22in,
        stroke: 0.8pt + config.colors.institutional-secondary,
        radius: 50%,
        align(center + horizon, {
          if image != none and str(image) != "" {
            image(str(image), width: diameter - 0.55in)
          } else {
            text(font: config.display-font, weight: "bold", size: 14pt, upper(fallback-label))
          }
        }),
      )
    }),
  )
}

/// Render a document control block for formal report metadata.
#let document-control-block(
  report-number: "UNSPECIFIED",
  classification: "UNCLASSIFIED",
  date: "",
  version: "1.0",
  supersedes: none,
) = {
  let base-rows = (
    ("REPORT NO.", report-number),
    ("CLASSIFICATION", upper(classification)),
    ("DATE", format-official-date(date)),
    ("VERSION", version),
  )
  let rows = if supersedes != none and str(supersedes) != "" {
    base-rows + (("SUPERSEDES", supersedes),)
  } else {
    base-rows
  }

  align(right, block(
    width: 3.25in,
    stroke: 0.9pt + config.colors.institutional-primary,
    fill: config.colors.bg-primary,
    inset: (x: 10pt, y: 8pt),
    {
      grid(
        columns: (1fr, 1fr),
        column-gutter: 8pt,
        row-gutter: 6pt,
        ..rows.enumerate().map(((idx, row)) => (
          text(weight: "bold", size: 9pt, upper(row.at(0))),
          align(right, text(size: 9pt, row.at(1))),
          if idx < rows.len() - 1 {
            line(length: 100%, stroke: 0.4pt + config.colors.border)
          } else { none },
          if idx < rows.len() - 1 {
            line(length: 100%, stroke: 0.4pt + config.colors.border)
          } else { none },
        )).flatten()
      )
    }
  ))
}

/// Render a signature block with prepared/reviewed/approved lanes.
#let signature-block(
  prepared-by: (:),
  reviewed-by: (:),
  approved-by: (:),
) = {
  let lanes = (
    ("PREPARED BY", prepared-by),
    ("REVIEWED BY", reviewed-by),
    ("APPROVED BY", approved-by),
  )

  block(
    width: 100%,
    inset: (x: 6pt, y: 4pt),
    {
      grid(
        columns: (1fr, 1fr, 1fr),
        column-gutter: 12pt,
        ..lanes.map(lane => {
          let data = lane.at(1)
          block(
            inset: (x: 4pt, y: 3pt),
            {
              text(weight: "bold", size: 8.5pt, lane.at(0))
              v(8pt)
              line(length: 100%, stroke: 0.7pt + config.colors.border)
              v(2pt)
              text(size: 8.5pt, if type(data) == dictionary { data.at("name", default: "N/A") } else { str(data) })
              if type(data) == dictionary and data.at("title", default: "") != "" {
                linebreak()
                text(size: 8pt, fill: config.colors.text-secondary, data.title)
              }
            }
          )
        })
      )
    }
  )
}

/// Render a distribution statement block (DoD A-F keywords or custom text).
#let distribution-statement(statement: "a") = {
  let mappings = (
    a: "DISTRIBUTION STATEMENT A: Approved for public release; distribution is unlimited.",
    b: "DISTRIBUTION STATEMENT B: Distribution authorized to U.S. Government agencies only.",
    c: "DISTRIBUTION STATEMENT C: Distribution authorized to U.S. Government agencies and their contractors.",
    d: "DISTRIBUTION STATEMENT D: Distribution authorized to the Department of Defense and U.S. DoD contractors only.",
    e: "DISTRIBUTION STATEMENT E: Distribution authorized to DoD components only.",
    f: "DISTRIBUTION STATEMENT F: Further dissemination only as directed by controlling DoD office.",
  )
  let key = lower(str(statement))
  let content = mappings.at(key, default: if str(statement).trim() == "" { mappings.a } else { str(statement) })

  block(
    width: 100%,
    inset: (x: 10pt, y: 8pt),
    stroke: 1pt + config.colors.institutional-secondary,
    fill: config.colors.bg-primary,
    align(center, text(size: 9pt, weight: "medium", content)),
  )
}

#let recommendation-id(num) = {
  if num < 10 { "REC-00" + str(num) }
  else if num < 100 { "REC-0" + str(num) }
  else { "REC-" + str(num) }
}

/// Render a recommendations table.
#let recommendations-table(recommendations: ()) = {
  if recommendations.len() == 0 { return }
  let rows = recommendations.enumerate().map(((idx, rec)) => {
    let finding-ref = rec.at("finding_reference", default: rec.at("finding", default: "N/A"))
    let action = rec.at("recommended_action", default: rec.at("action", default: rec.at("recommendation", default: "N/A")))
    (
      recommendation-id(idx + 1),
      rec.at("priority", default: rec.at("severity", default: "MEDIUM")),
      finding-ref,
      action,
    )
  })
  data-table(
    headers: ("Recommendation", "Priority", "Finding Reference", "Recommended Action"),
    rows: rows,
    columns: (auto, auto, 1.2fr, 2.6fr),
  )
}

/// Render an acronym appendix table (supports array or dictionary input).
#let acronym-list(acronyms: ()) = {
  if type(acronyms) == dictionary and acronyms.len() == 0 { return }
  if type(acronyms) != dictionary and acronyms.len() == 0 { return }

  let rows = if type(acronyms) == dictionary {
    acronyms.pairs().map(((abbr, expanded)) => (abbr, expanded))
  } else {
    acronyms.map(item => (
      item.at("acronym", default: item.at("term", default: "N/A")),
      item.at("expansion", default: item.at("definition", default: "N/A")),
    ))
  }

  data-table(
    headers: ("Acronym", "Expansion"),
    rows: rows,
    columns: (1fr, 3fr),
  )
}

/// Render a numbered references list.
#let references-list(references: ()) = {
  if references.len() == 0 { return }
  let rows = references.map(ref => (
    if type(ref) == dictionary {
      ref.at("citation", default: ref.at("title", default: "N/A"))
    } else {
      str(ref)
    },
  ))
  data-table(
    headers: ("Reference",),
    rows: rows,
    columns: (1fr,),
    auto-number: true,
  )
}

/// Render an official-style stamp overlay.
#let official-stamp(stamp-text: "DRAFT", color: rgb("#B91C1C"), rotation: -10deg) = {
  rotate(rotation, block(
    inset: (x: 10pt, y: 6pt),
    stroke: 2pt + color,
    radius: 4pt,
    text(font: config.display-font, weight: "bold", size: 12pt, fill: color, upper(str(stamp-text))),
  ))
}

/// Render a black redaction bar sized to the provided content.
#let redact(content) = {
  let redact-color = config.colors.redaction
  box(
    fill: redact-color,
    inset: (x: 3pt, y: 1.5pt),
    radius: 1pt,
    text(fill: redact-color, content),
  )
}

/// Render a formal authority statement block.
#let authority-statement(statement-text) = {
  if str(statement-text).trim() == "" { return }
  block(
    width: 100%,
    inset: (x: 10pt, y: 8pt),
    stroke: 1pt + config.colors.institutional-primary,
    fill: config.colors.bg-primary,
    {
      text(font: config.display-font, size: 10pt, weight: "bold", upper("Authority Statement"))
      v(4pt)
      text(size: 9.5pt, str(statement-text))
    },
  )
}

/// Render a formal handling notice block.
#let handling-notice(notice-text) = {
  if str(notice-text).trim() == "" { return }
  block(
    width: 100%,
    inset: (x: 10pt, y: 8pt),
    stroke: 1pt + config.colors.institutional-secondary,
    fill: config.colors.bg-darker,
    {
      text(font: config.display-font, size: 10pt, weight: "bold", upper("Handling Notice"))
      v(4pt)
      text(size: 9.5pt, str(notice-text))
    },
  )
}

/// Resolve classification styles for banner rendering.
#let classification-levels = (
  unclassified: (
    label: "UNCLASSIFIED",
    color: config.colors.classification-unclassified,
  ),
  fouo: (
    label: "UNCLASSIFIED // FOR OFFICIAL USE ONLY",
    color: config.colors.classification-fouo,
  ),
  cui: (
    label: "CONTROLLED UNCLASSIFIED INFORMATION",
    color: config.colors.classification-cui,
  ),
  confidential: (
    label: "CONFIDENTIAL",
    color: config.colors.classification-confidential,
  ),
)

#let classification-caveat(caveats) = {
  let value = if caveats == none { "" } else { str(caveats).trim() }
  if value == "" { "" } else { " // " + value }
}

#let classification-style(level) = {
  let key = lower(str(level))
  classification-levels.at(key, default: classification-levels.unclassified)
}

/// Render a full-width classification strip.
#let classification-banner(level: "unclassified", caveats: none, width: 100%, inset: (x: 8pt, y: 4pt)) = {
  let style = classification-style(level)
  let caveat-text = classification-caveat(caveats)
  block(
    width: width,
    inset: inset,
    fill: style.color,
    align(center, text(weight: "bold", fill: config.colors.on-institutional, upper(style.label + caveat-text))),
  )
}

/// Running header with title and classification.
#let running-header(title, classification: "unclassified", caveats: none) = {
  let banner-height = 18pt
  block(width: 100%, {
    place(top + left, dx: -config.margin.left, classification-banner(
      level: classification,
      caveats: caveats,
      width: 100% + config.margin.left + config.margin.right,
      inset: (x: 8pt, y: 4pt),
    ))
    // Reserve vertical room so placed banner does not overlap header content.
    block(height: banner-height, [])
    v(4pt)
    grid(
      columns: (1fr,),
      text(font: config.display-font, weight: "bold", size: 9pt, upper(title)),
    )
    v(2pt)
    line(length: 100%, stroke: 0.8pt + config.colors.institutional-secondary)
  })
}

/// Running footer with document control and page numbering.
#let running-footer(document-number: "N/A", date: "", classification: "unclassified", caveats: none) = {
  let banner-height = 18pt
  block(width: 100%, {
    line(length: 100%, stroke: 0.8pt + config.colors.institutional-secondary)
    v(2pt)
    grid(
      columns: (1fr, auto, 1fr),
      text(size: 8pt, [DOC NO. #document-number]),
      context {
        let current-page = counter(page).get().at(0, default: 1)
        let total-pages = counter(page).final().at(0, default: current-page)
        text(size: 8pt, [PAGE #current-page OF #total-pages])
      },
      align(right, text(size: 8pt, if date == "" { "DATE N/A" } else { "DATE " + date })),
    )
    // Reserve vertical room so placed banner does not overlap footer content.
    block(height: banner-height, [])
    place(bottom + left, dx: -config.margin.left, classification-banner(
      level: classification,
      caveats: caveats,
      width: 100% + config.margin.left + config.margin.right,
      inset: (x: 8pt, y: 4pt),
    ))
  })
}
