~~~card-yaml
#@quill: static_analysis_report@0.1
report_title: RAPTOR-9X Fire Control — Cybersecurity Assessment Report
report_type: "WEAPON SYSTEM CYBERSECURITY ASSESSMENT REPORT"
classification: unclassified
document_number: WS-CYB-R9X-2025-004
version: "1.3"
supersedes: "WS-CYB-R9X-2024-018"
preparing_organization: "Aeronautical Systems Cyber Test Wing, Detachment 7 (Fictional)"
poc_name: "Maj. Jordan Reyes"
poc_title: "Lead Weapon System Cyber Assessor"
poc_email: "jordan.reyes.cyb@dod.example.mil"
poc_phone: "DSN 312-555-0192"
distribution_statement: a
cover_stamp: REVIEWED
authority: "Assessment conducted under Program Executive Office — Strike Fighters (fictional) cybersecurity test authority and applicable DoD RMF policy for weapon system software baselines."
handling_notice: "This document may contain vulnerability and architecture details for a fielded fire-control subsystem. Distribution is limited to personnel with a valid need-to-know for cybersecurity or accreditation decisions."
executive_summary: "The RAPTOR-9X Mission Software Package (MSP) v2.4.1 exhibits a moderate residual cybersecurity risk suitable for continued testing under constraints. Dominant issues are predictable entropy in keying material paths and legacy integrity checks using MD5 in non-flight-critical maintenance routines. Recommend cryptographic modernization, stack protection on all privileged images, and closure of maintenance-port exposure before operational authorization."
system_name: RAPTOR-9X Fire Control Mission Software Package (MSP)
system_identifier: WS-R9X-FCS-MSP-02.04.01-BL47
system_version: "2.4.1"
platform: Green Hills INTEGRITY RTOS 19.0 (ARMv8-A)
scan_date: "2025-07-03"
file_name: R9X-FCS-MSP_v2.4.1-signed.bin

# Security Score
security_score: 44
risk_level: MEDIUM
findings_high: 2
findings_warning: 2
findings_info: 0
findings_secure: 1
findings_hotspot: 0

# File Information
file_size: "38.7 MB"
md5: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
sha1: 1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0
sha256: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2

# System profile
system_type: Safety-critical embedded fire-control subsystem

# Build & Platform
sdk_name: GHS MULTI for ARM
sdk_version: "2023.1.4"
build_number: "BL47"
platform_version: "INTEGRITY 19.0.15"
min_os_version: "N/A (bare-metal partition)"
supported_platforms: "RAPTOR-9X Weapon Computer Assembly (WCA-3)"

# Binary Information
architecture: ARM64
sub_architecture: ARMv8-A
bit_width: "64-bit"
endianness: Little Endian

# Binary Code Analysis Findings
binary_findings:
  - issue: "Predictable randomness in keying helper"
    severity: high
    standards: "CWE-330"
    description: "Maintenance partition uses libc rand()/srand() in a routine that seeds session tokens for ground datalink diagnostics."
  - issue: "Legacy integrity algorithm"
    severity: high
    standards: "CWE-327"
    description: "MD5 present in logistics patch verification path; not in flight-critical loop but violates program crypto standard."
  - issue: "Format string style logging"
    severity: warning
    standards: "CWE-134"
    description: "User-influenced maintenance strings passed to debug printf wrapper without static format enforcement."

# Binary Security Features
security_features:
  - protection: "NX (non-executable data)"
    status: "True"
    severity: secure
    description: "W^X enforced on primary partition per BSP configuration."
  - protection: "PIE / ASLR"
    status: "True"
    severity: secure
    description: "Position-independent images loaded with randomized base where supported by bootloader."
  - protection: "Stack canary"
    status: "False"
    severity: high
    description: "Privileged maintenance ELF built without stack smashing protection; increases exploit reliability class."
  - protection: "Secure boot chain"
    status: "True"
    severity: secure
    description: "Code signing verified through WCA-3 ROM trust anchor to signed MSP image."

# Dependency Analysis
dependencies:
  - path: "/opt/ghs/lib/libintegrity_net.a"
    nx: secure
    stack_canary: secure
    arc: secure
    rpath: secure
    code_signature: secure
    encrypted: info
  - path: "/vendor/libics/libics_maint.so"
    nx: warning
    stack_canary: warning
    arc: secure
    rpath: secure
    code_signature: warning
    encrypted: secure

# Domain Malware Check
domains:
  - url: "maint.r9x-program.dod.example.mil"
    status: "OK"
    ip: "192.0.2.44"
    country: "United States"
    city: "Program depot enclave (synthetic)"
  - url: "telemetry.pki.dod.example.mil"
    status: "OK"
    ip: "198.51.100.12"
    country: "United States"
    city: "PKI bridge (synthetic)"

# Sensitive Data Discovery
emails_found:
  - value: "r9x-csirt@dod.example.mil"
    source: "R9X-FCS-MSP (main image)"
  - value: "vendor.support@aeroedge.example.com"
    source: "/vendor/libics/README embedded string"

urls_found:
  - value: "https://maint.r9x-program.dod.example.mil/patch-catalog/"
    source: "R9X-FCS-MSP (main image)"

secrets_found:
  - value: "Partial HMAC test vector: 4f3c****************"
    source: "maint_config.json (embedded)"

# Scan Logs
scan_logs:
  - timestamp: "2025-07-03 08:15:02"
    event: "Static analysis initiated — R9X-FCS-MSP_v2.4.1-signed.bin"
    status: "OK"
  - timestamp: "2025-07-03 08:18:41"
    event: "Partitioned image unpack; primary + maintenance ELFs fingerprinted"
    status: "OK"
  - timestamp: "2025-07-03 09:04:17"
    event: "Crypto and entropy ruleset pass complete; 2 high findings queued for engineering review"
    status: "OK"

# Recommendations
recommendations:
  - priority: HIGH
    finding_reference: CWE-330
    recommended_action: "Replace diagnostic session entropy with a FIPS-approved DRBG (e.g., HASH_DRBG) fed from hardware TRNG; remove rand()/srand() from all signed images."
  - priority: MEDIUM
    finding_reference: CWE-327
    recommended_action: "Migrate logistics integrity checks to SHA-256 or program-approved HMAC; document waiver if legacy field hardware cannot be reflashed in this fiscal year."

# Appendices
acronyms:
  - acronym: ASLR
    expansion: Address Space Layout Randomization
  - acronym: RMF
    expansion: Risk Management Framework
  - acronym: MSP
    expansion: Mission Software Package

references:
  - "NIST SP 800-53 Rev. 5, Security and Privacy Controls for Information Systems and Organizations"
  - "DoD Instruction 8510.01, Risk Management Framework (RMF) for DoD Systems (representative)"
  - "NIST SP 800-160 Vol. 2, Developing Cyber-Resilient Systems (representative)"

# Footer
generator_name: Synthetic Static Analyzer (example)
generator_version: "0.9.2"
~~~

This cybersecurity assessment report summarizes static analysis and configuration review artifacts for a fictional weapon system software baseline. The body section is optional and can hold program office notes, waiver text, or test limitations.
