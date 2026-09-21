// Code-side candidate finding. Jev only ever *selects* among what this file
// produces, so the value that lands in a form field is always a verbatim copy
// of something the user actually copied. Over-find; the model can say "none".

const MAX_CHOICE_OPTIONS = 254; // Choice accepts 255 options; one is reserved for "none"

// Inline separators that resumes use to pack several facts on one line:
// "Jane Doe | San Francisco, CA | jane@x.com"  or  "Acme Corp • Senior Engineer"
// (an en dash " – " is left alone: it usually joins a date range like "Mar 2022 – Present")
const INLINE_SPLIT = /\s*(?:\||•|·|●|▪|◦|‖|\t| {3,}| — )\s*/;

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /\(?\+?\d[\d\s().-]{6,}\d/g;
const URL_RE = /(?:https?:\/\/)?(?:www\.)?[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?:\/[^\s|•·,)]*)?/g;

// A short, mostly-uppercase line, or one that ends with a colon, reads as a section heading.
function looksLikeHeading(text) {
  if (text.length > 40) return false;
  const letters = text.replace(/[^A-Za-z]/g, "");
  if (!letters) return false;
  const upperShare = letters.replace(/[^A-Z]/g, "").length / letters.length;
  return upperShare > 0.8 || /:$/.test(text.trim());
}

/**
 * Split clipboard text into tagged lines and blocks.
 *
 * Returns { lines: [{id, text, block}], blocks: [{id, lineIds, text}], tagged }
 * where `tagged` is the document Jev reads: each line prefixed with its id and
 * each block introduced by a `[B#]` marker.
 */
export function segment(text) {
  const rawLines = text.replace(/\r\n?/g, "\n").split("\n");
  const lines = [];
  const blocks = [];
  let current = null;

  const startBlock = () => {
    current = { id: `B${blocks.length + 1}`, lineIds: [], text: "" };
    blocks.push(current);
  };

  for (const raw of rawLines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      current = null; // blank line closes the block
      continue;
    }
    if (!current || looksLikeHeading(trimmed)) startBlock();
    const pieces = trimmed.split(INLINE_SPLIT).map((p) => p.trim()).filter(Boolean);
    for (const piece of pieces) {
      if (lines.length >= MAX_CHOICE_OPTIONS) break;
      const id = `L${String(lines.length + 1).padStart(2, "0")}`;
      lines.push({ id, text: piece, block: current.id });
      current.lineIds.push(id);
    }
  }

  for (const b of blocks) {
    const texts = b.lineIds.map((id) => lines.find((l) => l.id === id).text);
    // The heading is what the block is *about*, not part of the value to paste.
    b.text = (texts.length > 1 && looksLikeHeading(texts[0]) ? texts.slice(1) : texts).join("\n");
  }
  // Drop empty blocks (a heading-only block that hit the option cap, etc.)
  const nonEmpty = blocks.filter((b) => b.lineIds.length);

  const tagged = nonEmpty
    .map((b) => `[${b.id}]\n` + b.lineIds.map((id) => `${id}| ${lines.find((l) => l.id === id).text}`).join("\n"))
    .join("\n");

  return { lines, blocks: nonEmpty, tagged };
}

function findAll(re, text) {
  const seen = new Set();
  const out = [];
  for (const m of text.matchAll(re)) {
    const span = m[0].trim().replace(/[.,;:)]+$/, "");
    if (span && !seen.has(span)) {
      seen.add(span);
      out.push(span);
    }
  }
  return out.slice(0, MAX_CHOICE_OPTIONS);
}

/** Regex candidates for the fields where a verbatim span beats a whole line. */
export function findCandidates(text) {
  const emails = findAll(EMAIL_RE, text);
  const phones = findAll(PHONE_RE, text).filter((p) => p.replace(/\D/g, "").length >= 7);
  // URLs: drop anything that is really an email domain
  const urls = findAll(URL_RE, text).filter((u) => !emails.some((e) => e.includes(u)));
  return { emails, phones, urls };
}
