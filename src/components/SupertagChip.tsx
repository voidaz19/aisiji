import { X } from "lucide-react";
import { BUILT_IN_SUPERTAGS } from "../domain/supertags";

interface Props {
  supertagIds?: readonly string[];
  onRemove: (supertagId: string) => void;
}

/** Compact, removable labels attached to a node without changing its Markdown. */
export function SupertagChips({ supertagIds = [], onRemove }: Props) {
  const tags = supertagIds
    .map((id) => BUILT_IN_SUPERTAGS.find((tag) => tag.id === id))
    .filter((tag): tag is (typeof BUILT_IN_SUPERTAGS)[number] => Boolean(tag));
  if (!tags.length) return null;

  return (
    <div className="supertag-chips" aria-label="节点标签">
      {tags.map((tag) => (
        <button
          className="supertag-chip"
          key={tag.id}
          type="button"
          title={`移除${tag.label}标签`}
          aria-label={`移除${tag.label}标签`}
          onClick={() => onRemove(tag.id)}
        >
          <span className="supertag-chip-mark" aria-hidden="true">
            <span className="supertag-chip-hash">#</span>
            <X className="supertag-chip-remove" size={13} />
          </span>
          <span>{tag.label}</span>
        </button>
      ))}
    </div>
  );
}
