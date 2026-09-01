import { ROOT_ID, type NotebookState } from "./model";
import { createNode } from "./tree";

export const DEBUG_SAMPLE_PREFIX = "debug-sample-";

export interface DebugSampleResult {
  state: NotebookState;
  createdNodeIds: string[];
  rootId: string;
}

/** Returns whether a persisted node belongs to the generated debug workspace. */
export function isDebugSampleNode(nodeId: string): boolean {
  return nodeId.startsWith(DEBUG_SAMPLE_PREFIX);
}

export function hasDebugSamples(state: Pick<NotebookState, "nodes">): boolean {
  return Object.keys(state.nodes).some(isDebugSampleNode);
}

/**
 * Builds one deterministic set of notes for interaction and Markdown testing.
 * The fixed IDs make the action idempotent and keep the generated workspace
 * easy to target from browser tests and bug reports.
 */
export function createDebugSamples(state: NotebookState, now = Date.now()): DebugSampleResult {
  if (hasDebugSamples(state)) return { state, createdNodeIds: [], rootId: `${DEBUG_SAMPLE_PREFIX}overview` };

  let next = state;
  const createdNodeIds: string[] = [];
  const add = (parentId: string, id: string, markdown: string, afterId?: string) => {
    const result = createNode(next, parentId, markdown, "content", null, afterId, { nodeId: id, now });
    next = result.state;
    createdNodeIds.push(id);
    return result.node.id;
  };

  const overviewId = add(
    ROOT_ID,
    `${DEBUG_SAMPLE_PREFIX}overview`,
    "# 调试样例总览\n用于节点选择、拖拽、层级、折叠和 Markdown 预览测试。",
  );
  const selectionId = add(overviewId, `${DEBUG_SAMPLE_PREFIX}selection`, "节点选择与拖拽测试");
  for (let index = 1; index <= 48; index += 1) {
    add(selectionId, `${DEBUG_SAMPLE_PREFIX}selection-${String(index).padStart(2, "0")}`, `选择测试节点 ${index}`);
  }

  const hierarchyId = add(overviewId, `${DEBUG_SAMPLE_PREFIX}hierarchy`, "层级与折叠测试");
  const projectId = add(hierarchyId, `${DEBUG_SAMPLE_PREFIX}project`, "项目节点");
  const phaseId = add(projectId, `${DEBUG_SAMPLE_PREFIX}phase`, "阶段节点");
  add(phaseId, `${DEBUG_SAMPLE_PREFIX}task-01`, "任务节点 01");
  add(phaseId, `${DEBUG_SAMPLE_PREFIX}task-02`, "任务节点 02");
  add(projectId, `${DEBUG_SAMPLE_PREFIX}milestone`, "里程碑节点");
  add(hierarchyId, `${DEBUG_SAMPLE_PREFIX}sibling`, "层级测试同级节点");

  add(
    overviewId,
    `${DEBUG_SAMPLE_PREFIX}markdown`,
    "## Markdown 预览测试\n\n- [ ] 待办项目\n- **粗体**、*斜体*、~~删除线~~、`行内代码`\n\n> 引用文本\n\n[普通链接](https://example.com)",
  );
  add(overviewId, `${DEBUG_SAMPLE_PREFIX}long-markdown`, createLongMarkdown());

  return { state: next, createdNodeIds, rootId: overviewId };
}

function createLongMarkdown(targetBytes = 100_000): string {
  const lines = ["# 长 Markdown 调试样例"];
  let bytes = new TextEncoder().encode(lines[0]).byteLength;
  let lineIndex = 1;
  while (bytes < targetBytes) {
    const line = `\n- [ ] line ${lineIndex} with **bold**, [link](https://example.com/${lineIndex}) and \`sample-${lineIndex}\``;
    const lineBytes = new TextEncoder().encode(line).byteLength;
    if (bytes + lineBytes > targetBytes) break;
    lines.push(line);
    bytes += lineBytes;
    lineIndex += 1;
  }
  lines.push("x".repeat(targetBytes - bytes));
  return lines.join("");
}
