import { Prec, StateEffect, StateField, type StateCommand } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export const setMarkdownSourceMode = StateEffect.define<boolean>();

export const markdownSourceMode = StateField.define<boolean>({
  create: () => false,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setMarkdownSourceMode)) value = effect.value;
    }
    return value;
  },
});

export const toggleMarkdownSourceMode: StateCommand = ({ state, dispatch }) => {
  dispatch(state.update({ effects: setMarkdownSourceMode.of(!state.field(markdownSourceMode)) }));
  return true;
};

export const resetMarkdownSourceModeOnBlur = EditorView.domEventHandlers({
  blur: (_event, view) => {
    if (view.state.field(markdownSourceMode)) {
      view.dispatch({ effects: setMarkdownSourceMode.of(false) });
    }
    return false;
  },
});

export const markdownSourceModeShortcut = Prec.high(EditorView.domEventHandlers({
  keydown: (event, view) => {
    if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.altKey
      || event.key.toLowerCase() !== "m") return false;
    event.preventDefault();
    return toggleMarkdownSourceMode(view);
  },
}));
