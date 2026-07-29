import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NodeRecord } from "../../domain/model";
import { TopBar } from "./TopBar";

vi.mock("./WindowControls", () => ({ WindowControls: () => null }));

afterEach(cleanup);

function contentNode(id: string, markdown: string): NodeRecord {
  return {
    id,
    kind: "content",
    parentId: null,
    sortKey: 0,
    markdown,
    dateKey: null,
    deletedAt: null,
    revision: 1,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("TopBar breadcrumbs", () => {
  it("collapses older ancestors and keeps the two nearest ancestors visible", () => {
    const onOpenRoot = vi.fn();
    const parents = [
      contentNode("first", "第一个很长的层级"),
      contentNode("second", "第二个很长的层级"),
      contentNode("third", "倒数第二级"),
      contentNode("fourth", "最近一级"),
    ];

    render(
      <TopBar
        view="outline"
        activeRoot={contentNode("current", "当前节点")}
        parentBreadcrumbs={parents}
        atViewRoot={false}
        canGoBack={false}
        canGoForward={false}
        onToggleSidebar={vi.fn()}
        onGoBack={vi.fn()}
        onGoForward={vi.fn()}
        onNavigate={vi.fn()}
        onOpenRoot={onOpenRoot}
        onOpenViewRoot={vi.fn()}
      />,
    );

    expect(screen.queryByText("第一个很长的层级")).toBeNull();
    expect(screen.queryByText("第二个很长的层级")).toBeNull();
    expect(screen.getByRole("button", { name: "打开上级节点：第二个很长的层级" }).getAttribute("title"))
      .toBe("第一个很长的层级 / 第二个很长的层级");
    expect(screen.getByRole("button", { name: "倒数第二级" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "最近一级" })).not.toBeNull();
    expect(screen.getByText("当前节点").getAttribute("title")).toBe("当前节点");

    fireEvent.click(screen.getByRole("button", { name: "打开上级节点：第二个很长的层级" }));
    expect(onOpenRoot).toHaveBeenCalledWith("second");
  });

  it("exposes backward and forward navigation with disabled states", () => {
    const onGoBack = vi.fn();
    render(
      <TopBar
        view="settings"
        activeRoot={null}
        parentBreadcrumbs={[]}
        atViewRoot
        canGoBack
        canGoForward={false}
        onToggleSidebar={vi.fn()}
        onGoBack={onGoBack}
        onGoForward={vi.fn()}
        onNavigate={vi.fn()}
        onOpenRoot={vi.fn()}
        onOpenViewRoot={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "后退" }));
    expect(onGoBack).toHaveBeenCalledOnce();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "前进" }).disabled).toBe(true);
  });
});
