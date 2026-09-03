import { markdown } from "@codemirror/lang-markdown";
import { autocompletion } from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import { nodeMarkdownExtensions } from "./markdownLanguage";
import { markdownAtomicRanges, markdownLivePreview } from "./markdownDecorations";
import { nodeLinkCompletionSource, nodeLinkCompletionTrigger } from "./nodeLinkCompletion";
import { markdownEditorNodeId, markdownEditorSupertagApply, type SupertagApply } from "./markdownEditorContext";
import { supertagCompletionSource, supertagCompletionTrigger } from "./supertagCompletion";
import {
  markdownSourceMode,
  markdownSourceModeShortcut,
  resetMarkdownSourceModeOnBlur,
} from "./markdownPreviewState";

export function createMarkdownEditorExtensions(
  nodeId: string | null = null,
  options: { applySupertag?: SupertagApply } = {},
): Extension[] {
  return [
    markdownEditorNodeId.of(nodeId),
    markdownEditorSupertagApply.of(options.applySupertag ?? null),
    markdown({
      extensions: nodeMarkdownExtensions,
      addKeymap: false,
      completeHTMLTags: false,
      pasteURLAsLink: false,
    }),
    markdownSourceMode,
    markdownLivePreview,
    markdownAtomicRanges,
    resetMarkdownSourceModeOnBlur,
    markdownSourceModeShortcut,
    nodeLinkCompletionTrigger,
    supertagCompletionTrigger,
    autocompletion({ override: [nodeLinkCompletionSource, supertagCompletionSource], activateOnTyping: true }),
  ];
}
