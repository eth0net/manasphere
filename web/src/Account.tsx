import { useEffect, useState } from "react";
import { SCOPES } from "./config";
import { Modal } from "./Modal";
import { type Repo, read } from "./oauth/records";
import type { Session } from "./oauth/useSession";

export function Account({ account }: { account: Session }) {
  const { state, signIn, signOut } = account;
  const [repo, setRepo] = useState<Repo | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (state.status !== "in") {
      setRepo(null);
      return;
    }
    let live = true;
    read(state.session).then(
      (found) => {
        if (live) setRepo(found);
      },
      (error: unknown) => {
        if (live) setFailed(error instanceof Error ? error.message : "failed");
      },
    );
    return () => {
      live = false;
    };
  }, [state]);

  if (state.status === "restoring") return <span className="quiet">…</span>;
  if (state.status === "out") return <SignIn signIn={signIn} state={state} />;

  const missing = repo ? SCOPES.filter((s) => !repo.granted.includes(s)) : [];

  return (
    <Modal
      trigger="summary"
      title="Account"
      label={repo?.handle ?? state.session.did}
      actions={
        <button type="button" onClick={signOut}>
          Sign out
        </button>
      }
    >
      <dl>
        <dt>DID</dt>
        <dd>{state.session.did}</dd>
        <dt>Server</dt>
        <dd>{state.session.serverMetadata.issuer}</dd>
        <dt>Granted</dt>
        <dd>{repo ? repo.granted.join(" ") : "…"}</dd>
        {missing.length > 0 && (
          <>
            <dt>Not granted</dt>
            <dd className="warn">{missing.join(" ")}</dd>
          </>
        )}
        <dt>Records</dt>
        <dd>
          {repo
            ? repo.counts.length > 0
              ? repo.counts
                  .map(
                    (c) =>
                      `${c.collection.slice(12)} ${c.records}${c.more ? "+" : ""}`,
                  )
                  .join(", ")
              : "none yet"
            : "…"}
        </dd>
      </dl>
      {failed && <p className="warn">{failed}</p>}
    </Modal>
  );
}

function SignIn({
  signIn,
  state,
}: {
  signIn: (handle: string) => Promise<void>;
  state: { error?: string };
}) {
  const [handle, setHandle] = useState("");

  return (
    <Modal trigger="summary" title="Sign in" label="Sign in">
      <form
        className="query"
        onSubmit={(event) => {
          event.preventDefault();
          void signIn(handle);
        }}
      >
        <input
          type="text"
          value={handle}
          placeholder="liliana.mnwb.me"
          onChange={(event) => setHandle(event.target.value)}
          autoComplete="username"
          spellCheck={false}
        />
        <button type="submit" disabled={handle.trim().length === 0}>
          Continue
        </button>
      </form>
      <p className="quiet">
        Your handle or DID. Records are written to your own PDS, never ours.
      </p>
      {state.error && <p className="warn">{state.error}</p>}
    </Modal>
  );
}
