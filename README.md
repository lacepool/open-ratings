# Open Ratings

Open Ratings is an open, verifiable protocol for publishing project ratings on
Cardano. It is designed so wallets, applications, and independent indexers can
submit, discover, verify, and aggregate ratings without relying on a
CardanoCube API.

This repository contains the working protocol specification, verification
fixtures, and an experimental reference verifier.

## Current status

Open Ratings is an experimental working draft. Version 0 is the first
compatibility step from CardanoCube's existing project ratings toward an
implementation-independent protocol. It must not yet be treated as a stable
standard.

Version 0 retains metadata label `1668`, the `dapp-rating` type, CardanoCube
project slugs, and integer rating values from 1 through 5. It adds these
interpretation markers:

```json
{
  "protocol": "open-ratings",
  "version": 0
}
```

It also requires the author's stake verification-key hash in the transaction's
`required_signers`. Author authorization is therefore enforced by the Cardano
ledger rather than trusted from the client-supplied `voterId`.

## Reference verifier

The verifier accepts complete transaction CBOR and checks that:

1. the transaction contains version 0 Open Ratings metadata;
2. the transaction body commits to that metadata;
3. exactly one supported author stake key is required;
4. the corresponding witness signs the transaction body;
5. the derived author reward address matches `voterId`; and
6. the rating payload satisfies the version 0 schema.

It has no dependency on Rails, the CardanoCube database, or a CardanoCube API.

Run it with complete transaction CBOR or a JSON proof bundle containing a
`transactionCbor` property:

```sh
node verify.mjs <transaction-cbor>
node verify.mjs path/to/proof-bundle.json
```

Run the conformance tests with:

```sh
npm test
```

## Verification model

A verifier derives the author from the required stake key; `voterId` is only a
compatibility field. Because the transaction body commits to its auxiliary
data, changing a rating after the author signs invalidates the signature.

Complete transaction CBOR is the reference verifier's input. An indexer may
instead verify confirmed transactions using a trusted ledger data source such
as `cardano-db-sync`, provided it applies the same protocol rules.

## Repository contents

The repository is intended to contain:

- the versioned protocol specification;
- a machine-readable schema;
- valid and invalid transaction fixtures;
- expected verifier results and reason codes;
- the reference verifier and command-line interface; and
- conformance tests reusable by independent implementations.

## Roadmap

The next protocol steps are to:

- publish fixed user-paid and sponsored transaction fixtures;
- test one-approval signing across supported wallets;
- introduce stable project identifiers independent of mutable slugs;
- define deterministic replacement and revocation rules; and
- validate the fixtures with a second independent implementation.

## Contributing

Protocol discussion, fixture review, interoperability testing, and independent
implementations are welcome. Breaking interpretation changes must introduce a
new protocol version rather than silently changing historical ratings.

## License

Licensed under the Apache License 2.0.
