import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/routes/_authenticated/my.$operationId.index.tsx"),
  "utf8",
);

describe("traveler home notice summary", () => {
  it("derives unread and fallback summary from published notices only", () => {
    expect(source).toContain('const publishedMessages = (messages.data ?? []).filter((m) => m.status === "published")');
    expect(source).toContain("const unread = publishedMessages.filter((m) => m.myFirstReadAt === null).length");
    expect(source).toContain("const latestPublishedMessage = publishedMessages[0] ?? null");
    expect(source).toContain('latestPublishedMessage?.title ?? t("w10.messages.empty")');
  });
});
