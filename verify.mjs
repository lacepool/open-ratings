#!/usr/bin/env node

import { readFile } from "node:fs/promises"

import { verifyOpenRatingsTransaction } from "./verifier.mjs"

const input = process.argv[2]
if (!input) {
  process.stderr.write("Usage: node verify.mjs <transaction-cbor|proof-bundle.json>\n")
  process.exitCode = 2
} else {
  const transactionCbor = await readTransactionCbor(input)
  const result = verifyOpenRatingsTransaction(transactionCbor)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (!result.valid) process.exitCode = 1
}

async function readTransactionCbor(input) {
  if (/^[0-9a-f]+$/i.test(input)) return input

  const proofBundle = JSON.parse(await readFile(input, "utf8"))
  if (!proofBundle || typeof proofBundle.transactionCbor !== "string") {
    throw new Error("proof bundle must contain transactionCbor")
  }
  return proofBundle.transactionCbor
}
