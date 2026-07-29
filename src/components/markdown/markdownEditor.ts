import { markdown } from "@codemirror/lang-markdown";
import { autocompletion } from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import { nodeMarkdownExtensions } from "./markdownLanguage";
import { markdownAtomicRanges, markdownLivePreview } from "./markdownDecorations";
import { nodeLinkCompletionSource, nodeLinkCompletionTrigger } from "./nodeLinkCompletion";
import { markdownEditorNodeId } from "./markdownEditorContext";
import {
  markdownSourceMode,
  markdownSourceModeShortcut,
  resetMarkdownSourceModeOnBlur,
} from "./markdownPreviewState";

export function createMarkdownEditorExtensions(nodeId: string | null = null): Extension[] {
  return [
    markdownEditorNodeId.of(nodeId),
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
    autocompletion({ override: [nodeLinkCompletionSource], activateOnTyping: true }),
  ];
}
