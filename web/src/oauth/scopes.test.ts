import { expect, test } from "bun:test";
import { SCOPES } from "../config";

test("the requested scopes are the ones the document declares", async () => {
  const document = await Bun.file(
    new URL("../../public/oauth/client-metadata.json", import.meta.url),
  ).json();

  expect(document.scope.split(/\s+/).toSorted()).toEqual(SCOPES.toSorted());
});
