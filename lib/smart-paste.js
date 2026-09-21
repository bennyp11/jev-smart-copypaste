import { TypeSafeClient, choice, noul } from "@typesafe-ai/sdk";
import { segment, findCandidates } from "./segment.js";
import { FORM_FIELDS } from "./form-schema.js";

const NONE = "none";

// Thresholds are starting points; tune them on real pastes.
const GATE_MIN = 0.3;    // P(yes) below this → the clipboard isn't about a person's background; plain paste
const SKIP_IF_NONE = 0.5; // P(none) at or above this → leave the field alone
const MIN_FILL = 0.15;    // best candidate below this → leave the field alone
const CONFIDENT = 0.5;    // best candidate at or above this → fill silently; below → fill and flag for review

let client;
function getClient() {
  if (!client) client = new TypeSafeClient({ timeout: 30_000 });
  return client;
}

/** Turn one Choice answer into a fill decision code can act on. */
function decide(answer) {
  const pNone = answer.probabilities[NONE] ?? 0;
  const ranked = Object.entries(answer.probabilities)
    .filter(([k]) => k !== NONE)
    .sort((a, b) => b[1] - a[1]);
  const [bestKey, bestP] = ranked[0] ?? [null, 0];
  if (!bestKey || pNone >= SKIP_IF_NONE || bestP < MIN_FILL) {
    return { skip: true, pNone, best: bestKey, bestP };
  }
  return { skip: false, key: bestKey, p: bestP, pNone, status: bestP >= CONFIDENT ? "filled" : "check" };
}

/**
 * Build the fill plan for a paste.
 *
 * @param {object} input
 * @param {string} input.text         raw clipboard text
 * @param {string} [input.targetField] id of the field the user pasted into
 * @param {object} [input.currentValues] field id → current value; non-empty fields are not overwritten
 */
export async function planPaste({ text, targetField, currentValues = {} }) {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return { mode: "plain", fills: [], skipped: [] };

  const { lines, blocks, tagged } = segment(trimmed);
  const candidates = findCandidates(trimmed);

  // A single fact (one line, no separators) is routed, not decomposed:
  // "which field does this belong in?"
  if (lines.length === 1) return routeSingleValue(trimmed, targetField);

  const questions = {
    is_profile: noul(
      "Does `pasted_text` describe a specific person's professional background, such as a resume, CV, bio, LinkedIn profile, or an email signature with their contact details?",
      {
        true: "The text is about one person's career, education, skills, or contact details",
        false: "The text is something else: an article, code, a message, a product description, random notes",
      },
    ),
  };

  const askable = [];
  for (const field of FORM_FIELDS) {
    let criteria;
    if (field.shape === "line") {
      criteria = Object.fromEntries(lines.map((l) => [l.id, null]));
    } else if (field.shape === "block") {
      criteria = Object.fromEntries(blocks.map((b) => [b.id, null]));
    } else if (field.shape === "candidates") {
      const spans = candidates[field.source];
      if (!spans.length) continue; // nothing to choose from; regex found no candidates
      criteria = Object.fromEntries(spans.map((s) => [s, null]));
    } else if (field.shape === "enum") {
      criteria = { ...field.options };
    }
    if (field.shape !== "enum") criteria[NONE] = "None of these is the requested value, or the text does not contain it.";
    questions[field.id] = choice(field.ask, criteria);
    askable.push(field);
  }

  const result = await getClient().systemOne({
    state: { pasted_text: tagged },
    questions,
  });
  const { answers } = result;

  const gate = answers.is_profile.noul;
  if (gate < GATE_MIN) {
    return {
      mode: "plain",
      gate,
      reason: "The clipboard doesn't look like a resume, bio, or profile, so it was pasted as-is.",
      fills: [],
      skipped: [],
      model: result.model,
      usage: result.usage,
    };
  }

  const lineText = Object.fromEntries(lines.map((l) => [l.id, l.text]));
  const blockText = Object.fromEntries(blocks.map((b) => [b.id, b.text]));

  const fills = [];
  const skipped = [];
  for (const field of FORM_FIELDS) {
    const answer = answers[field.id];
    const occupied = String(currentValues[field.id] ?? "").trim() !== "" && field.id !== targetField;
    if (!answer) {
      skipped.push({ field: field.id, label: field.label, reason: "no candidates found in the clipboard" });
      continue;
    }

    if (field.shape === "enum") {
      const p = answer.probabilities[answer.choice];
      if (answer.choice === "not_stated" || p < MIN_FILL) {
        skipped.push({ field: field.id, label: field.label, reason: "not stated in the clipboard", probability: p });
      } else if (occupied) {
        skipped.push({ field: field.id, label: field.label, reason: "already filled; left alone", suggestion: answer.choice, probability: p });
      } else {
        fills.push({ field: field.id, label: field.label, value: answer.choice, source: answer.choice, probability: p, confidence: answer.confidence, status: p >= CONFIDENT ? "filled" : "check" });
      }
      continue;
    }

    const d = decide(answer);
    if (d.skip) {
      skipped.push({ field: field.id, label: field.label, reason: "nothing relevant in the clipboard", pNone: d.pNone, runnerUp: d.best, runnerUpP: d.bestP });
      continue;
    }
    const value = field.shape === "line" ? lineText[d.key] : field.shape === "block" ? blockText[d.key] : d.key;
    if (occupied) {
      skipped.push({ field: field.id, label: field.label, reason: "already filled; left alone", suggestion: value, probability: d.p });
      continue;
    }
    fills.push({ field: field.id, label: field.label, value, source: d.key, probability: d.p, confidence: answer.confidence, status: d.status });
  }

  return { mode: "smart", gate, fills, skipped, segments: { lines: lines.length, blocks: blocks.length }, model: result.model, usage: result.usage };
}

/** One value, one question: which field does it belong in? */
async function routeSingleValue(value, targetField) {
  const criteria = Object.fromEntries(
    FORM_FIELDS.filter((f) => f.shape !== "enum").map((f) => [f.id, f.label]),
  );
  criteria[NONE] = "This value does not belong in any of the listed fields";

  const result = await getClient().systemOne({
    state: { pasted_value: value },
    questions: {
      field: choice("Which job-application form field should `pasted_value` be entered into?", criteria),
    },
  });
  const answer = result.answers.field;
  const d = decide(answer);
  if (d.skip) {
    // Unroutable: honour the user's intent and paste where they pasted.
    return { mode: "plain", reason: "Couldn't tell which field this belongs in; pasted where you put it.", fills: [], skipped: [], model: result.model, usage: result.usage };
  }
  const field = FORM_FIELDS.find((f) => f.id === d.key);
  return {
    mode: "route",
    fills: [{ field: field.id, label: field.label, value, source: "clipboard", probability: d.p, confidence: answer.confidence, status: d.status }],
    skipped: [],
    redirected: field.id !== targetField,
    model: result.model,
    usage: result.usage,
  };
}
