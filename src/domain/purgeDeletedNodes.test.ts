import { describe, expect, it } from "vitest";
import { createSeedState, createNode, deleteSubtree } from "./tree";
import { purgeDeletedNodes } from "./purgeDeletedNodes";

describe("purgeDeletedNodes", () => {
  it("removes deleted nodes and their fields, attachments, and collapsed state", () => {
    let state = createSeedState("2026-07-28");
    const parent = Object.values(state.nodes).find((node) => node.kind === "content")!;
    const child = createNode(state, parent.id, "child");
    state = deleteSubtree(child.state, parent.id, 100);
    state.fields.field = { id: "field", nodeId: child.node.id, key: "status", type: "text", value: "done", updatedAt: 1 };
    state.attachments.attachment = { id: "attachment", nodeId: parent.id, name: "a.txt", mime: "text/plain", size: 1, sha256: "hash", localPath: null, remotePath: "remote", pinned: false, createdAt: 1 };
    state.collapsed[parent.id] = true;

    const result = purgeDeletedNodes(state);

    expect(result.purgedNodeIds).toEqual(expect.arrayContaining([parent.id, child.node.id]));
    expect(result.purgedAttachmentIds).toEqual(["attachment"]);
    expect(result.state.nodes[parent.id]).toBeUndefined();
    expect(result.state.nodes[child.node.id]).toBeUndefined();
    expect(result.state.fields.field).toBeUndefined();
    expect(result.state.attachments.attachment).toBeUndefined();
    expect(result.state.collapsed[parent.id]).toBeUndefined();
  });

  it("returns the original state when the trash is empty", () => {
    const state = createSeedState("2026-07-28");
    expect(purgeDeletedNodes(state).state).toBe(state);
  });

  it("keeps an attachment referenced by an active node and transfers its ownership", () => {
    let state = createSeedState("2026-07-28");
    const deletedOwner = Object.values(state.nodes).find((node) => node.kind === "content")!;
    const activeReferrer = createNode(state, deletedOwner.parentId!, "kept ![file](attachment://shared)");
    state = deleteSubtree(activeReferrer.state, deletedOwner.id, 100);
    state.attachments.shared = { id: "shared", nodeId: deletedOwner.id, name: "shared.png", mime: "image/png", size: 1, sha256: "hash", localPath: "path", remotePath: "remote", pinned: false, createdAt: 1 };

    const result = purgeDeletedNodes(state);

    expect(result.purgedAttachmentIds).toEqual([]);
    expect(result.state.attachments.shared.nodeId).toBe(activeReferrer.node.id);
  });
});
