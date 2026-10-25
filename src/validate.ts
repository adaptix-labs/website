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

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value: string | undefined): string {
  return (value ?? "").trim();
}

function optional(value: string, max: number, label: string, errors: Record<string, string>): string | null {
  if (value.length > max) errors[label] = `Please keep this under ${max} characters.`;
  return value === "" ? null : value;
}

export function validateEnquiry(fields: Record<string, string>): Validation {
  const errors: Record<string, string> = {};
  const name = clean(fields.name);
  const email = clean(fields.email);
  const interest = clean(fields.interest);

  if (name === "") errors.name = "Please tell us your name.";
  else if (name.length > 120) errors.name = "Please keep your name under 120 characters.";

  if (email === "") errors.email = "Please enter your email address.";
  else if (email.length > 254 || !EMAIL.test(email)) errors.email = "Please enter a valid email address.";

  if (!(INTERESTS as readonly string[]).includes(interest)) errors.interest = "Please choose what you are interested in.";

  const phone = optional(clean(fields.phone), 40, "phone", errors);
  const organisation = optional(clean(fields.organisation), 160, "organisation", errors);
  const message = optional(clean(fields.message), 4000, "message", errors);

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { name, email, phone, organisation, interest: interest as EnquiryInput["interest"], message },
  };
}
