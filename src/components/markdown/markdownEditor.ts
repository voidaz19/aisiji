import { markdown } from "@codemirror/lang-markdown";
import { autocompletion } from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import { nodeMarkdownExtensions } from "./markdownLanguage";
import { markdownAtomicRanges, markdownLivePreview } from "./markdownDecorations";
import { nodeLinkCompletionSource, nodeLinkCompletionTrigger } from "./nodeLinkCompletion";
import {
  markdownSourceMode,
  markdownSourceModeShortcut,
  resetMarkdownSourceModeOnBlur,
} from "./markdownPreviewState";

export function createMarkdownEditorExtensions(): Extension[] {
  return [
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
