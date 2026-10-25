export const INTERESTS = [
  "School workshop",
  "Curriculum resources",
  "Business partnership",
  "Research collaboration",
  "Other",
] as const;

export interface EnquiryInput {
  name: string;
  email: string;
  phone: string | null;
  organisation: string | null;
  interest: (typeof INTERESTS)[number];
  message: string | null;
}

export type Validation =
  | { ok: true; value: EnquiryInput }
  | { ok: false; errors: Record<string, string> };

export const LIMITS = { name: 120, email: 254, phone: 40, organisation: 160, message: 4000 } as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// C0 and C1 control characters plus DEL, excluding tab, LF and CR which are handled separately.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const HAS_CONTROL = /[\u0000-\u001F\u007F-\u009F]/;

/** One line of text: control characters removed, all whitespace (including line breaks) collapsed to single spaces. */
function singleLine(value: string | undefined): string {
  return (value ?? "").replace(CONTROL, "").replace(/\s+/g, " ").trim();
}

/** Free text: line breaks kept and normalised to LF, other control characters removed, surrounding whitespace trimmed. */
function multiLine(value: string | undefined): string {
  return (value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function optional(value: string, max: number, field: string, errors: Record<string, string>): string | null {
  if (value.length > max) errors[field] = `Please keep this under ${max} characters.`;
  return value === "" ? null : value;
}

export function validateEnquiry(fields: Record<string, string>): Validation {
  const errors: Record<string, string> = {};
  const name = singleLine(fields.name);
  const rawEmail = singleLine(fields.email);
  const interest = singleLine(fields.interest);

  if (name === "") errors.name = "Please tell us your name.";
  else if (name.length > LIMITS.name) errors.name = `Please keep your name under ${LIMITS.name} characters.`;

  // An address is never repaired: control characters or whitespace inside it mean it is not an address.
  let email = rawEmail;
  if (rawEmail === "") errors.email = "Please enter your email address.";
  else if (HAS_CONTROL.test(fields.email ?? "") || rawEmail.length > LIMITS.email || !EMAIL.test(rawEmail))
    errors.email = "Please enter a valid email address.";
  else {
    const at = rawEmail.lastIndexOf("@");
    email = rawEmail.slice(0, at) + rawEmail.slice(at).toLowerCase();
  }

  if (!(INTERESTS as readonly string[]).includes(interest)) errors.interest = "Please choose what you are interested in.";

  const phone = optional(singleLine(fields.phone), LIMITS.phone, "phone", errors);
  const organisation = optional(singleLine(fields.organisation), LIMITS.organisation, "organisation", errors);
  const message = optional(multiLine(fields.message), LIMITS.message, "message", errors);

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { name, email, phone, organisation, interest: interest as EnquiryInput["interest"], message },
  };
}
