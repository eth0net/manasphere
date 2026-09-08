import { type ReactNode, useEffect, useRef } from "react";

// One dialog's worth of wiring: a trigger, a panel, and Escape.
export function Modal({
  label,
  trigger,
  title,
  actions,
  children,
}: {
  label: ReactNode;
  trigger: string;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  // Set here because React's types don't carry it yet. A click handler on the
  // backdrop would be a way to close that a keyboard can't reach.
  useEffect(() => {
    dialog.current?.setAttribute("closedby", "any");
  }, []);

  return (
    <>
      <button
        type="button"
        className={trigger}
        onClick={() => dialog.current?.showModal()}
      >
        {label}
      </button>

      <dialog ref={dialog}>
        <div className="panel">
          <h2>{title}</h2>
          {children}
          <p className="actions">
            {actions}
            <button type="button" onClick={() => dialog.current?.close()}>
              Close
            </button>
          </p>
        </div>
      </dialog>
    </>
  );
}
