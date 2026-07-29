import { createElement as createLucideElement, Braces, ChevronRight, Earth, FileText, Film, Image, Music } from "lucide";
import { EditorView, WidgetType } from "@codemirror/view";
import { attachmentPreviewKind, MAX_TEXT_PREVIEW_SIZE } from "./attachmentPreview";
import { isAttachmentPreviewCollapsed, setAttachmentPreviewCollapsed } from "./attachmentPreviewPreferences";
import {
  clickableExternalTarget,
  followMarkdownTarget,
  followNodeLink,
  resolveAttachment,
  resolveNodeLink,
  websiteFaviconUrl,
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

function createInlineIcon(iconNode: Parameters<typeof createLucideElement>[0], className: string): HTMLSpanElement {
  const icon = document.createElement("span");
  icon.className = className;
  icon.setAttribute("aria-hidden", "true");
  icon.append(createLucideElement(iconNode, {
    width: 13,
    height: 13,
    "stroke-width": 1.8,
    focusable: "false",
    "aria-hidden": "true",
  }));
  return icon;
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
    const icon = websiteFaviconUrl(this.target)
      ? document.createElement("img")
      : createInlineIcon(Earth, "cm-live-link-icon");
    if (icon instanceof HTMLImageElement) {
      icon.className = "cm-live-link-icon cm-live-link-favicon";
      icon.src = websiteFaviconUrl(this.target)!;
      icon.alt = "";
      icon.loading = "lazy";
      icon.decoding = "async";
      icon.referrerPolicy = "no-referrer";
      icon.setAttribute("aria-hidden", "true");
      icon.addEventListener("error", () => icon.replaceWith(createInlineIcon(Earth, "cm-live-link-icon")), { once: true });
    }
    trigger.append(icon, document.createTextNode(this.label));
    trigger.title = this.target;
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", "false");
    wrapper.append(trigger);

    const closeMenu = () => {
      wrapper.querySelector(".cm-live-link-menu")?.remove();
      trigger.setAttribute("aria-expanded", "false");
      const row = wrapper.closest<HTMLElement>(".tree-row");
      row?.classList.remove("has-link-menu");
      row?.closest<HTMLElement>(".tree-list")?.classList.remove("has-link-menu");
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
        const row = wrapper.closest<HTMLElement>(".tree-row");
        row?.classList.add("has-link-menu");
        row?.closest<HTMLElement>(".tree-list")?.classList.add("has-link-menu");
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
    const row = dom.closest<HTMLElement>(".tree-row");
    row?.classList.remove("has-link-menu");
    row?.closest<HTMLElement>(".tree-list")?.classList.remove("has-link-menu");
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
    const label = document.createTextNode(this.label);
    element.append(createInlineIcon(FileText, "cm-live-node-link-icon"), label);
    element.setAttribute("title", this.available ? `打开节点：${this.label}` : `节点不存在：${this.target}`);
    if (element instanceof HTMLButtonElement) {
      element.type = "button";
      preserveEditorFocus(element, view);
      element.addEventListener("mouseenter", () => {
        const current = resolveNodeLink(this.target);
        label.nodeValue = current.label;
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

type PreviewKind = "image" | "audio" | "video" | "pdf" | "text";

const previewIcons = { image: Image, audio: Music, video: Film, pdf: FileText, text: Braces };

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KiB`;
  return `${(size / (1024 * 1024)).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)} MiB`;
}

abstract class CollapsibleAttachmentWidget extends WidgetType {
  constructor(
    protected readonly target: string,
    protected readonly label: string,
    protected readonly source: string,
    protected readonly nodeId: string,
    protected readonly attachmentId: string,
    protected readonly size: number,
  ) {
    super();
  }

  protected abstract readonly kind: PreviewKind;
  protected abstract createBody(shell: HTMLElement): HTMLElement;
  protected beforeCollapse(_shell: HTMLElement) {}

  protected sameAttachment(other: CollapsibleAttachmentWidget) {
    return this.target === other.target && this.label === other.label && this.source === other.source
      && this.nodeId === other.nodeId && this.attachmentId === other.attachmentId && this.size === other.size;
  }

  protected createShell() {
    const shell = document.createElement("span");
    const kindClass = this.kind === "image" ? "cm-live-image-attachment-preview" : `cm-live-${this.kind}-preview`;
    shell.className = `cm-live-attachment-preview ${kindClass}`;
    shell.setAttribute("data-attachment-control", "true");
    return shell;
  }

  toDOM() {
    const shell = this.createShell();
    const header = document.createElement("span");
    header.className = "cm-live-attachment-preview-header";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "cm-live-attachment-preview-toggle";
    toggle.append(createLucideElement(ChevronRight, { width: 15, height: 15, "stroke-width": 2, "aria-hidden": "true" }));
    const icon = createInlineIcon(previewIcons[this.kind], "cm-live-attachment-preview-icon");
    const label = document.createElement("span");
    label.className = "cm-live-attachment-preview-label";
    label.textContent = this.label;
    const size = document.createElement("span");
    size.className = "cm-live-attachment-preview-size";
    size.textContent = formatFileSize(this.size);
    const open = document.createElement("button");
    open.type = "button";
    open.className = "cm-live-attachment-preview-open";
    open.textContent = "打开";
    open.setAttribute("aria-label", `使用系统应用打开：${this.label}`);
    open.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void followMarkdownTarget(this.target);
    });
    const body = document.createElement("span");
    body.className = "cm-live-attachment-preview-body";
    let collapsed = isAttachmentPreviewCollapsed(this.nodeId, this.attachmentId);
    const render = () => {
      shell.classList.toggle("is-collapsed", collapsed);
      toggle.setAttribute("aria-expanded", String(!collapsed));
      toggle.setAttribute("aria-label", `${collapsed ? "展开" : "收起"}附件：${this.label}`);
      if (collapsed) {
        this.beforeCollapse(shell);
        body.replaceChildren();
      }
      else if (!body.firstChild) body.append(this.createBody(shell));
    };
    const toggleCollapsed = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      collapsed = !collapsed;
      setAttachmentPreviewCollapsed(this.nodeId, this.attachmentId, collapsed);
      render();
    };
    toggle.addEventListener("click", toggleCollapsed);
    header.addEventListener("click", (event) => {
      if (!(event.target as Element).closest("button")) toggleCollapsed(event);
    });
    header.append(toggle, icon, label, size, open);
    shell.append(header, body);
    render();
    return shell;
  }

  ignoreEvent() {
    return true;
  }
}

export class AudioAttachmentWidget extends CollapsibleAttachmentWidget {
  protected readonly kind = "audio";
  eq(other: AudioAttachmentWidget) {
    return this.sameAttachment(other);
  }

  protected createBody() {
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.preload = "metadata";
    audio.src = this.source;
    audio.setAttribute("aria-label", `播放音频：${this.label}`);
    return audio;
  }
}

export class VideoAttachmentWidget extends CollapsibleAttachmentWidget {
  protected readonly kind = "video";
  eq(other: VideoAttachmentWidget) {
    return this.sameAttachment(other);
  }

  protected createBody() {
    const video = document.createElement("video");
    video.controls = true;
    video.preload = "metadata";
    video.src = this.source;
    video.setAttribute("aria-label", `播放视频：${this.label}`);
    return video;
  }
}

export class PdfAttachmentWidget extends CollapsibleAttachmentWidget {
  protected readonly kind = "pdf";
  eq(other: PdfAttachmentWidget) {
    return this.sameAttachment(other);
  }

  protected createBody() {
    const frame = document.createElement("iframe");
    frame.src = this.source;
    frame.title = `PDF 预览：${this.label}`;
    frame.loading = "lazy";
    return frame;
  }
}

export class TextAttachmentWidget extends CollapsibleAttachmentWidget {
  private readonly cleanup = new WeakMap<HTMLElement, () => void>();
  protected readonly kind = "text";

  eq(other: TextAttachmentWidget) {
    return this.sameAttachment(other);
  }

  protected createBody(shell: HTMLElement) {
    const content = document.createElement("pre");
    content.textContent = this.size > MAX_TEXT_PREVIEW_SIZE ? "文件超过 512 KiB，请使用系统应用打开" : "正在读取…";
    if (this.size <= MAX_TEXT_PREVIEW_SIZE) {
      const controller = new AbortController();
      this.cleanup.set(shell, () => controller.abort());
      void fetch(this.source, { signal: controller.signal })
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.text();
        })
        .then((text) => {
          content.textContent = text;
          shell.classList.add("is-loaded");
        })
        .catch((error: unknown) => {
          if ((error as { name?: string }).name !== "AbortError") {
            content.textContent = "预览读取失败，请使用系统应用打开";
            shell.classList.add("is-error");
          }
        });
    }
    return content;
  }

  protected beforeCollapse(shell: HTMLElement) {
    this.cleanup.get(shell)?.();
    this.cleanup.delete(shell);
  }

  destroy(dom: HTMLElement) {
    this.beforeCollapse(dom);
  }
}

export class ImageAttachmentWidget extends CollapsibleAttachmentWidget {
  protected readonly kind = "image";

  eq(other: ImageAttachmentWidget) {
    return this.sameAttachment(other);
  }

  protected createBody(shell: HTMLElement) {
    const image = document.createElement("img");
    image.src = this.source;
    image.alt = this.label;
    image.loading = "lazy";
    image.addEventListener("error", () => shell.classList.add("is-error"));
    return image;
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

export function attachmentWidget(target: string, fallbackLabel: string, nodeId: string | null): WidgetType | null {
  const attachment = resolveAttachment(target, fallbackLabel);
  if (!attachment) return null;
  if (!attachment.available || !attachment.previewUrl) {
    return new AttachmentWidget(target, attachment.label, false);
  }
  if (!nodeId) return new AttachmentWidget(target, attachment.label, true);
  switch (attachmentPreviewKind(attachment.mime, attachment.label)) {
    case "audio":
      return new AudioAttachmentWidget(target, attachment.label, attachment.previewUrl, nodeId, attachment.id, attachment.size);
    case "video":
      return new VideoAttachmentWidget(target, attachment.label, attachment.previewUrl, nodeId, attachment.id, attachment.size);
    case "pdf":
      return new PdfAttachmentWidget(target, attachment.label, attachment.previewUrl, nodeId, attachment.id, attachment.size);
    case "text":
      return new TextAttachmentWidget(target, attachment.label, attachment.previewUrl, nodeId, attachment.id, attachment.size);
    default:
      return new AttachmentWidget(target, attachment.label, true);
  }
}

export function imageAttachmentWidget(target: string, fallbackLabel: string, nodeId: string | null): WidgetType | null {
  const attachment = resolveAttachment(target, fallbackLabel);
  if (!attachment || !attachment.mime.startsWith("image/") || !attachment.previewUrl || !nodeId) return null;
  return new ImageAttachmentWidget(
    target,
    attachment.label,
    attachment.previewUrl,
    nodeId,
    attachment.id,
    attachment.size,
  );
}
