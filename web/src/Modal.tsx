import { type ReactNode, useEffect, useRef, useState } from "react";

// One dialog's worth of wiring: a trigger, a panel, and Escape.
export function Modal({
  label,
  trigger,
  title,
  actions,
  wide,
  children,
}: {
  label: ReactNode;
  trigger: string;
  title: string;
  actions?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

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
        onClick={() => {
          setOpen(true);
          dialog.current?.showModal();
        }}
      >
        {label}
      </button>

      <dialog
        ref={dialog}
        className={wide ? "wide" : undefined}
        onClose={() => setOpen(false)}
      >
        <div className="panel">
          <h2>{title}</h2>
          {/* Built on opening, so a modal per search result costs three
              elements rather than a list nobody has asked to see. */}
          {open && children}
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
