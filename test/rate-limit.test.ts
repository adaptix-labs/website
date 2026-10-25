import { beforeEach, describe, expect, it } from "vitest";
import { clearRows, countRows, postEnquiry, validFields } from "./helpers";

beforeEach(clearRows);

describe("rate limiting", () => {
  it("refuses a sixth enquiry from the same address within an hour", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await postEnquiry(validFields, undefined, { ip: "198.51.100.7" });
      expect(res.status).toBe(200);
    }
    const sixth = await postEnquiry(validFields, undefined, { ip: "198.51.100.7" });
    expect(sixth.status).toBe(429);
    expect(((await sixth.json()) as { ok: boolean }).ok).toBe(false);
    expect(await countRows()).toBe(5);
  });

  it("still accepts enquiries from other addresses", async () => {
    for (let i = 0; i < 5; i++) await postEnquiry(validFields, undefined, { ip: "198.51.100.7" });
    const other = await postEnquiry(validFields, undefined, { ip: "198.51.100.8" });
    expect(other.status).toBe(200);
    expect(await countRows()).toBe(6);
  });
});
