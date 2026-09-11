import { type Print, words } from "../catalog";
import { useOwning } from "./context";

// A finish is part of what a stack is, so it is pressed with the printing.
export function Add({ print }: { print: Print }) {
  const owning = useOwning();
  if (!owning) return null;

  const have = owning.owned(print.id);

  return (
    <>
      <span className="owned">{have > 0 ? `${have} owned` : ""}</span>
      {print.finishes.map((finish) => (
        <span className="adjust" key={finish}>
          {/* The minus reaches the stack the plus writes to, so copies filed
            anywhere else leave it present and disabled. */}
          {owning.owned(print.id, finish) > 0 && (
            <button
              type="button"
              className="step"
              aria-label={`One fewer ${words(finish)}`}
              disabled={owning.filed(print.id, finish) === 0}
              onClick={() => void owning.take(print.id, finish)}
            >
              −
            </button>
          )}
          <button
            type="button"
            className="step"
            aria-label={`Add ${words(finish)}`}
            onClick={() => void owning.add(print.id, finish)}
          >
            {finish === "nonfoil" ? "+" : `+ ${words(finish)}`}
          </button>
        </span>
      ))}
    </>
  );
}
