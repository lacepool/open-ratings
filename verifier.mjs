import * as AuxiliaryDataHash from "@evolution-sdk/evolution/AuxiliaryDataHash"
import * as Ed25519Signature from "@evolution-sdk/evolution/Ed25519Signature"
import * as KeyHash from "@evolution-sdk/evolution/KeyHash"
import * as RewardAccount from "@evolution-sdk/evolution/RewardAccount"
import * as Transaction from "@evolution-sdk/evolution/Transaction"
import * as TransactionBody from "@evolution-sdk/evolution/TransactionBody"
import * as TransactionHash from "@evolution-sdk/evolution/TransactionHash"
import * as VKey from "@evolution-sdk/evolution/VKey"
import { hashAuxiliaryData, hashTransactionRaw } from "@evolution-sdk/evolution/utils/Hash"

export const OPEN_RATINGS_LABEL = 1668n
export const OPEN_RATINGS_PROTOCOL = "open-ratings"
export const OPEN_RATINGS_VERSION = 0n

export function verifyOpenRatingsTransaction(transactionCbor) {
  try {
    return verify(transactionCbor)
  } catch (error) {
    const reason = error instanceof VerificationError ? error.reason : "invalid_transaction_cbor"
    return { valid: false, protocol: OPEN_RATINGS_PROTOCOL, protocolVersion: 0, reasons: [reason] }
  }
}

function verify(transactionCbor) {
  const transaction = decodeTransaction(transactionCbor)
  requireCondition(transaction.isValid, "invalid_transaction_state")
  verifyAuxiliaryDataHash(transaction)

  const payload = decodePayload(transaction)
  const authorKeyHash = requiredAuthorKeyHash(transaction.body)
  verifyAuthorWitness(transaction, authorKeyHash)
  const networkId = transactionNetworkId(transaction.body)
  const author = RewardAccount.toBech32(new RewardAccount.RewardAccount({ networkId, stakeCredential: authorKeyHash }))
  requireCondition(payload.voterId === author, "voter_id_mismatch")

  const bodyCbor = TransactionBody.toCBORHex(transaction.body)
  const transactionHash = TransactionHash.toHex(hashTransactionRaw(Buffer.from(bodyCbor, "hex")))

  return {
    valid: true,
    protocol: OPEN_RATINGS_PROTOCOL,
    protocolVersion: 0,
    author,
    authorKeyHash: KeyHash.toHex(authorKeyHash),
    network: networkId === 1 ? "cardano-mainnet" : `cardano-network-${networkId}`,
    transactionHash,
    id: payload.uuid,
    ratings: payload.ratings,
    reasons: []
  }
}

function decodeTransaction(transactionCbor) {
  if (typeof transactionCbor !== "string" || !/^[0-9a-f]+$/i.test(transactionCbor)) fail("invalid_transaction_cbor")
  let transaction
  try {
    transaction = Transaction.fromCBORHex(transactionCbor)
  } catch {
    fail("invalid_transaction_cbor")
  }
  requireCondition(Transaction.toCBORHex(transaction).toLowerCase() === transactionCbor.toLowerCase(), "noncanonical_transaction_cbor")
  return transaction
}

function verifyAuxiliaryDataHash(transaction) {
  requireCondition(transaction.auxiliaryData && transaction.body.auxiliaryDataHash, "missing_auxiliary_data")
  const actual = AuxiliaryDataHash.toHex(transaction.body.auxiliaryDataHash)
  const expected = AuxiliaryDataHash.toHex(hashAuxiliaryData(transaction.auxiliaryData))
  requireCondition(actual === expected, "auxiliary_data_hash_mismatch")
}

function decodePayload(transaction) {
  const metadata = transaction.auxiliaryData.metadata
  requireCondition(metadata?.has(OPEN_RATINGS_LABEL), "rating_metadata_missing")
  const metadatum = metadata.get(OPEN_RATINGS_LABEL)
  requireCondition(metadatum instanceof Map, "invalid_metadata_schema")
  requireExactMapKeys(metadatum, ["type", "protocol", "version", "uuid", "voterId", "ratings"], "invalid_metadata_schema")

  const payload = Object.fromEntries(metadatum)
  requireCondition(payload.type === "dapp-rating", "invalid_metadata_type")
  requireCondition(payload.protocol === OPEN_RATINGS_PROTOCOL, "unsupported_protocol")
  requireCondition(payload.version === OPEN_RATINGS_VERSION, "unsupported_protocol_version")
  requireCondition(
    typeof payload.uuid === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.uuid),
    "invalid_attestation_id"
  )
  requireCondition(typeof payload.voterId === "string", "invalid_voter_id")
  requireCondition(Array.isArray(payload.ratings) && payload.ratings.length >= 1 && payload.ratings.length <= 50, "invalid_ratings")

  const subjects = new Set()
  const ratings = payload.ratings.map((entry) => {
    requireCondition(entry instanceof Map, "invalid_rating")
    requireExactMapKeys(entry, ["dappId", "rating"], "invalid_rating")
    const rating = Object.fromEntries(entry)
    requireCondition(typeof rating.dappId === "string" && /^[a-z0-9][a-z0-9-]{0,99}$/.test(rating.dappId), "invalid_subject")
    requireCondition(typeof rating.rating === "bigint" && rating.rating >= 1n && rating.rating <= 5n, "invalid_rating")
    requireCondition(!subjects.has(rating.dappId), "duplicate_subject")
    subjects.add(rating.dappId)
    return { dappId: rating.dappId, rating: Number(rating.rating) }
  })

  return { uuid: payload.uuid, voterId: payload.voterId, ratings }
}

function requireExactMapKeys(map, expectedKeys, reason) {
  const keys = [...map.keys()]
  requireCondition(keys.every((key) => typeof key === "string"), reason)
  requireCondition(keys.length === expectedKeys.length, reason)
  requireCondition(expectedKeys.every((key) => map.has(key)), reason)
}

function requiredAuthorKeyHash(body) {
  requireCondition(body.requiredSigners?.length === 1, "invalid_author_required_signer")
  return body.requiredSigners[0]
}

function verifyAuthorWitness(transaction, authorKeyHash) {
  const expectedKeyHash = KeyHash.toHex(authorKeyHash)
  const witnesses = transaction.witnessSet.vkeyWitnesses || []
  const authorWitnesses = witnesses.filter((witness) => KeyHash.toHex(KeyHash.fromVKey(witness.vkey)) === expectedKeyHash)
  requireCondition(authorWitnesses.length === 1, "author_witness_missing")
  const bodyHash = hashTransactionRaw(Buffer.from(TransactionBody.toCBORHex(transaction.body), "hex"))
  const witness = authorWitnesses[0]
  requireCondition(
    VKey.verify(witness.vkey, bodyHash.hash, Ed25519Signature.toBytes(witness.signature)),
    "invalid_author_signature"
  )
}

function transactionNetworkId(body) {
  const outputNetworkIds = new Set(body.outputs.map((output) => output.address.networkId))
  requireCondition(outputNetworkIds.size === 1, "ambiguous_network")
  const outputNetworkId = [...outputNetworkIds][0]
  requireCondition(body.networkId === undefined || body.networkId === outputNetworkId, "network_mismatch")
  return outputNetworkId
}

class VerificationError extends Error {
  constructor(reason) {
    super(reason)
    this.reason = reason
  }
}

function requireCondition(condition, reason) {
  if (!condition) fail(reason)
}

function fail(reason) {
  throw new VerificationError(reason)
}
