import { describe, expect, it } from "vitest";
import { createEmptyState } from "./model";
import { createNode } from "./tree";
import { addSupertag, CANVAS_SUPERTAG_ID, hasSupertag, removeSupertag } from "./supertags";

describe("supertags", () => {
  it("attaches Canvas without changing the node kind or tree position", () => {
    const created = createNode(createEmptyState(), "root", "project", "content", null, undefined, { nodeId: "project", now: 1 });
    const tagged = addSupertag(created.state, "project", CANVAS_SUPERTAG_ID, 2);

    expect(tagged.nodes.project.kind).toBe("content");
    expect(tagged.nodes.project.parentId).toBe("root");
    expect(hasSupertag(tagged, "project", CANVAS_SUPERTAG_ID)).toBe(true);
    expect(addSupertag(tagged, "project", CANVAS_SUPERTAG_ID)).toBe(tagged);
  });

  it("removes only the requested supertag", () => {
    const created = createNode(createEmptyState(), "root", "project", "content", null, undefined, { nodeId: "project", now: 1 });
    const tagged = addSupertag(created.state, "project", CANVAS_SUPERTAG_ID, 2);
    const untagged = removeSupertag(tagged, "project", CANVAS_SUPERTAG_ID, 3);

    expect(hasSupertag(untagged, "project", CANVAS_SUPERTAG_ID)).toBe(false);
    expect(untagged.nodes.project.markdown).toBe("project");
  });
});
