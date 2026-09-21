const form = document.getElementById("application");
const report = document.getElementById("report");
const meta = document.getElementById("meta");
const status = document.getElementById("status");
const toggle = document.getElementById("smart-toggle");
const clipboardSrc = document.getElementById("clipboard-src");

const WIDE = new Set(["summary", "skills", "recent_role", "education", "why_us"]);
const pretty = (s) => s.replace(/_/g, " ");

// --- build the form from the server's schema so both sides agree on field ids ---
const fields = await (await fetch("/api/fields")).json();
for (const f of fields) {
  const wrap = document.createElement("div");
  wrap.className = "field" + (WIDE.has(f.id) || f.shape === "block" ? " wide" : "");
  wrap.dataset.field = f.id;
  const label = document.createElement("label");
  label.textContent = f.label;
  label.htmlFor = `f-${f.id}`;
  let input;
  if (f.shape === "enum") {
    input = document.createElement("select");
    input.append(new Option("— select —", ""));
    for (const o of f.options.filter((o) => o !== "not_stated")) input.append(new Option(pretty(o), o));
  } else if (f.shape === "block") {
    input = document.createElement("textarea");
  } else {
    input = document.createElement("input");
    input.type = f.id === "email" ? "email" : "text";
  }
  input.id = `f-${f.id}`;
  input.name = f.id;
  const badge = document.createElement("span");
  badge.className = "badge";
  wrap.append(label, input, badge);
  form.append(wrap);
}

// --- sample clipboard ---
clipboardSrc.value = await (await fetch("/resume.txt")).text();
document.getElementById("copy-btn").addEventListener("click", async () => {
  clipboardSrc.select();
  try { await navigator.clipboard.writeText(clipboardSrc.value); } catch { document.execCommand("copy"); }
  flash("Copied. Now click any field in the form and paste (⌘V / Ctrl+V).");
});
document.getElementById("clear-btn").addEventListener("click", () => {
  for (const el of form.elements) el.value = "";
  for (const w of form.querySelectorAll(".field")) { w.className = w.className.replace(/\b(filled|check)\b/g, ""); w.querySelector(".badge").textContent = ""; }
  report.innerHTML = '<p class="empty">Paste into the form to see the routing decisions.</p>';
  meta.textContent = "";
  status.hidden = true;
});

function flash(msg, kind = "") {
  status.hidden = false;
  status.className = "status " + kind;
  status.textContent = msg;
}

function currentValues() {
  const out = {};
  for (const f of fields) out[f.id] = form.elements[f.id].value;
  return out;
}

function plainPaste(el, text) {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  el.value = el.value.slice(0, start) + text + el.value.slice(end);
}

// --- the paste interception ---
form.addEventListener("paste", async (e) => {
  const el = e.target;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) return;
  if (!toggle.checked) return; // ordinary paste
  const text = e.clipboardData.getData("text/plain");
  if (!text.trim()) return;
  e.preventDefault();

  const targetField = el.name;
  flash("Asking Jev where this goes…", "busy");
  form.style.opacity = ".6";
  try {
    const res = await fetch("/api/smart-paste", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, targetField, currentValues: currentValues() }),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
    const plan = await res.json();
    applyPlan(plan, el, text);
  } catch (err) {
    flash(`Smart paste failed (${err.message}); pasted as-is.`, "error");
    if (!(el instanceof HTMLSelectElement)) plainPaste(el, text);
  } finally {
    form.style.opacity = "";
  }
});

function applyPlan(plan, el, text) {
  meta.textContent = plan.model ? `${plan.model} · ${plan.ms} ms · ${plan.usage.input_tokens} tokens` : "";

  if (plan.mode === "plain") {
    if (!(el instanceof HTMLSelectElement)) plainPaste(el, text);
    flash(plan.reason ?? "Pasted as-is.");
    report.innerHTML = `<div class="banner warn">${escape(plan.reason ?? "Pasted as-is.")}${plan.gate != null ? ` <b>P(profile)=${plan.gate.toFixed(2)}</b>` : ""}</div>`;
    return;
  }

  for (const w of form.querySelectorAll(".field")) { w.classList.remove("filled", "check"); w.querySelector(".badge").textContent = ""; }
  for (const f of plan.fills) {
    const input = form.elements[f.field];
    input.value = f.value;
    const wrap = input.closest(".field");
    wrap.classList.add(f.status);
    wrap.querySelector(".badge").textContent = `${f.source} · ${Math.round(f.probability * 100)}%`;
  }

  const n = plan.fills.length;
  if (plan.mode === "route") {
    flash(plan.redirected ? `That looked like a ${plan.fills[0].label.toLowerCase()} — moved it there.` : `Pasted into ${plan.fills[0].label}.`);
  } else {
    flash(`Filled ${n} field${n === 1 ? "" : "s"} from ${plan.segments.lines} lines / ${plan.segments.blocks} blocks. ${plan.skipped.length} left alone.`);
  }

  const parts = [];
  if (plan.mode === "route" && plan.redirected) {
    parts.push(`<div class="banner info">You pasted into <b>${escape(pretty(el.name))}</b>, but Jev read this as a <b>${escape(plan.fills[0].field)}</b>, so it went there instead.</div>`);
  }
  if (plan.gate != null) parts.push(`<div class="banner info">Looks like a person's professional profile: <b>P=${plan.gate.toFixed(2)}</b>. One request, ${fields.length} field questions + 1 gate.</div>`);
  parts.push('<div class="rows">');
  for (const f of plan.fills) {
    parts.push(`<div class="row ${f.status}"><span class="dot"></span><div><div class="lab">${escape(f.label)}</div><div class="val">${escape(f.source)} → ${escape(f.value.split("\n")[0])}</div>${f.status === "check" ? '<div class="why">low probability — worth a look</div>' : ""}</div><div class="p">${Math.round(f.probability * 100)}%</div></div>`);
  }
  for (const s of plan.skipped) {
    parts.push(`<div class="row skip"><span class="dot"></span><div><div class="lab">${escape(s.label)}</div><div class="why">${escape(s.reason)}${s.suggestion ? ` (would have: ${escape(String(s.suggestion).split("\n")[0])})` : ""}</div></div><div class="p">${s.pNone != null ? `none ${Math.round(s.pNone * 100)}%` : ""}</div></div>`);
  }
  parts.push("</div>");
  parts.push('<div class="legend"><span class="g">filled</span><span class="y">filled, check it</span><span>left alone</span></div>');
  report.innerHTML = parts.join("");
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
