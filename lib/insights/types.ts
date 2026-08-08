export type EvidenceRef = {
  itemId: string
  claimId: string
  statement: string
}

export type DetectorResult = {
  title: string
  summary: string
  evidence: EvidenceRef[]
}
