import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/routes/_authenticated/my.$operationId.messages.tsx"),
  "utf8",
);

describe("traveler message read visibility", () => {
  it("marks only published unread notices that become substantially visible", () => {
    expect(source).toContain('data-unread-message-id');
    expect(source).toContain('m.status === "published" && m.myFirstReadAt === null');
    expect(source).toContain("new IntersectionObserver");
    expect(source).toContain("entry.intersectionRatio < 0.6");
    expect(source).toContain("{ threshold: 0.6 }");
  });

  it("avoids duplicate read facts for the same visible notice", () => {
    expect(source).toContain("seen.current.has(messageId)");
    expect(source).toContain("seen.current.add(messageId)");
    expect(source).toContain("observer.unobserve(node)");
  });
});
