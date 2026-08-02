import type { PosterVersion } from "@poster/shared";

interface Props {
  versions: PosterVersion[];
  currentId: string | null;
  onSelect: (versionId: string) => void;
  disabled: boolean;
}

/** Horizontal strip of version snapshots; click one to roll back / branch. */
export function VersionTimeline({ versions, currentId, onSelect, disabled }: Props) {
  if (versions.length === 0) return null;
  return (
    <div className="timeline">
      <span className="timeline__label">Versions</span>
      {versions.map((v, i) => (
        <button
          key={v.id}
          className={`timeline__item${v.id === currentId ? " timeline__item--current" : ""}`}
          title={v.prompt}
          disabled={disabled}
          onClick={() => onSelect(v.id)}
        >
          v{i + 1}
        </button>
      ))}
    </div>
  );
}
