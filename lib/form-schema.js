// The job-application form. Each field declares its *shape*, which decides what
// kind of candidates Jev chooses among:
//   line       → one tagged line of the pasted text
//   block      → one tagged block (a paragraph, a job entry, a bullet list)
//   candidates → a verbatim regex span (email / phone / url)
//   enum       → one of the field's own fixed options
//
// `ask` is the literal question Jev answers. Jev reads literally, so each one
// names the exact thing wanted and what does NOT count.

export const FORM_FIELDS = [
  {
    id: "full_name",
    label: "Full name",
    shape: "line",
    ask: "Which line of `pasted_text` is the candidate's own full name (first and last name of the person this document is about)? Not a company, a reference, or a manager's name.",
  },
  {
    id: "email",
    label: "Email",
    shape: "candidates",
    source: "emails",
    ask: "Which of these is the candidate's own contact email address?",
  },
  {
    id: "phone",
    label: "Phone",
    shape: "candidates",
    source: "phones",
    ask: "Which of these is the candidate's own contact phone number? Not a fax, an employer switchboard, or a number belonging to a reference.",
  },
  {
    id: "location",
    label: "Location",
    shape: "line",
    ask: "Which line of `pasted_text` states where the candidate currently lives (a city, region, or country in the contact header)? Not a former employer's or school's location.",
  },
  {
    id: "linkedin",
    label: "LinkedIn URL",
    shape: "candidates",
    source: "urls",
    ask: "Which of these URLs is the candidate's LinkedIn profile?",
  },
  {
    id: "website",
    label: "Portfolio / GitHub",
    shape: "candidates",
    source: "urls",
    ask: "Which of these URLs is the candidate's personal website, portfolio, or GitHub profile? Not LinkedIn and not an employer's site.",
  },
  {
    id: "current_title",
    label: "Current / most recent job title",
    shape: "line",
    ask: "Which line of `pasted_text` is the candidate's most recent job title (the role at their latest employer)? Not a company name and not an older role.",
  },
  {
    id: "current_company",
    label: "Current / most recent company",
    shape: "line",
    ask: "Which line of `pasted_text` names the candidate's most recent employer (the company of their latest role)? Not a school and not an earlier employer.",
  },
  {
    id: "seniority",
    label: "Seniority level",
    shape: "enum",
    options: {
      intern_or_student: "Internships, co-ops, or still studying with no full-time role",
      junior: "Entry-level or 0–2 years in the field; titles like Associate, Junior, Analyst I",
      mid: "Individual contributor with a few years' experience; plain titles like Engineer, Designer, Manager without Senior",
      senior: "Titles containing Senior, Lead, or equivalent; owns projects end to end",
      staff_or_principal: "Staff, Principal, Architect, Distinguished, or similar top individual-contributor titles",
      management: "Manages people: Engineering Manager, Director, Head of, VP",
      executive: "C-level, founder, or general manager of a business",
      not_stated: "The text gives no job titles or history to judge from",
    },
    ask: "Based on the candidate's most recent job title in `pasted_text`, what seniority level are they?",
  },
  {
    id: "highest_degree",
    label: "Highest degree",
    shape: "enum",
    options: {
      high_school: "High school diploma or equivalent only",
      associate: "Associate degree or two-year college program",
      bachelors: "Bachelor's degree: BA, BS, BSc, BEng, and similar",
      masters: "Master's degree: MA, MS, MSc, MBA, MEng, and similar",
      doctorate: "PhD, MD, JD, or other doctoral degree",
      bootcamp_or_certificate: "A bootcamp or professional certificate with no degree mentioned",
      not_stated: "No education is mentioned in the text",
    },
    ask: "What is the highest level of education the candidate has completed according to `pasted_text`?",
  },
  {
    id: "summary",
    label: "Professional summary",
    shape: "block",
    ask: "Which block of `pasted_text` is the candidate's professional summary, profile, or objective statement (a short paragraph describing who they are as a professional)? Not a job entry, not a skills list, and not contact details.",
  },
  {
    id: "skills",
    label: "Skills",
    shape: "block",
    ask: "Which block of `pasted_text` lists the candidate's skills, technologies, tools, or competencies? Not a job description that merely mentions tools.",
  },
  {
    id: "recent_role",
    label: "Most recent role — responsibilities & achievements",
    shape: "block",
    ask: "Which block of `pasted_text` describes the candidate's most recent job: its title, employer, dates, and the responsibilities or achievements under it? Not an older job and not the summary.",
  },
  {
    id: "education",
    label: "Education",
    shape: "block",
    ask: "Which block of `pasted_text` lists the candidate's education: schools, degrees, and graduation dates? Not certifications listed under a separate heading and not work experience.",
  },
  {
    id: "why_us",
    label: "Why do you want to work here?",
    shape: "block",
    ask: "Which block of `pasted_text` is written to THIS employer explaining why the candidate wants THIS specific job (a cover-letter style statement addressed to a company)? A general professional summary does NOT count.",
  },
];

export const FIELD_BY_ID = Object.fromEntries(FORM_FIELDS.map((f) => [f.id, f]));
