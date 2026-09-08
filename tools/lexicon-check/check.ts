// Validates ../../lexicons against atproto's own lexicon implementation, then
// against records it has to accept and refuse, then the OAuth client metadata
// document against both.
//
//     bun install && bun run check
//
// The refusals are the point. A schema that accepts everything would pass a
// validity check on its own.

import { lexicons } from "@atproto/api";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const DIR = join(dirname(dirname(import.meta.dir)), "lexicons");

let failed = false;
const fail = (message: string) => {
  console.log(`  FAIL  ${message}`);
  failed = true;
};
const ok = (message: string) => console.log(`  ok    ${message}`);

// Seeded with every official schema, so refs to com.atproto.* resolve against
// the real definitions rather than a copy that can go stale.
const lex = lexicons;
const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .sort();

console.log("schemas:");
for (const file of files) {
  const doc = JSON.parse(readFileSync(join(DIR, file), "utf8"));
  if (doc.id !== file.replace(/\.json$/, "")) {
    fail(`${file}: id is "${doc.id}", so the filename does not name the NSID`);
  }
  try {
    lex.add(doc);
    ok(doc.id);
  } catch (error) {
    fail(`${doc.id}: ${(error as Error).message}`);
  }
}

console.log("\nrefs:");
const refs = new Set<string>();
const walk = (node: unknown, docId: string) => {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, docId));
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  const qualify = (r: string) => (r.startsWith("#") ? docId + r : r);
  if (obj.type === "ref" && typeof obj.ref === "string") refs.add(qualify(obj.ref));
  if (obj.type === "union" && Array.isArray(obj.refs)) {
    for (const r of obj.refs) refs.add(qualify(r as string));
  }
  Object.values(obj).forEach((n) => walk(n, docId));
};
for (const file of files) {
  const doc = JSON.parse(readFileSync(join(DIR, file), "utf8"));
  walk(doc, doc.id);
}
for (const ref of [...refs].sort()) {
  try {
    lex.getDefOrThrow(ref);
    ok(ref);
  } catch {
    fail(`unresolved ref ${ref}`);
  }
}

const NOW = "2026-09-07T02:40:00.000Z";
const DID = "did:plc:sesxeihcsbjxpez2l4of7oie";
const SOURCE = {
  uri: `at://${DID}/app.manasphere.deck/3l4xk`,
  cid: "bafyreidfayvfuwqa7qlnopdjiqrxzs6blmoeu4rujcjtnci5beludirz2a",
};
const BOLT = "44623693-51d6-49ad-8cd7-140505caf02f";

const accepted: Array<[string, Record<string, unknown>]> = [
  ["a stack with only what is required", {
    $type: "app.manasphere.card",
    scryfallId: "435589bb-27c6-4a6d-9d63-394d5092b9d8",
    finish: "nonfoil",
    quantity: 1,
    createdAt: NOW,
  }],
  ["a graded, filed, foil stack", {
    $type: "app.manasphere.card",
    scryfallId: "b68be6a7-0515-42e0-abe9-b3f14b118c19",
    finish: "foil",
    quantity: 3,
    condition: "nearMint",
    container: `at://${DID}/app.manasphere.container/3l4xm`,
    acquiredAt: NOW,
    createdAt: NOW,
  }],
  ["a stack with provenance, a note and tags", {
    $type: "app.manasphere.card",
    scryfallId: BOLT,
    finish: "nonfoil",
    quantity: 2,
    acquisitions: [
      { at: NOW, quantity: 1, price: "0.90", currency: "GBP", marketValue: "27.18", marketCurrency: "EUR" },
      { quantity: 1, marketValue: "26.40", marketCurrency: "EUR" },
    ],
    updatedAt: NOW,
    note: "042/500, bought at GP Bristol",
    tags: ["signed", "altered", "sleeved-in-the-good-ones"],
    proxy: false,
    createdAt: NOW,
  }],
  ["a container", {
    $type: "app.manasphere.container",
    name: "Trade binder",
    kind: "binder",
    createdAt: NOW,
  }],
  ["a deck that is still just a concept", {
    $type: "app.manasphere.deck",
    name: "Jinnie Fay tokens",
    createdAt: NOW,
  }],
  ["a built commander deck, forked, with history", {
    $type: "app.manasphere.deck",
    name: "Jetmir",
    format: "commander",
    container: `at://${DID}/app.manasphere.container/3l4xm`,
    archived: false,
    visibility: "unlisted",
    forkedFrom: { source: SOURCE, snapshot: `at://${DID}/app.manasphere.snapshot/3l4xn` },
    entries: [
      { oracleId: "61fbaaf2-4286-4e9a-b9cb-aa31262b596a", quantity: 1, section: "commander" },
      {
        oracleId: "43b5e462-d860-473d-828f-6c513fc7768a",
        scryfallId: "0004311b-646a-4df8-a4b4-9171642e9ef4",
        finish: "foil",
        quantity: 1,
      },
      { oracleId: BOLT, quantity: 4, section: "main" },
    ],
    recentChanges: [
      { at: NOW, op: "setQuantity", previousQuantity: 2, entry: { oracleId: BOLT, quantity: 4 } },
    ],
    createdAt: NOW,
    updatedAt: NOW,
  }],
  ["a wishlist", {
    $type: "app.manasphere.list",
    name: "Want",
    purpose: "wishlist",
    entries: [{ oracleId: BOLT, quantity: 1 }],
    createdAt: NOW,
  }],
  ["a named snapshot", {
    $type: "app.manasphere.snapshot",
    subject: SOURCE,
    name: "Pre-rotation",
    entries: [{ oracleId: BOLT, quantity: 1 }],
    createdAt: NOW,
  }],
  // knownValues, not enum: a value Scryfall adds later must stay writable.
  ["a finish this schema has never heard of", {
    $type: "app.manasphere.card",
    scryfallId: BOLT,
    finish: "surgeFoil",
    quantity: 1,
    createdAt: NOW,
  }],
  ["a format this schema has never heard of", {
    $type: "app.manasphere.deck",
    name: "Whatever comes next",
    format: "someFutureFormat",
    createdAt: NOW,
  }],
];

const refused: Array<[string, Record<string, unknown>]> = [
  ["a stack with no finish, which would break stack identity", {
    $type: "app.manasphere.card",
    scryfallId: BOLT,
    quantity: 1,
    createdAt: NOW,
  }],
  ["a stack of zero, which should be a delete", {
    $type: "app.manasphere.card",
    scryfallId: BOLT,
    finish: "foil",
    quantity: 0,
    createdAt: NOW,
  }],
  ["a design entry with no oracleId, unusable for legality", {
    $type: "app.manasphere.deck",
    name: "d",
    entries: [{ scryfallId: BOLT, quantity: 1 }],
    createdAt: NOW,
  }],
  ["a container with an empty name", {
    $type: "app.manasphere.container",
    name: "",
    createdAt: NOW,
  }],
  ["a snapshot of nothing", {
    $type: "app.manasphere.snapshot",
    entries: [],
    createdAt: NOW,
  }],
  ["a snapshot subject with no cid, which would not pin a version", {
    $type: "app.manasphere.snapshot",
    subject: { uri: SOURCE.uri },
    entries: [],
    createdAt: NOW,
  }],
  ["a fork source that is a bare uri rather than a strongRef", {
    $type: "app.manasphere.deck",
    name: "d",
    forkedFrom: { source: SOURCE.uri },
    createdAt: NOW,
  }],
  ["a proxy flag that is a string rather than a boolean", {
    $type: "app.manasphere.card",
    scryfallId: BOLT,
    finish: "foil",
    quantity: 1,
    proxy: "yes",
    createdAt: NOW,
  }],
  ["a currency that is not a three-letter code", {
    $type: "app.manasphere.card",
    scryfallId: BOLT,
    finish: "foil",
    quantity: 1,
    acquisitions: [{ quantity: 1, price: "1.00", currency: "pounds" }],
    createdAt: NOW,
  }],
  ["an acquisition of no copies", {
    $type: "app.manasphere.card",
    scryfallId: BOLT,
    finish: "foil",
    quantity: 1,
    acquisitions: [{ quantity: 0, price: "1.00", currency: "GBP" }],
    createdAt: NOW,
  }],
  ["an acquisition that is a bare number", {
    $type: "app.manasphere.card",
    scryfallId: BOLT,
    finish: "foil",
    quantity: 1,
    acquisitions: [3],
    createdAt: NOW,
  }],
  ["a container reference that is a bare rkey", {
    $type: "app.manasphere.card",
    scryfallId: BOLT,
    finish: "foil",
    quantity: 1,
    container: "3l4xk",
    createdAt: NOW,
  }],
];

console.log("\nrecords that must validate:");
for (const [label, record] of accepted) {
  try {
    lex.assertValidRecord(record.$type as string, record);
    ok(label);
  } catch (error) {
    fail(`${label}: ${(error as Error).message}`);
  }
}

console.log("\nrecords that must be refused:");
for (const [label, record] of refused) {
  try {
    lex.assertValidRecord(record.$type as string, record);
    fail(`${label}: accepted, but should not be`);
  } catch (error) {
    ok(`${label} — ${(error as Error).message}`);
  }
}

// The client metadata document. It is committed rather than generated, because
// the client imports these same bytes to decide what to request, so this is
// where the two are held to each other. See docs/atproto.md.
const OAUTH = join(
  dirname(dirname(import.meta.dir)),
  "web/public/oauth/client-metadata.json",
);
const client = JSON.parse(readFileSync(OAUTH, "utf8"));
const scopes: string[] = client.scope.split(" ");

console.log("\nclient metadata:");
const expect = (label: string, condition: boolean, detail = "") =>
  condition ? ok(label) : fail(`${label}${detail && ` — ${detail}`}`);

expect(
  "client_uri is the parent of client_id",
  client.client_id === `${client.client_uri}/oauth/client-metadata.json`,
  `${client.client_id} under ${client.client_uri}`,
);
expect(
  "every redirect_uri is https",
  client.redirect_uris.every((uri: string) => uri.startsWith("https://")),
);
expect("a browser client authenticates with none", client.token_endpoint_auth_method === "none");
expect("tokens are DPoP-bound", client.dpop_bound_access_tokens === true);
expect("atproto comes first in scope", scopes[0] === "atproto");
expect(
  "no scope globs a prefix, which repo: does not support",
  !scopes.some((scope) => scope.includes("*")),
);

// Adding a record type without its scope costs every existing user a fresh
// consent, since repo: takes an exact NSID and there is no prefix form.
for (const file of files) {
  const doc = JSON.parse(readFileSync(join(DIR, file), "utf8"));
  if (doc.defs?.main?.type !== "record") continue;
  expect(`${doc.id} has a repo: scope`, scopes.includes(`repo:${doc.id}`));
}

console.log(failed ? "\nFAILED" : "\nall green");
process.exit(failed ? 1 : 0);
