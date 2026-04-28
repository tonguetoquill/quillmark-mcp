// layout.typ

// --- Flattened Color System ---
// Simplified two-level color system for easier access

#let colors = (
  // Backgrounds
  bg-primary: rgb("#F5F0E8"),        // Main paper background
  bg-secondary: rgb("#1B2A3B"),      // Table headers and secondary surfaces
  bg-dark: rgb("#FFFFFF"),           // Pure white backgrounds
  bg-darker: rgb("#F8F9FA"),         // Slightly off-white
  bg-card: rgb("#F9FAFB"),           // Card backgrounds
  
  // Text hierarchy
  text-primary: rgb("#1A1F28"),      // Main text
  text-secondary: rgb("#4B5563"),    // Secondary text
  text-muted: rgb("#9CA3AF"),        // Tertiary/disabled text
  
  // UI elements
  border: rgb("#D0D4D9"),            // Borders
  divider: rgb("#E5E7EB"),           // Dividers
  link: rgb("#2563EB"),              // Links
  link-hover: rgb("#1D4ED8"),        // Link hover state
  header-accent: rgb("#1B2A3B"),     // Section header underlines
  institutional-primary: rgb("#1B2A3B"),
  institutional-secondary: rgb("#5F6B7A"),
  on-institutional: rgb("#FFFFFF"),
  classification-unclassified: rgb("#1E7A3A"),
  classification-fouo: rgb("#B68A0E"),
  classification-cui: rgb("#5B2A86"),
  classification-confidential: rgb("#003366"),
  redaction: rgb("#000000"),
  
  // Status/Alert backgrounds
  warning-bg: rgb("#FEF7F7"),        // Warning backgrounds
  warning-border: rgb("#F3D5D5"),
  warning-accent: rgb("#B91C1C"),
  surface: rgb("#E5E8EC"),           // General surface color
  surface-hover: rgb("#D8DCE3"),     // Hover states
  
  // Severity colors (from severity-levels)
  severity-high: rgb("#DC2626"),
  severity-warning: rgb("#EA580C"),
  severity-info: rgb("#0284C7"),
  severity-secure: rgb("#16A34A"),
  severity-hotspot: rgb("#7C3AED"),
  severity-caution: rgb("#CA8A04"),
  severity-critical: rgb("#B91C1C"),
  
  // Legacy aliases for backward compatibility
  high: rgb("#DC2626"),
  warning: rgb("#EA580C"),
  info: rgb("#0284C7"),
  secure: rgb("#16A34A"),
  hotspot: rgb("#7C3AED"),
  caution: rgb("#CA8A04"),
  critical: rgb("#B91C1C"),
)

// --- Severity Configuration ---
// Single source of truth for severity levels
#let severity-levels = (
  high: (
    color: rgb("#DC2626"),
    icon: "triangle-exclamation",
    label: "High",
  ),
  medium: (
    color: rgb("#EA580C"),
    icon: "triangle-exclamation",
    label: "Medium",
  ),
  warning: (  // Alias for medium
    color: rgb("#EA580C"),
    icon: "triangle-exclamation",
    label: "Warning",
  ),
  info: (
    color: rgb("#0284C7"),
    icon: "circle-info",
    label: "Info",
  ),
  secure: (
    color: rgb("#16A34A"),
    icon: "check",
    label: "Secure",
  ),
  hotspot: (
    color: rgb("#7C3AED"),
    icon: "fire-alt",
    label: "Hotspot",
  ),
)

#let severity-label-standards = (
  mobsf: (
    high: "High",
    medium: "Warning",
    warning: "Warning",
    info: "Info",
    secure: "Secure",
    hotspot: "Hotspot",
  ),
  cvss: (
    high: "High",
    medium: "Medium",
    warning: "Medium",
    info: "Informational",
    secure: "Low",
    hotspot: "Critical",
  ),
  stig: (
    high: "CAT I",
    medium: "CAT II",
    warning: "CAT II",
    info: "CAT III",
    secure: "CAT III",
    hotspot: "CAT I",
  ),
  rmf: (
    high: "High",
    medium: "Moderate",
    warning: "Moderate",
    info: "Low",
    secure: "Low",
    hotspot: "High",
  ),
)

// Helper function to get severity configuration
#let get-severity(level, fallback: "info", standard: "mobsf") = {
  let key = lower(str(level))
  let resolved = severity-levels.at(key, default: severity-levels.at(fallback))
  let standard-key = lower(str(standard))
  let labels = severity-label-standards.at(standard-key, default: severity-label-standards.mobsf)
  let label = labels.at(key, default: labels.at(fallback, default: resolved.label))
  (
    color: resolved.color,
    icon: resolved.icon,
    label: label,
  )
}

// --- Validation Functions ---

/// Validate that a severity level is recognized.
///
/// Parameters:
/// - level: The severity level to validate
///
/// Raises: Assertion error if level is not recognized
#let validate-severity(level) = {
  let key = lower(str(level))
  let valid-levels = ("high", "medium", "warning", "info", "secure", "hotspot")
  assert(
    key in valid-levels,
    message: "Invalid severity level: '" + str(level) + "'. Valid levels are: " + valid-levels.join(", ")
  )
}

/// Validate that a column index is within bounds.
///
/// Parameters:
/// - index: The column index to validate
/// - max-columns: The maximum number of columns
/// - param-name: Name of the parameter being validated (for error messages)
///
/// Raises: Assertion error if index is out of bounds
#let validate-column-index(index, max-columns, param-name: "column index") = {
  if index != none {
    assert(
      type(index) == int,
      message: param-name + " must be an integer or none, got: " + str(type(index))
    )
    assert(
      index >= 0 and index < max-columns,
      message: param-name + " " + str(index) + " is out of bounds (max: " + str(max-columns - 1) + ")"
    )
  }
}

// --- Configurations ---
#let config = (
  font: "EB Garamond",
  mono-font: ("Courier New", "Liberation Mono", "DejaVu Sans Mono"),
  display-font: "EB Garamond",
  base-size: 10.5pt,
  leading: 0.62em, // Global spacing value (vertical rhythm)
  section-spacing: 8pt,
  entry-spacing: 6pt,
  // Margins are top/right/bottom 0.75in and left 1in to support printed/bound report gutters.
  margin: (top: 0.75in, right: 0.75in, bottom: 0.75in, left: 1in),
  table-stroke: 0.75pt + colors.border,
  table-inset: (x: 6pt, y: 5pt), // Consistent table cell padding
  metadata-block-inset: 10pt, // Consistent key-value block padding

  // Component sizing
  badge: (
    padding: (x: 5pt, y: 2pt),
    radius: 3pt,
    font-size: 7.5pt,
  ),

  icon: (
    style: "FontAwesome",
    baseline: 17%,
    default-size: 12pt,
    default-variant: "solid",
  ),
  severity-standard: "mobsf",

  // Color system
  colors: colors,
)

// --- Utility Functions ---
/// Utility function for vertical spacing.
///
/// Parameters:
/// - amount: The amount of vertical space to add
///
/// Returns: Vertical spacing
#let vgap(amount) = v(amount)

/// Format ISO-like dates to DD MMM YYYY (uppercase month) for official report rendering.
///
/// Parameters:
/// - value: Date string, expected format YYYY-MM-DD
///
/// Returns: Formatted date (e.g., 10 APR 2026) or uppercased fallback text
#let format-official-date(value) = {
  let raw = if value == none { "" } else { str(value).trim() }
  if raw == "" { "N/A" }
  else {
    let parts = raw.split("-")
    if parts.len() == 3 {
      let month-map = (
        "01": "JAN", "02": "FEB", "03": "MAR", "04": "APR",
        "05": "MAY", "06": "JUN", "07": "JUL", "08": "AUG",
        "09": "SEP", "10": "OCT", "11": "NOV", "12": "DEC",
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
        day + " " + month + " " + year
      } else {
        upper(raw)
      }
    } else {
      upper(raw)
    }
  }
}

// --- Report Show Rule (Global Setup) ---

/// Apply global report styling and formatting.
///
/// Parameters:
/// - content: The report content to style
///
/// Returns: Styled document content
#let report(content) = {
  set page(
    paper: "us-letter",
    margin: config.margin,
  )

  set text(
    font: config.font,
    size: config.base-size,
    fill: config.colors.text-primary,
  )

  set par(
    leading: config.leading,
    justify: false,
    spacing: config.leading * 1.65, // Space between paragraphs
  )

  // Enforce global block spacing for vertical rhythm
  set block(above: config.leading * 1.2, below: config.leading * 1.2)
  set list(spacing: config.leading)
  set heading(
    numbering: "1.1",
    outlined: true,
  )

  // Hyperlinks should use semantic link color
  show link: it => text(fill: config.colors.link, underline(it))

  content
}
