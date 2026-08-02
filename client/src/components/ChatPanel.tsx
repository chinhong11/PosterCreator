import { useState } from "react";
import type { ChatMessage } from "@poster/shared";

interface Props {
  messages: ChatMessage[];
  onSend: (prompt: string) => void;
  disabled: boolean;
  placeholder: string;
}

/** Chat history plus the prompt box used for the brief and every refinement. */
export function ChatPanel({ messages, onSend, disabled, placeholder }: Props) {
  const [draft, setDraft] = useState("");

  const submit = () => {
    const text = draft.trim();
    if (!text || disabled) return;
    onSend(text);
    setDraft("");
  };

  return (
    <div className="chat">
      <div className="chat__log">
        {messages.length === 0 && (
          <p className="chat__hint">
            Describe the poster you want. Then keep asking for tweaks — "make the title bigger",
            "use a darker background", "move the photo to the left".
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bubble bubble--${m.role}`}>
            {m.text}
          </div>
        ))}
      </div>
      <div className="chat__input">
        <textarea
          value={draft}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
        />
        <button onClick={submit} disabled={disabled || !draft.trim()}>
          {disabled ? "Working…" : "Send"}
        </button>
      </div>
    </div>
  );
}
