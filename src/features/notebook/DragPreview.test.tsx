import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { NodeRecord } from "../../domain/model";
import { DragPreview, type DragPreviewCanvasCard } from "./DragPreview";
import type { DragPreviewLayout } from "./dragPreviewLayout";

afterEach(cleanup);

function content(id: string, markdown: string, depth: number): NodeRecord & { depth: number } {
  return {
    id,
    kind: "content",
    parentId: null,
    sortKey: depth,
    markdown,
    dateKey: null,
    revision: 1,
    createdAt: depth,
    updatedAt: depth,
    deletedAt: null,
    depth,
  };
}

describe("DragPreview", () => {
  it("uses relative subtree depth and keeps Markdown live preview widgets", () => {
    const root = content("root", "**加粗** ![图片](https://example.com/image.png)", 2);
    const child = content("child", "~~删除线~~", 3);
    const { container } = render(
      <DragPreview
        items={[
          { node: root, relativeDepth: 0 },
          { node: child, relativeDepth: 1 },
        ]}
        layout={{
          width: 640,
          rows: new Map([
            ["root", { rowStyle: { paddingLeft: "72px" }, textStyle: {} }],
            ["child", { rowStyle: { paddingLeft: "100px" }, textStyle: {} }],
          ]),
        } satisfies DragPreviewLayout}
      />,
    );

    const rows = Array.from(container.querySelectorAll<HTMLElement>(".drag-preview-row"));
    expect(rows.map((row) => row.style.paddingLeft)).toEqual(["72px", "100px"]);
    expect(container.querySelector(".cm-live-bold")).not.toBeNull();
    expect(container.querySelector(".cm-live-hidden-mark")).not.toBeNull();
    expect(container.querySelector(".cm-live-image-preview img")).not.toBeNull();
  });

  it("keeps a Canvas node as a card grid instead of flattening its cards into outline rows", () => {
    const canvas = { ...content("canvas", "项目 Canvas", 1), supertagIds: ["canvas"] };
    const card = content("card", "**卡片内容**", 2);
    const cards: readonly DragPreviewCanvasCard[] = [{ node: card, childCount: 0 }];
    const { container } = render(
      <DragPreview
        items={[{ node: canvas, relativeDepth: 0 }]}
        layout={null}
        canvasCardsByNodeId={new Map([[canvas.id, cards]])}
      />,
    );

    expect(container.querySelectorAll(".drag-preview-row")).toHaveLength(1);
    expect(container.querySelectorAll(".drag-preview-canvas-card")).toHaveLength(1);
    expect(container.querySelector(".drag-preview-canvas .cm-live-bold")).not.toBeNull();
  });
});
