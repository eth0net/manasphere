import { expect, test } from "bun:test";
import { type Owned, stack } from "./cards";

const copy: Owned = {
  scryfallId: "0000aaaa-0000-4000-8000-00000000000a",
  finish: "nonfoil",
  quantity: 1,
  createdAt: "2026-09-11T00:00:00.000Z",
};

test("a finish makes a separate stack", () => {
  expect(stack({ ...copy, finish: "foil" })).not.toBe(stack(copy));
});

test("a grade makes a separate stack", () => {
  expect(stack({ ...copy, condition: "played" })).not.toBe(stack(copy));
});

test("the same printing in two places is two stacks", () => {
  const filed = {
    ...copy,
    container: "at://did:plc:x/app.manaweb.container/a",
  };
  expect(stack(filed)).not.toBe(stack(copy));
});

test("an add matching every field increments rather than creating", () => {
  expect(
    stack({ ...copy, quantity: 7, createdAt: "2020-01-01T00:00:00.000Z" }),
  ).toBe(stack(copy));
});
