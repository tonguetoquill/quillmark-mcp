#import "@local/quillmark-helper:0.1.0": data
#import "@local/usaf-intel-brief:0.1.0": intel-brief, title-slide, content-slide, image-slide, top-banners, bottom-banners, slide-footer, validate-banner, build-banner-string, is-true

// Validate banner early.
#let _classification = upper(data.at("classification", default: "UNCLASSIFIED"))
#let _caveats = data.at("classification_caveats", default: "")
#let _banner = build-banner-string(_classification, caveats: _caveats)
#let _val = validate-banner(_banner)
#if not _val.ok {
  panic("Invalid CAPCO banner: " + _val.reason)
}

#let _notional = data.at("notional", default: false)
#let _exercise = data.at("exercise_name", default: "")
#let _unit = data.at("unit", default: "")
#let _dtg = data.at("dtg", default: "")

#let _slides = data.at("$cards", default: ()).filter(c => {
  let k = c.at("$kind", default: "")
  k == "slide" or k == "image_slide"
})
#let _slide-count = _slides.len() + 1  // +1 for title slide

#show: intel-brief

// Page setup: attach banners + footer to every page via page header/footer.
#set page(
  header: top-banners(_classification, _caveats, notional: _notional, exercise-name: _exercise),
  header-ascent: 10pt,
  footer: context [
    #bottom-banners(_classification, _caveats, notional: _notional, exercise-name: _exercise)
    #v(2pt)
    #slide-footer(_unit, str(counter(page).get().at(0)), _slide-count, _dtg)
  ],
  footer-descent: 6pt,
)

// Strip a leading `assets/` from a user-supplied filename so authors who
// include the prefix don't double it. The template always prepends `assets/`.
#let _strip-assets-prefix(name) = {
  let s = str(name).trim()
  if s.starts-with("assets/") { s.slice("assets/".len()) }
  else if s.starts-with("./assets/") { s.slice("./assets/".len()) }
  else { s }
}

// Helper: load a seal from quill-root-relative assets/ and return content.
#let _load-seal(filename, size) = {
  let name = _strip-assets-prefix(filename)
  if name == "" { return none }
  image("assets/" + name, width: size, height: size, fit: "contain")
}

// ── SLIDE 1: TITLE ──
#title-slide(
  brief-title: data.at("brief_title", default: ""),
  subtitle: data.at("subtitle", default: ""),
  briefer: data.at("briefer", default: ""),
  prepared-for: data.at("prepared_for", default: ""),
  dtg: _dtg,
  unit: _unit,
  left-seal: _load-seal(data.at("left_seal", default: ""), 1.6in),
  center-seal: _load-seal(data.at("center_seal", default: ""), 1.8in),
  right-seal: _load-seal(data.at("right_seal", default: ""), 1.6in),
  wordmark: _load-seal(data.at("wordmark", default: ""), 1.4in),
  show-wordmark: data.at("show_wordmark", default: true),
  classified-by: data.at("classified_by", default: ""),
  derived-from: data.at("derived_from", default: ""),
  declassify-on: data.at("declassify_on", default: ""),
  reason: data.at("reason", default: ""),
  classification: _classification,
  caveats: _caveats,
  notional: _notional,
  exercise-name: _exercise,
)

// ── CONTENT SLIDES ──
#for slide in _slides {
  pagebreak()
  let kind = slide.at("$kind", default: "slide")
  if kind == "image_slide" {
    image-slide(
      portion: slide.at("portion", default: "U"),
      title: slide.at("title", default: ""),
      image-content: if slide.at("image_path", default: "") != "" {
        image("assets/" + _strip-assets-prefix(slide.image_path), width: 80%)
      } else { none },
      caption: slide.at("caption", default: ""),
      notional: _notional,
    )
  } else {
    content-slide(
      slide-type: slide.at("slide_type", default: "generic"),
      portion: slide.at("portion", default: "U"),
      title: slide.at("title", default: ""),
      bullets: slide.at("bullets", default: ""),
      bluf: slide.at("bluf", default: ""),
      likelihood-text: slide.at("likelihood_text", default: ""),
      confidence-text: slide.at("confidence_text", default: ""),
      notes: slide.at("notes", default: ""),
      severity: slide.at("severity", default: ""),
      notional: _notional,
    )
  }
}
