import { describe, expect, it } from "vitest";
import { validateEnquiry } from "../src/validate";

const base = {
  name: "Jane Teacher",
  email: "jane@example-school.sch.uk",
  phone: "0115 000 0000",
  organisation: "Example Primary School",
  interest: "School workshop",
  message: "Hello",
};

function valid(fields: Record<string, string>) {
  const result = validateEnquiry(fields);
  if (!result.ok) throw new Error(`expected valid, got ${JSON.stringify(result.errors)}`);
  return result.value;
}

describe("single-line fields", () => {
  it("collapses line breaks and runs of whitespace in the name", () => {
    expect(valid({ ...base, name: "Jane\r\n  Teacher\tSmith" }).name).toBe("Jane Teacher Smith");
  });

  it("strips control characters from name, phone and organisation", () => {
    const v = valid({ ...base, name: "Jane\u0000Teacher", phone: "0115\u0007 000", organisation: "Ex\u001bample" });
    expect(v.name).toBe("JaneTeacher");
    expect(v.phone).toBe("0115 000");
    expect(v.organisation).toBe("Example");
  });

  it("measures length after cleaning", () => {
    expect(valid({ ...base, name: `${"a".repeat(118)}\n\n\n\n\nb` }).name).toHaveLength(120);
    expect(validateEnquiry({ ...base, name: "a".repeat(121) }).ok).toBe(false);
  });
});

describe("message", () => {
  it("keeps line breaks but normalises them and drops other control characters", () => {
    expect(valid({ ...base, message: "First\r\nSecond\rThird\u0000\u0007 end" }).message).toBe("First\nSecond\nThird end");
  });

  it("trims leading and trailing blank lines", () => {
    expect(valid({ ...base, message: "\n\n  Hello  \n\n" }).message).toBe("Hello");
  });

  it("stores null for an empty message", () => {
    expect(valid({ ...base, message: "   \n " }).message).toBeNull();
  });
});

describe("email", () => {
  it("lower-cases the domain part only", () => {
    expect(valid({ ...base, email: "Jane.Teacher@Example-School.SCH.UK" }).email).toBe("Jane.Teacher@example-school.sch.uk");
  });

  it("rejects addresses with spaces or control characters", () => {
    expect(validateEnquiry({ ...base, email: "jane @example.org" }).ok).toBe(false);
    expect(validateEnquiry({ ...base, email: "jane@exam\u0000ple.org" }).ok).toBe(false);
  });
});
