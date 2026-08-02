import type { DesignDirection } from "@poster/shared";

interface Props {
  directions: DesignDirection[];
  onPick: (d: DesignDirection) => void;
  onCancel: () => void;
  disabled: boolean;
}

/** Shows four proposed visual directions; picking one kicks off the design. */
export function DirectionPicker({ directions, onPick, onCancel, disabled }: Props) {
  return (
    <div className="directions">
      <div className="directions__head">
        <strong>Pick a direction</strong>
        <button className="directions__cancel" onClick={onCancel} disabled={disabled}>
          Skip
        </button>
      </div>
      <div className="directions__grid">
        {directions.map((d) => (
          <button
            key={d.id}
            className="direction-card"
            disabled={disabled}
            onClick={() => onPick(d)}
          >
            <span className="direction-card__title">{d.title}</span>
            <span className="direction-card__desc">{d.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
