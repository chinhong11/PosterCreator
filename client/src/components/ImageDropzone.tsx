import { useCallback, useRef, useState } from "react";

interface Props {
  onFile: (file: File) => void;
  previewUrl?: string;
  disabled?: boolean;
}

/** Drag-and-drop (or click-to-browse) image upload with a thumbnail preview. */
export function ImageDropzone({ onFile, previewUrl, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file && file.type.startsWith("image/")) onFile(file);
    },
    [onFile],
  );

  return (
    <div
      className={`dropzone${dragging ? " dropzone--active" : ""}${disabled ? " dropzone--disabled" : ""}`}
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!disabled) handleFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
      {previewUrl ? (
        <img className="dropzone__preview" src={previewUrl} alt="Uploaded" />
      ) : (
        <div className="dropzone__hint">
          <strong>Drop an image</strong>
          <span>or click to browse</span>
        </div>
      )}
    </div>
  );
}
