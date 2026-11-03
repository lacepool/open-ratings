import * as TransactionMetadatum from "@evolution-sdk/evolution/TransactionMetadatum"

export const OPEN_RATINGS_LABEL = 1668n
export const OPEN_RATINGS_TYPE = "dapp-rating"
export const OPEN_RATINGS_PROTOCOL = "open-ratings"
export const OPEN_RATINGS_VERSION = 0

export function buildOpenRatingsMetadata({ ratings, voterId, id }) {
  const payload = {
    type: OPEN_RATINGS_TYPE,
    protocol: OPEN_RATINGS_PROTOCOL,
    version: OPEN_RATINGS_VERSION,
    uuid: id,
    voterId,
    ratings: ratings.map(({ dappId, rating }) => ({ dappId, rating }))
  }

  return {
    label: OPEN_RATINGS_LABEL,
    payload,
    metadatum: TransactionMetadatum.fromEntries([
      ["type", payload.type],
      ["protocol", payload.protocol],
      ["version", BigInt(payload.version)],
      ["uuid", payload.uuid],
      ["voterId", payload.voterId],
      [
        "ratings",
        TransactionMetadatum.array(
          payload.ratings.map((entry) =>
            TransactionMetadatum.fromEntries([
              ["dappId", entry.dappId],
              ["rating", BigInt(entry.rating)]
            ])
          )
        )
      ]
    ])
  }
}
