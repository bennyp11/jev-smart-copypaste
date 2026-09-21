# Smart Paste — Jev routes your clipboard into the right form fields

Copy a whole resume. Paste into *any* field of a job application. Only the relevant
pieces land, each in the field it belongs to, and fields with nothing relevant
(like "Why do you want to work here?") stay empty.

Built on [TypeSafe](https://docs.typesafe.ai) / Jev. No text is generated: every value
that lands in a field is a verbatim copy of something that was on the clipboard.

## Run it

```sh
npm install
# .env holds TYPESAFE_API_KEY=...
PORT=3456 npm start        # → http://localhost:3456
npm test                   # runs the planner against sample/resume.txt, prints the fill plan
```

## How it works

1. **Code segments the clipboard** (`lib/segment.js`). Every line is tagged `L01`, `L02`…
   (lines are further split on `|`, `•`, tabs, em dashes so "Name | City | email" becomes
   three candidates). Blank lines and ALL-CAPS headings start blocks `B1`, `B2`…. Regexes
   over-find emails, phones, and URLs.

2. **One Jev request asks one question per form field** (`lib/smart-paste.js`), all in
   parallel over the same tagged text:
   - line fields (name, location, title, company) → a `Choice` over line IDs + `none`
   - block fields (summary, skills, recent role, education, why-us) → a `Choice` over block IDs + `none`
   - email / phone / URL fields → a `Choice` over the verbatim regex spans + `none`
   - dropdowns (seniority, degree) → a `Choice` over the dropdown's own options + `not_stated`
   - plus a `Noul` gate: *is this text even about a person's professional background?*

3. **Code applies the answers.** `P(none) ≥ 0.5` → leave the field alone. Best option
   `≥ 0.5` → fill (green); between `0.15` and `0.5` → fill and flag for review (amber).
   Already-filled fields are never overwritten. Gate below `0.3` → ordinary paste.

Two other paths fall out of the same machinery:
- **Single value** (paste just a phone number into "Full name") → one `Choice` over the
  field ids: *which field does this belong in?* It gets redirected.
- **Not a resume** (paste an article) → the gate says no, ordinary paste, and the report
  says why.

On the sample resume this is one request, ~250–550 ms, ~3.8k input tokens, and every
field lands correctly with the cover-letter field correctly skipped (`P(none) = 1.00`).

## Files

```
server.js            tiny node:http server: static files + POST /api/smart-paste (key stays server-side)
lib/segment.js       clipboard → tagged lines/blocks + regex candidates
lib/form-schema.js   the form fields, their shapes, and the literal question Jev answers for each
lib/smart-paste.js   builds the questions, calls Jev, turns answers into a fill plan
public/              the demo page (form built from /api/fields; paste event intercepted)
sample/resume.txt    demo clipboard
test/smoke.js        prints the plan; `--extra` also runs the single-value and non-resume cases
```

## Tuning

Thresholds live at the top of `lib/smart-paste.js`. Field questions live in
`lib/form-schema.js` — Jev reads literally, so each `ask` names exactly what counts and
what doesn't. Add a field by adding an entry there; the form and the questions both
follow from it.
