import { useState } from "react";
import { login } from "../api.js";

/** Password screen shown when the server requires auth (APP_PASSWORD set). */
export function LoginGate({ onAuthed }: { onAuthed: () => void }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!pw || busy) return;
    setBusy(true);
    setError(null);
    try {
      await login(pw);
      onAuthed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login__card">
        <h1>Poster Creator</h1>
        <p>Enter the password to continue.</p>
        <input
          type="password"
          value={pw}
          placeholder="Password"
          autoFocus
          disabled={busy}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        {error && <div className="login__error">{error}</div>}
        <button onClick={submit} disabled={busy || !pw}>
          {busy ? "Checking…" : "Enter"}
        </button>
      </div>
    </div>
  );
}
