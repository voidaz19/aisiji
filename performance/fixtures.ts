import { ROOT_ID, type NodeRecord, type NotebookState } from "../src/domain/model";

const CREATED_AT = Date.UTC(2026, 0, 1);

function createNode(id: string, parentId: string, sortKey: number, markdown: string): NodeRecord {
  return {
    id,
    kind: "content",
    parentId,
    sortKey,
    markdown,
    dateKey: null,
    deletedAt: null,
    revision: 1,
    createdAt: CREATED_AT + sortKey,
    updatedAt: CREATED_AT + sortKey,
  };
}

function emptyWorkspace(): NotebookState {
  return {
    nodes: {
      [ROOT_ID]: {
        id: ROOT_ID,
        kind: "root",
        parentId: null,
        sortKey: 0,
        markdown: "",
        dateKey: null,
        deletedAt: null,
        revision: 1,
        createdAt: 0,
        updatedAt: 0,
      },
    },
    fields: {},
    attachments: {},
    collapsed: {},
    recentPageEdits: {},
  };
}

export function createWideWorkspace(nodeCount: number): NotebookState {
  const workspace = emptyWorkspace();
  for (let index = 0; index < nodeCount; index += 1) {
    const id = `perf-node-${String(index).padStart(6, "0")}`;
    const searchable = index % 10 === 0 ? " performance-needle" : "";
    workspace.nodes[id] = createNode(id, ROOT_ID, (index + 1) * 1_000, `性能节点 ${index}${searchable}`);
  }
  return workspace;
}

export function createExpandableWorkspace(childCount: number): NotebookState {
  const workspace = emptyWorkspace();
  const parentId = "perf-parent";
  workspace.nodes[parentId] = createNode(parentId, ROOT_ID, 1_000, "可展开的性能测试父节点");
  workspace.collapsed[parentId] = true;
  for (let index = 0; index < childCount; index += 1) {
    const id = `perf-child-${String(index).padStart(6, "0")}`;
    workspace.nodes[id] = createNode(id, parentId, (index + 1) * 1_000, `展开子节点 ${index}`);
  }
  return workspace;
}

export function createLongMarkdownWorkspace(targetBytes = 100_000): NotebookState {
  const workspace = emptyWorkspace();
  const encoder = new TextEncoder();
  const parts: string[] = ["# 长 Markdown 性能基准"];
  let markdownBytes = encoder.encode(parts[0]).byteLength;
  let lineIndex = 1;
  while (markdownBytes < targetBytes) {
    const line = `\n- [ ] line ${lineIndex} with **bold**, [link](https://example.com/${lineIndex}) and \`sample-${lineIndex}\``;
    const lineBytes = encoder.encode(line).byteLength;
    if (markdownBytes + lineBytes > targetBytes) break;
    parts.push(line);
    markdownBytes += lineBytes;
    lineIndex += 1;
  }
  parts.push("x".repeat(targetBytes - markdownBytes));
  workspace.nodes["perf-long-markdown"] = createNode(
    "perf-long-markdown",
    ROOT_ID,
    1_000,
    parts.join(""),
  );
  return workspace;
}

export function createCombinedStressWorkspace(nodeCount = 10_000, markdownBytes = 100_000): NotebookState {
  const workspace = createWideWorkspace(nodeCount);
  const longMarkdown = createLongMarkdownWorkspace(markdownBytes).nodes["perf-long-markdown"];
  const target = workspace.nodes["perf-node-000000"];
  workspace.nodes[target.id] = {
    ...longMarkdown,
    id: target.id,
    parentId: target.parentId,
    sortKey: target.sortKey,
    createdAt: target.createdAt,
    updatedAt: target.updatedAt,
  };
  return workspace;
}
