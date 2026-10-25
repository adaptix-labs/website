import { createExecutionContext, createScheduledController, env, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import worker from "../src/index";
import { clearRows } from "./helpers";

beforeEach(clearRows);

async function insertAgedRow(id: string, daysAgo: number): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO enquiries (id, created_at, name, email, interest)
     VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?), 'Someone', 'someone@example.org', 'Other')`,
  )
    .bind(id, `-${daysAgo} days`)
    .run();
}

describe("scheduled retention", () => {
  it("deletes enquiries older than the retention period and keeps the rest", async () => {
    await insertAgedRow("old", 400);
    await insertAgedRow("edge", 364);
    await insertAgedRow("recent", 3);

    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController({ cron: "0 3 * * *" }), env, ctx);
    await waitOnExecutionContext(ctx);

    const remaining = await env.DB.prepare("SELECT id FROM enquiries ORDER BY id").all<{ id: string }>();
    expect(remaining.results.map((r) => r.id)).toEqual(["edge", "recent"]);
  });
});
