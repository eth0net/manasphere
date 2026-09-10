# Fixtures

Test accounts on `pds.e0n.sh`, which serves handles under both `.mnwb.me` and
`.pds.e0n.sh`. Records to seed them with land here too — `goat` writes those,
so there is no CLI of ours to build.

Passwords belong in 1Password and never in this file. DIDs are public
identifiers, so each one gets recorded below once its account exists.

## The cast

`mnwb.me` is the authoring domain, so the personas live there, each named for
a path it exercises rather than for itself.

| handle | did | role it plays |
|---|---|---|
| `liliana.mnwb.me` | | primary author: a real collection and published decks |
| `jace.mnwb.me` | | forks everything, so `forkedFrom` is always exercised |
| `nissa.mnwb.me` | | hoards. Thousands of entries, for the import ceiling |
| `squee.mnwb.me` | | writes and deletes constantly, and comes back regardless |
| `norin.mnwb.me` | | deactivates and reactivates at any provocation |
| `teferi.mnwb.me` | | writes, then goes quiet past the replay window |
| `bob.mnwb.me` | | signed in holding nothing at all |

The first account accumulates data whose DID has to survive. The personas
exist to be deleted, which is why only one of them is worth naming carefully.

## What a handle may be

Three to eighteen characters before the service domain, no dot inside it, and
not one of the 1,030 reserved names the PDS ships in
`packages/pds/src/handle/reserved.ts`. `dev`, `test` and `sandbox` are all on
that list, which is why the personas are named after people.

`com.atproto.admin.updateAccountHandle` is the only endpoint waiving the
reserved check, so a reserved name is still reachable: create the account under
a free one and move it afterwards.

A handle outside the service domains — `elliot.e0n.sh`, say — cannot be set at
creation, because the PDS verifies that the handle resolves to the account's
DID and no DID exists yet. Publish `_atproto.<handle>` as a TXT record holding
`did=…` first, then `goat account update-handle`.

## Creating one

```
docker exec pds goat pds admin account create \
  --handle liliana.mnwb.me --email … --password …
```

The invite code generates itself, so `PDS_INVITE_REQUIRED` costs nothing here.
`goat pds admin account delete <did>` clears an account off the PDS, but its
PLC entry stays public permanently — a DID can be tombstoned, never withdrawn.
So keep the cast small and reuse it.
