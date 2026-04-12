#import "@local/quillmark-helper:0.1.0": data
#import "@local/ttq-static-analysis-report:0.2.0": acronym-list, appendix-header, authority-statement, binary-table, classification-banner, config, distribution-statement, document-control-block, domain-table, handling-notice, log-table, metadata-block, official-seal, official-stamp, recommendations-table, references-list, recon-table, report, running-footer, running-header, scorecard, section-header, security-table, severity-summary

// Apply global report styling
#show: report

#let classification-level = data.at("classification", default: "unclassified")
#let classification-caveats = data.at("classification_caveats", default: "")
#let document-number = data.at("document_number", default: "UNSPECIFIED")
#let report-type = data.at("report_type", default: "WEAPON SYSTEM CYBERSECURITY ASSESSMENT REPORT")
#let cover-version = data.at("version", default: "1.0")
#let supersedes = data.at("supersedes", default: "")
#let preparing-organization = data.at("preparing_organization", default: "")
#let poc-name = data.at("poc_name", default: "")
#let poc-title = data.at("poc_title", default: "")
#let poc-email = data.at("poc_email", default: "")
#let poc-phone = data.at("poc_phone", default: "")
#let distribution = data.at("distribution_statement", default: "a")
#let executive-summary = data.at("executive_summary", default: "")
#let recommendations = data.at("recommendations", default: ())
#let acronyms = data.at("acronyms", default: ())
#let references = data.at("references", default: ())
#let seal-image = data.at("seal_image", default: "")
#let cover-stamp = data.at("cover_stamp", default: "")
#let authority-text = data.at("authority", default: "")
#let handling-notice-text = data.at("handling_notice", default: data.at("handling-notice", default: ""))

#set page(
  header: running-header(
    data.at("report_title", default: "Weapon System Cybersecurity Report"),
    classification: classification-level,
    caveats: classification-caveats,
  ),
  footer: running-footer(
    document-number: document-number,
    date: data.scan_date,
    classification: classification-level,
    caveats: classification-caveats,
  ),
)

// ========================================
// 1. COVER PAGE
// ========================================

#align(center, official-seal(
  image: if seal-image != "" { seal-image } else { none },
  diameter: 1.45in,
))

#v(6pt)
#align(center, text(
  font: config.display-font,
  size: 24pt,
  weight: "bold",
  upper(data.at("report_title", default: "Weapon System Cybersecurity Report")),
))
#if data.at("subtitle", default: "") != "" {
  v(2pt)
  align(center, text(font: config.display-font, size: 12pt, data.subtitle))
}
#v(4pt)
#align(center, text(font: config.display-font, size: 11pt, weight: "semibold", upper(report-type)))

#v(10pt)
#document-control-block(
  report-number: document-number,
  classification: classification-level,
  date: data.scan_date,
  version: cover-version,
  supersedes: if supersedes != "" { supersedes } else { none },
)

#if cover-stamp != "" {
  v(4pt)
  align(right, official-stamp(stamp-text: cover-stamp))
}

#v(8pt)
#line(length: 100%, stroke: 2pt + config.colors.institutional-primary)
#v(1.5pt)
#line(length: 100%, stroke: 0.8pt + config.colors.institutional-secondary)

#v(8pt)
#if preparing-organization != "" {
  text(weight: "bold", upper("Preparing Organization"))
  linebreak()
  text(preparing-organization)
  v(6pt)
}

#{
  let poc-data = (:)
  if poc-name != "" { poc-data.insert("Name", poc-name) }
  if poc-title != "" { poc-data.insert("Title", poc-title) }
  if poc-email != "" { poc-data.insert("Email", poc-email) }
  if poc-phone != "" { poc-data.insert("Phone", poc-phone) }
  if poc-data.len() > 0 {
    metadata-block(title: "Point of Contact", data: poc-data)
  }
}

#distribution-statement(statement: distribution)

#pagebreak()

#if authority-text != "" or handling-notice-text != "" {
  if authority-text != "" {
    authority-statement(authority-text)
  }
  if handling-notice-text != "" {
    v(8pt)
    handling-notice(handling-notice-text)
  }
  pagebreak()
}

// ========================================
// 2. TABLE OF CONTENTS
// ========================================

#align(center, text(font: config.display-font, size: 16pt, weight: "bold", "TABLE OF CONTENTS"))
#v(6pt)
#outline(title: none)

#pagebreak()

// ========================================
// 3. EXECUTIVE SUMMARY
// ========================================

#section-header("Executive Summary", icon-name: "file-signature")

#if executive-summary != "" {
  executive-summary
} else {
  [This executive summary presents the assessed cybersecurity posture of #data.system_name and summarizes priority risks for accreditation and fielding decisions.]
}

#scorecard(
  score: int(data.security_score),
  risk-level: data.risk_level,
  findings: (
    High: int(data.at("findings_high", default: 0)),
    Warning: int(data.at("findings_warning", default: 0)),
    Info: int(data.at("findings_info", default: 0)),
    Secure: int(data.at("findings_secure", default: 0)),
    Hotspot: int(data.at("findings_hotspot", default: 0)),
  ),
)

// ========================================
// 4. FINDINGS SEVERITY SUMMARY
// ========================================

#section-header("Findings Severity Summary", icon-name: "chart-pie")

#severity-summary(counts: (
  High: int(data.at("findings_high", default: 0)),
  Warning: int(data.at("findings_warning", default: 0)),
  Info: int(data.at("findings_info", default: 0)),
  Secure: int(data.at("findings_secure", default: 0)),
  Hotspot: int(data.at("findings_hotspot", default: 0)),
))

// ========================================
// 5. TECHNICAL SPECIFICATIONS
// ========================================

#section-header("File Information", icon-name: "file-code")

#{
  let file-data = ("File Name": data.file_name)
  if data.at("file_size", default: "") != "" { file-data.insert("File Size", data.file_size) }
  if data.at("md5", default: "") != "" { file-data.insert("MD5", data.md5) }
  if data.at("sha1", default: "") != "" { file-data.insert("SHA1", data.sha1) }
  if data.at("sha256", default: "") != "" { file-data.insert("SHA256", data.sha256) }
  metadata-block(data: file-data)
}

#section-header("System information", icon-name: "layer-group")

#{
  let system-data = ("Designation": data.system_name)
  if data.at("system_type", default: "") != "" { system-data.insert("System category", data.system_type) }
  system-data.insert("Baseline identifier", data.system_identifier)
  system-data.insert("Version", data.system_version)
  metadata-block(data: system-data)
}

// Build & Platform (only if data is present)
#{
  let build-data = (:)
  if data.at("sdk_name", default: "") != "" { build-data.insert("SDK Name", data.sdk_name) }
  if data.at("sdk_version", default: "") != "" { build-data.insert("SDK Version", data.sdk_version) }
  if data.at("build_number", default: "") != "" { build-data.insert("Build Number", data.build_number) }
  if data.at("platform_version", default: "") != "" { build-data.insert("Platform Version", data.platform_version) }
  if data.at("min_os_version", default: "") != "" { build-data.insert("Min OS Version", data.min_os_version) }
  if data.at("supported_platforms", default: "") != "" { build-data.insert("Supported Platforms", data.supported_platforms) }
  if build-data.len() > 0 {
    section-header("Build & Platform Information", icon-name: "gear")
    metadata-block(data: build-data)
  }
}

// Binary Information (only if data is present)
#{
  let bin-data = (:)
  if data.at("architecture", default: "") != "" { bin-data.insert("Architecture", data.architecture) }
  if data.at("sub_architecture", default: "") != "" { bin-data.insert("Sub Architecture", data.sub_architecture) }
  if data.at("bit_width", default: "") != "" { bin-data.insert("Bit", data.bit_width) }
  if data.at("endianness", default: "") != "" { bin-data.insert("Endianness", data.endianness) }
  if bin-data.len() > 0 {
    section-header("Binary Information", icon-name: "microchip")
    metadata-block(data: bin-data)
  }
}

// ========================================
// 6. PRIMARY BINARY ANALYSIS
// ========================================

#{
  let findings = data.at("binary_findings", default: ())
  let features = data.at("security_features", default: ())
  if findings.len() > 0 or features.len() > 0 {
    section-header("Primary Binary Analysis", icon-name: "bug")
  }
  if findings.len() > 0 {
    section-header("Binary Code Analysis", icon-name: "bug", level: 2)
    security-table(
      headers: ("Issue", "Severity", "Standards", "Description"),
      severity-column: 1,
      rows: findings.map(f => (
        f.issue,
        f.severity,
        f.at("standards", default: ""),
        f.description,
      )),
    )
  }
}

#{
  let features = data.at("security_features", default: ())
  if features.len() > 0 {
    section-header("Binary Security Features", icon-name: "shield", level: 2)
    security-table(
      headers: ("Protection", "Status", "Severity", "Description"),
      severity-column: 2,
      rows: features.map(f => (
        f.protection,
        f.status,
        f.severity,
        f.description,
      )),
    )
  }
}

// ========================================
// 7. DEPENDENCY ANALYSIS
// ========================================

#{
  let deps = data.at("dependencies", default: ())
  if deps.len() > 0 {
    section-header("Framework & Library Analysis", icon-name: "cubes")
    binary-table(
      entries: deps.map(d => (
        path: d.path,
        nx: d.nx,
        stack-canary: d.stack_canary,
        arc: d.arc,
        rpath: d.rpath,
        code-signature: d.code_signature,
        encrypted: d.encrypted,
      )),
    )
  }
}

// ========================================
// 8. NETWORK & DOMAIN ANALYSIS
// ========================================

#{
  let warning = data.at("ofac_warning", default: "")
  if warning != "" {
    section-header("Network Security Analysis", icon-name: "network-wired")
    block(
      width: 100%,
      inset: 14pt,
      stroke: (left: 4pt + config.colors.warning-accent, rest: 1pt + config.colors.warning-border),
      fill: config.colors.warning-bg,
      radius: 4pt,
      [
        #text(size: 11pt, weight: "bold", fill: config.colors.warning-accent, [WARNING: OFAC Sanctioned Countries])
        #v(6pt)
        #text(size: 10pt, fill: config.colors.text-primary, warning)
      ]
    )
  }
}

#{
  let doms = data.at("domains", default: ())
  if doms.len() > 0 {
    section-header("Domain Malware Check", icon-name: "globe")
    domain-table(
      domains: doms.map(d => (
        url: d.url,
        status: d.status,
        geolocation: (
          ip: d.at("ip", default: "N/A"),
          country: d.at("country", default: "N/A"),
          city: d.at("city", default: "N/A"),
        ),
      )),
    )
  }
}

// ========================================
// 9. DATA RECONNAISSANCE
// ========================================

#{
  let emails = data.at("emails_found", default: ())
  if emails.len() > 0 {
    section-header("Sensitive Data Discovery", icon-name: "magnifying-glass")
    recon-table(
      title: "Email Addresses Found",
      item-label: "Email",
      source-label: "Source File",
      icon-name: "envelope",
      items: emails.map(e => (value: e.value, source: e.source)),
    )
  }
}

#{
  let urls = data.at("urls_found", default: ())
  if urls.len() > 0 {
    recon-table(
      title: "URLs Found",
      item-label: "URL",
      source-label: "Source File",
      icon-name: "link",
      items: urls.map(u => (value: u.value, source: u.source)),
    )
  }
}

#{
  let secrets = data.at("secrets_found", default: ())
  if secrets.len() > 0 {
    recon-table(
      title: "API Keys & Secrets",
      item-label: "Type",
      source-label: "Location",
      icon-name: "key",
      items: secrets.map(s => (value: s.value, source: s.source)),
    )
  }
}

// ========================================
// 10. AUDIT TRAIL
// ========================================

#{
  let logs = data.at("scan_logs", default: ())
  if logs.len() > 0 {
    section-header("Scan Execution Log", icon-name: "clipboard-list")
    log-table(
      logs: logs.map(l => (
        timestamp: l.timestamp,
        event: l.event,
        status: l.status,
      )),
    )
  }
}

// ========================================
// 11. ADDITIONAL NOTES (if any)
// ========================================

#if data.BODY != "" {
  section-header("Additional Notes", icon-name: "note-sticky")
  data.BODY
}

// ========================================
// 12. FINDINGS & RECOMMENDATIONS
// ========================================

#if recommendations.len() > 0 {
  section-header("Findings & Recommendations", icon-name: "list-check")
  recommendations-table(recommendations: recommendations)
}

// ========================================
// 13. APPENDIX A — ACRONYMS
// ========================================

#{
  let has-acronyms = if type(acronyms) == dictionary { acronyms.len() > 0 } else { acronyms.len() > 0 }
  if has-acronyms {
    appendix-header("A", "Acronyms", icon-name: "book")
    acronym-list(acronyms: acronyms)
  }
}

// ========================================
// 14. APPENDIX B — REFERENCES
// ========================================

#if references.len() > 0 {
  appendix-header("B", "References", icon-name: "book-open")
  references-list(references: references)
}

// ========================================
// 15. FOOTER
// ========================================

#{
  let gen = data.at("generator_name", default: "")
  let ver = data.at("generator_version", default: "")
  if gen != "" {
    v(1fr)
    align(center, text(size: 8.5pt, fill: config.colors.text-secondary, {
      [Report Generated by #gen]
      if ver != "" [ v#ver]
    }))
  }
}
