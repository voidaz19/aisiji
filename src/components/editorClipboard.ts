export interface MultilinePastePlan {
  currentMarkdown: string;
  followingMarkdown: string[];
}

/**
 * Converts a multiline paste into the current node plus ordered following nodes.
 * Text outside the active selection is preserved on the first and last lines.
 */
export function planMultilinePaste(
  markdown: string,
  selectionFrom: number,
  selectionTo: number,
  pastedText: string,
): MultilinePastePlan | null {
  const normalized = pastedText.replace(/\r\n?/g, "\n");
  if (!normalized.includes("\n")) return null;

  const from = Math.max(0, Math.min(selectionFrom, markdown.length));
  const to = Math.max(from, Math.min(selectionTo, markdown.length));
  const lines = normalized.split("\n");
  const prefix = markdown.slice(0, from);
  const suffix = markdown.slice(to);

  return {
    currentMarkdown: prefix + lines[0],
    followingMarkdown: lines.slice(1).map((line, index, following) =>
      index === following.length - 1 ? line + suffix : line,
    ),
  };
}
