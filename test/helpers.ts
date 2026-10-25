import { env, SELF } from "cloudflare:test";
import { handleEnquiry, type Outbound } from "../src/enquiry";

export const ORIGIN = "https://adaptix.uk";

export const validFields = {
  name: "Jane Teacher",
  email: "jane@example-school.sch.uk",
  phone: "0115 000 0000",
  organisation: "Example Primary School",
  interest: "School workshop",
  message: "We would like a Year 5 workshop in the spring term.",
  "cf-turnstile-response": "turnstile-token",
};

export function enquiryRequest(
  fields: Record<string, string>,
  init: { headers?: Record<string, string>; ip?: string } = {},
): Request {
  return new Request(`${ORIGIN}/api/enquiry`, {
    method: "POST",
    headers: {
      origin: ORIGIN,
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
      "cf-connecting-ip": init.ip ?? "203.0.113.10",
      ...init.headers,
    },
    body: new URLSearchParams(fields).toString(),
  });
}

/** Posts through the whole Worker (routing, headers). No outbound calls are mocked. */
export function postViaWorker(fields: Record<string, string>, init?: Parameters<typeof enquiryRequest>[1]): Promise<Response> {
  return SELF.fetch(enquiryRequest(fields, init));
}

export interface FakeOutbound {
  fetch: Outbound;
  turnstileCalls: URLSearchParams[];
  resendCalls: Array<Record<string, unknown>>;
}

/** A stand-in for fetch that answers Turnstile and Resend without touching the network. */
export function fakeOutbound(opts: { turnstile?: boolean; resendStatus?: number } = {}): FakeOutbound {
  const turnstileCalls: URLSearchParams[] = [];
  const resendCalls: Array<Record<string, unknown>> = [];
  const fetch: Outbound = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const body = typeof init?.body === "string" ? init.body : "";
    if (url === "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
      turnstileCalls.push(new URLSearchParams(body));
      return Response.json({ success: opts.turnstile ?? true });
    }
    if (url === "https://api.resend.com/emails") {
      resendCalls.push(JSON.parse(body) as Record<string, unknown>);
      const status = opts.resendStatus ?? 200;
      return Response.json(status === 200 ? { id: "email_123" } : { message: "boom" }, { status });
    }
    throw new Error(`Unexpected outbound request: ${url}`);
  };
  return { fetch, turnstileCalls, resendCalls };
}

/** Calls the enquiry handler directly with a fake outbound fetch and the real test database. */
export function postEnquiry(
  fields: Record<string, string>,
  outbound: FakeOutbound = fakeOutbound(),
  init?: Parameters<typeof enquiryRequest>[1],
): Promise<Response> {
  return handleEnquiry(enquiryRequest(fields, init), env, outbound.fetch);
}

export async function countRows(): Promise<number> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM enquiries").first<{ n: number }>();
  return row?.n ?? 0;
}

export async function clearRows(): Promise<void> {
  await env.DB.prepare("DELETE FROM enquiries").run();
}
