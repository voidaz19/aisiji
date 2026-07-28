import type { Command } from "@codemirror/view";
import { markdownAtomsAt } from "./markdownDecorations";

function deleteRange(view: Parameters<Command>[0], from: number, to: number, userEvent: string): boolean {
  if (from === to) return false;
  view.dispatch({ changes: { from, to }, selection: { anchor: from }, userEvent });
  return true;
}

export const deleteVisibleBackward: Command = (view) => {
  const selection = view.state.selection.main;
  if (!selection.empty) return false;
  const atom = markdownAtomsAt(view, selection.head, "to").find((range) => range.from < range.to);
  if (!atom) return false;
  if (atom.kind === "component") {
    return deleteRange(view, atom.from, atom.to, "delete.backward");
  }
  const beforeAtom = view.moveByChar(selection, false);
  const previous = view.moveByChar(beforeAtom, false);
  return deleteRange(view, previous.head, beforeAtom.head, "delete.backward");
};

export const deleteVisibleForward: Command = (view) => {
  const selection = view.state.selection.main;
  if (!selection.empty) return false;
  const atom = markdownAtomsAt(view, selection.head, "from").find((range) => range.from < range.to);
  if (!atom) return false;
  if (atom.kind === "component") {
    return deleteRange(view, atom.from, atom.to, "delete.forward");
  }
  const afterAtom = view.moveByChar(selection, true);
  const next = view.moveByChar(afterAtom, true);
  return deleteRange(view, afterAtom.head, next.head, "delete.forward");
};

export const moveAcrossVisibleComponentBackward: Command = (view) => {
  const selection = view.state.selection.main;
  if (!selection.empty) return false;
  const component = markdownAtomsAt(view, selection.head, "to")
    .find((range) => range.kind === "component" && range.from < range.to);
  if (!component) return false;
  view.dispatch({ selection: { anchor: component.from }, scrollIntoView: true, userEvent: "select" });
  return true;
};

export const moveAcrossVisibleComponentForward: Command = (view) => {
  const selection = view.state.selection.main;
  if (!selection.empty) return false;
  const component = markdownAtomsAt(view, selection.head, "from")
    .find((range) => range.kind === "component" && range.from < range.to);
  if (!component) return false;
  view.dispatch({ selection: { anchor: component.to }, scrollIntoView: true, userEvent: "select" });
  return true;
};
