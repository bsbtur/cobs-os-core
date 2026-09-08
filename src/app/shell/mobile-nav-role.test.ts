import { describe, expect, test } from "bun:test";

import { mobilePrimaryIdsForRole } from "./mobile-nav-role";

describe("mobile navigation role matrix", () => {
  test("owner and admin prioritize command, operations and commerce", () => {
    expect(mobilePrimaryIdsForRole("owner")).toEqual(["overview", "operations", "commerce"]);
    expect(mobilePrimaryIdsForRole("admin")).toEqual(["overview", "operations", "commerce"]);
  });

  test("operations_agent prioritizes operations, people and inbox", () => {
    expect(mobilePrimaryIdsForRole("operations_agent")).toEqual(["operations", "people", "inbox"]);
  });

  test("member and unresolved roles preserve the neutral V1 defaults", () => {
    expect(mobilePrimaryIdsForRole("member")).toEqual(["overview", "operations", "people"]);
    expect(mobilePrimaryIdsForRole(null)).toEqual(["overview", "operations", "people"]);
  });
});
