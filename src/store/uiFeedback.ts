import { childrenOf } from "../domain/tree";
import type { NotebookState } from "../domain/model";

export function shakeNodeTree(state: NotebookState, nodeId: string): void {
  if (typeof document === "undefined") return;
  const targetIds: string[] = [nodeId];
  const collect = (id: string) => {
    for (const child of childrenOf(state, id)) {
      targetIds.push(child.id);
      collect(child.id);
    }
  };
  collect(nodeId);

  for (const id of targetIds) {
    const elements = document.querySelectorAll<Element>(
      `[data-node-id="${id}"], [data-hierarchy-node-id="${id}"]`,
    );
    for (const element of elements) {
      element.classList.remove("is-shaking");
      void element.getBoundingClientRect().width;
      element.classList.add("is-shaking");
      setTimeout(() => element.classList.remove("is-shaking"), 220);
    }
  }
}
