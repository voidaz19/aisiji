import { EditorView, WidgetType } from "@codemirror/view";
import {
  clickableExternalTarget,
  followMarkdownTarget,
  followNodeLink,
  resolveAttachment,
  resolveNodeLink,
} from "./markdownInteractions";

function preserveEditorFocus(element: HTMLElement, view: EditorView) {
  element.addEventListener("mousedown", (event) => {
    event.preventDefault();
    if (!view.hasFocus) view.focus();
  });
}

function escapeLinkLabel(value: string): string {
  return value.replace(/([\\\]])/g, "\\$1");
}

function escapeLinkTarget(value: string): string {
  return value.replace(/([\\)])/g, "\\$1");
}

export class ExternalLinkWidget extends WidgetType {
  private readonly cleanup = new WeakMap<HTMLElement, () => void>();

  constructor(
    private readonly label: string,
    private readonly rawTarget: string,
    private readonly target: string,
    private readonly from: number,
    private readonly to: number,
  ) {
    super();
  }

  eq(other: ExternalLinkWidget) {
    return this.label === other.label && this.rawTarget === other.rawTarget && this.target === other.target
      && this.from === other.from && this.to === other.to;
  }

  toDOM(view: EditorView) {
    const wrapper = document.createElement("span");
    wrapper.className = "cm-live-external-link";
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "cm-live-link";
    trigger.textContent = this.label;
    trigger.title = this.target;
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", "false");
    wrapper.append(trigger);

    const closeMenu = () => {
      wrapper.querySelector(".cm-live-link-menu")?.remove();
      trigger.setAttribute("aria-expanded", "false");
      wrapper.closest(".tree-row")?.classList.remove("has-link-menu");
    };
    const onDocumentMouseDown = (event: MouseEvent) => {
      if (!wrapper.contains(event.target as Node)) closeMenu();
    };
    document.addEventListener("mousedown", onDocumentMouseDown);
    this.cleanup.set(wrapper, () => document.removeEventListener("mousedown", onDocumentMouseDown));

    trigger.addEventListener("mousedown", (event) => event.preventDefault());
    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.ctrlKey || event.metaKey) {
        closeMenu();
        void followMarkdownTarget(this.target);
        return;
      }
      if (wrapper.querySelector(".cm-live-link-menu")) {
        closeMenu();
      } else {
        wrapper.append(this.createMenu(view, closeMenu));
        trigger.setAttribute("aria-expanded", "true");
        wrapper.closest(".tree-row")?.classList.add("has-link-menu");
      }
    });
    return wrapper;
  }

  private createMenu(view: EditorView, closeMenu: () => void): HTMLElement {
    const menu = document.createElement("span");
    menu.className = "cm-live-link-menu";
    menu.setAttribute("role", "menu");
    menu.addEventListener("mousedown", (event) => event.stopPropagation());
    menu.addEventListener("click", (event) => event.stopPropagation());

    const open = document.createElement("button");
    open.type = "button";
    open.className = "cm-live-link-menu-item";
    open.textContent = "打开";
    open.setAttribute("role", "menuitem");
    open.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      void followMarkdownTarget(this.target);
    });

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "cm-live-link-menu-item";
    edit.textContent = "修改";
    edit.setAttribute("role", "menuitem");
    edit.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      menu.replaceChildren(this.createEditForm(view, closeMenu));
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "cm-live-link-menu-item";
    remove.textContent = "删除";
    remove.setAttribute("role", "menuitem");
    remove.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      view.dispatch({
        changes: { from: this.from, to: this.to },
        selection: { anchor: this.from },
        userEvent: "delete",
      });
      view.focus();
    });

    menu.append(open, edit, remove);
    return menu;
  }

  private createEditForm(view: EditorView, closeMenu: () => void): HTMLElement {
    const form = document.createElement("form");
    form.className = "cm-live-link-form";
    form.setAttribute("aria-label", "修改链接");

    const labelText = document.createElement("label");
    labelText.textContent = "标题";
    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.value = this.label;
    labelText.append(labelInput);

    const targetText = document.createElement("label");
    targetText.textContent = "地址";
    const targetInput = document.createElement("input");
    targetInput.type = "text";
    targetInput.value = this.rawTarget;
    targetText.append(targetInput);

    const error = document.createElement("span");
    error.className = "cm-live-link-form-error";
    error.setAttribute("role", "alert");

    const actions = document.createElement("span");
    actions.className = "cm-live-link-form-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "取消";
    cancel.addEventListener("click", (event) => { event.stopPropagation(); closeMenu(); view.focus(); });
    const save = document.createElement("button");
    save.type = "submit";
    save.className = "is-primary";
    save.textContent = "保存";
    actions.append(cancel, save);

    form.addEventListener("mousedown", (event) => event.stopPropagation());
    form.addEventListener("click", (event) => event.stopPropagation());
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const nextLabel = labelInput.value.trim();
      const nextTarget = targetInput.value.trim();
      if (!nextLabel) {
        error.textContent = "标题不能为空";
        labelInput.setAttribute("aria-invalid", "true");
        labelInput.focus();
        return;
      }
      if (!clickableExternalTarget(nextTarget)) {
        error.textContent = "请输入有效的网页或邮件地址";
        targetInput.setAttribute("aria-invalid", "true");
        targetInput.focus();
        return;
      }
      view.dispatch({
        changes: { from: this.from, to: this.to, insert: `[${escapeLinkLabel(nextLabel)}](${escapeLinkTarget(nextTarget)})` },
        userEvent: "input",
      });
      view.focus();
    });

    form.append(labelText, targetText, error, actions);
    queueMicrotask(() => labelInput.focus());
    return form;
  }

  destroy(dom: HTMLElement) {
    dom.closest(".tree-row")?.classList.remove("has-link-menu");
    this.cleanup.get(dom)?.();
    this.cleanup.delete(dom);
  }

  ignoreEvent() {
    return true;
  }
}

export class NodeLinkWidget extends WidgetType {
  constructor(private readonly target: string, private readonly label: string, private readonly available: boolean) {
    super();
  }

  eq(other: NodeLinkWidget) {
    return this.target === other.target && this.label === other.label && this.available === other.available;
  }

  toDOM(view: EditorView) {
    const element = document.createElement(this.available ? "button" : "span");
    element.className = `cm-live-node-link${this.available ? "" : " is-missing"}`;
    element.textContent = this.label;
    element.setAttribute("title", this.available ? `打开节点：${this.label}` : `节点不存在：${this.target}`);
    if (element instanceof HTMLButtonElement) {
      element.type = "button";
      preserveEditorFocus(element, view);
      element.addEventListener("mouseenter", () => {
        const current = resolveNodeLink(this.target);
        element.textContent = current.label;
        element.title = current.available ? `打开节点：${current.label}` : `节点不存在：${this.target}`;
      });
      element.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        followNodeLink(this.target);
      });
    }
    return element;
  }

  ignoreEvent() {
    return false;
  }
}

export class AttachmentWidget extends WidgetType {
  constructor(private readonly target: string, private readonly label: string, private readonly available: boolean) {
    super();
  }

  eq(other: AttachmentWidget) {
    return this.target === other.target && this.label === other.label && this.available === other.available;
  }

  toDOM(view: EditorView) {
    const element = document.createElement(this.available ? "button" : "span");
    element.className = `cm-live-attachment${this.available ? "" : " is-missing"}`;
    element.textContent = this.label;
    element.setAttribute("title", this.available ? `打开附件：${this.label}` : `附件不可用：${this.label}`);
    if (element instanceof HTMLButtonElement) {
      element.type = "button";
      preserveEditorFocus(element, view);
      element.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void followMarkdownTarget(this.target);
      });
    }
    return element;
  }

  ignoreEvent() {
    return false;
  }
}

export class ImageWidget extends WidgetType {
  constructor(
    private readonly target: string,
    private readonly alt: string,
    private readonly source: string | null,
  ) {
    super();
  }

  eq(other: ImageWidget) {
    return this.target === other.target && this.alt === other.alt && this.source === other.source;
  }

  toDOM(view: EditorView) {
    const element = document.createElement(this.source ? "button" : "span");
    element.className = `cm-live-image-preview${this.source ? "" : " is-missing"}`;
    if (this.source) {
      const image = document.createElement("img");
      image.src = this.source;
      image.alt = this.alt;
      image.loading = "lazy";
      image.addEventListener("error", () => element.classList.add("is-error"));
      element.append(image);
    } else {
      element.textContent = this.alt || "图片不可用";
    }
    if (this.alt && this.source) {
      const caption = document.createElement("span");
      caption.className = "cm-live-image-caption";
      caption.textContent = this.alt;
      element.append(caption);
    }
    element.setAttribute("title", this.source ? `打开图片：${this.alt || this.target}` : `图片不可用：${this.alt || this.target}`);
    if (element instanceof HTMLButtonElement) {
      element.type = "button";
      preserveEditorFocus(element, view);
      element.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void followMarkdownTarget(this.target);
      });
    }
    return element;
  }

  ignoreEvent() {
    return false;
  }
}

export function attachmentWidget(target: string, fallbackLabel: string): AttachmentWidget | null {
  const attachment = resolveAttachment(target, fallbackLabel);
  return attachment ? new AttachmentWidget(target, attachment.label, attachment.available) : null;
}
