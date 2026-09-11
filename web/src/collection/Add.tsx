import { type Print, words } from "../catalog";
import { useOwning } from "./context";

// A finish is part of what a stack is, so it is pressed with the printing
// rather than asked afterward.
export function Add({ print }: { print: Print }) {
  const owning = useOwning();
  if (!owning) return null;

  const have = owning.owned(print.id);

  return (
    <>
      <span className="owned">{have > 0 ? `${have} owned` : ""}</span>
      {print.finishes.map((finish) => (
        <button
          key={finish}
          type="button"
          className="plus"
          onClick={() => void owning.add(print.id, finish)}
        >
          {finish === "nonfoil" ? "+" : `+ ${words(finish)}`}
        </button>
      ))}
    </>
  );
}
