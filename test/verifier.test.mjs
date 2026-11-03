import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import test from "node:test"

import * as Address from "@evolution-sdk/evolution/Address"
import * as Assets from "@evolution-sdk/evolution/Assets"
import * as KeyHash from "@evolution-sdk/evolution/KeyHash"
import * as PrivateKey from "@evolution-sdk/evolution/PrivateKey"
import * as RewardAccount from "@evolution-sdk/evolution/RewardAccount"
import * as Transaction from "@evolution-sdk/evolution/Transaction"
import * as TransactionBody from "@evolution-sdk/evolution/TransactionBody"
import * as TransactionHash from "@evolution-sdk/evolution/TransactionHash"
import * as TransactionWitnessSet from "@evolution-sdk/evolution/TransactionWitnessSet"
import * as UTxO from "@evolution-sdk/evolution/UTxO"
import { hashTransactionRaw } from "@evolution-sdk/evolution/utils/Hash"
import { makeTxBuilder } from "@evolution-sdk/evolution/sdk/builders/TransactionBuilder"

import { buildOpenRatingsMetadata } from "../metadata.mjs"
import { verifyOpenRatingsTransaction } from "../verifier.mjs"

const PROTOCOL_PARAMETERS = {
  minFeeCoefficient: 44n,
  minFeeConstant: 155_381n,
  coinsPerUtxoByte: 4_310n,
  maxTxSize: 16_384
}

test("derives and verifies the author of a user-paid rating", async () => {
  const fixture = await makeFixture()
  const result = verifyOpenRatingsTransaction(fixture.userPaidTransactionCbor)

  assert.equal(result.valid, true)
  assert.equal(result.protocol, "open-ratings")
  assert.equal(result.protocolVersion, 0)
  assert.equal(result.author, fixture.author)
  assert.deepEqual(result.ratings, [{ dappId: "minswap", rating: 5 }])
  assert.deepEqual(result.reasons, [])
})

test("derives the user as author when a sponsor also signs", async () => {
  const fixture = await makeFixture()
  const result = verifyOpenRatingsTransaction(fixture.sponsoredTransactionCbor)

  assert.equal(result.valid, true)
  assert.equal(result.author, fixture.author)
  assert.equal(result.authorKeyHash, fixture.authorKeyHash)
  assert.notEqual(result.authorKeyHash, fixture.sponsorKeyHash)
})

test("rejects missing, unrelated, malformed, and invalid author witnesses", async (context) => {
  const fixture = await makeFixture()
  const cases = {
    missing: signedCbor(fixture.transaction, [fixture.paymentKey]),
    unrelated: mutate(fixture.transaction, (transaction) => {
      transaction.body.requiredSigners = [KeyHash.fromPrivateKey(fixture.otherKey)]
    }, [fixture.paymentKey, fixture.stakeKey]),
    malformed: "not-cbor",
    invalid: signedCbor(fixture.transaction, [fixture.paymentKey], {
      vkeySource: fixture.stakeKey,
      signingKey: fixture.otherKey
    })
  }

  for (const [name, transactionCbor] of Object.entries(cases)) {
    await context.test(name, () => assert.equal(verifyOpenRatingsTransaction(transactionCbor).valid, false))
  }
})

test("rejects a voterId that does not match the verified author", async () => {
  const fixture = await makeFixture({ voterId: rewardAddress(makeAddress()).address })
  assert.deepEqual(verifyOpenRatingsTransaction(fixture.userPaidTransactionCbor).reasons, ["voter_id_mismatch"])
})

async function makeFixture({ voterId } = {}) {
  const paymentKey = privateKey(1)
  const stakeKey = privateKey(2)
  const sponsorKey = privateKey(3)
  const otherKey = privateKey(4)
  const userAddress = makeAddress(paymentKey, stakeKey)
  const sponsorAddress = makeAddress(sponsorKey, privateKey(5))
  const author = rewardAddress(userAddress).address
  const metadata = buildOpenRatingsMetadata({
    ratings: [{ dappId: "minswap", rating: 5 }],
    voterId: voterId || author,
    id: "018f739e-7e9c-7b71-9f69-43ad0fce844f"
  })
  const userUtxo = makeUtxo(userAddress, 1, 10_000_000n)
  const built = await makeTxBuilder({ network: "Mainnet" })
    .collectFrom({ inputs: [userUtxo] })
    .addSigner({ keyHash: userAddress.stakingCredential })
    .attachMetadata({ label: metadata.label, metadata: metadata.metadatum })
    .build({
      availableUtxos: [],
      changeAddress: userAddress,
      onInsufficientChange: "error",
      protocolParameters: PROTOCOL_PARAMETERS
    })
  const transaction = await built.toTransaction()

  return {
    author,
    authorKeyHash: KeyHash.toHex(userAddress.stakingCredential),
    otherKey,
    paymentKey,
    sponsorKeyHash: KeyHash.toHex(KeyHash.fromPrivateKey(sponsorKey)),
    stakeKey,
    transaction,
    userPaidTransactionCbor: signedCbor(transaction, [paymentKey, stakeKey]),
    sponsoredTransactionCbor: signedCbor(transaction, [paymentKey, stakeKey, sponsorKey])
  }
}

function signedCbor(transaction, keys, invalidWitness) {
  const bodyHash = hashTransactionRaw(Buffer.from(TransactionBody.toCBORHex(transaction.body), "hex"))
  const witnesses = keys.map((key) => witness(key, key, bodyHash))
  if (invalidWitness) witnesses.push(witness(invalidWitness.vkeySource, invalidWitness.signingKey, bodyHash))
  return Transaction.toCBORHex(new Transaction.Transaction({
    ...transaction,
    witnessSet: new TransactionWitnessSet.TransactionWitnessSet({ vkeyWitnesses: witnesses })
  }))
}

function mutate(transaction, change, keys) {
  const changed = Transaction.fromCBORHex(Transaction.toCBORHex(transaction))
  change(changed)
  return signedCbor(changed, keys)
}

function witness(vkeySource, signingKey, bodyHash) {
  return new TransactionWitnessSet.VKeyWitness({
    vkey: PrivateKey.toPublicKey(vkeySource),
    signature: PrivateKey.sign(signingKey, bodyHash.hash)
  })
}

function privateKey(seed) {
  return PrivateKey.fromBytes(Uint8Array.from({ length: 32 }, (_, index) => (seed + index) % 256))
}

function makeAddress(paymentKey = privateKey(10), stakeKey = privateKey(11)) {
  return Address.Address.make({
    networkId: 1,
    paymentCredential: KeyHash.fromPrivateKey(paymentKey),
    stakingCredential: KeyHash.fromPrivateKey(stakeKey)
  })
}

function rewardAddress(address) {
  const reward = new RewardAccount.RewardAccount({ networkId: address.networkId, stakeCredential: address.stakingCredential })
  return { address: RewardAccount.toBech32(reward) }
}

function makeUtxo(address, seed, lovelace) {
  return new UTxO.UTxO({
    transactionId: TransactionHash.fromHex(seed.toString(16).padStart(64, "0")),
    index: 0n,
    address,
    assets: Assets.fromLovelace(lovelace)
  })
}
