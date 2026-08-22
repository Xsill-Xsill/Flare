// Manual eval script for the claims-extraction prompt (lib/prompts/claims-extraction.ts).
// Run with: pnpm eval:claims
//
// This is intentionally not a Jest/Vitest suite — per
// prompt_engineering_principles.md §12/§13, prompt evals are meant to be run by a human
// against the live model after any prompt change, read the printed detail, and judged by eye
// as well as by the pass/fail counts. It requires GROQ_API_KEY to be set in the environment;
// without it every case fails gracefully (see catch blocks below) rather than crashing.

import { z } from 'zod'
import { extractClaims } from '@/lib/ingestion/claims'

type EvalCategory = 'good' | 'bad' | 'edge'

type EvalCase = {
  id: string
  category: EvalCategory
  description: string
  text: string
  expectedMinClaims: number
  expectedMaxClaims: number
}

const EVAL_CASES: EvalCase[] = [
  {
    id: 'interview-with-numbers',
    category: 'good',
    description: 'User interview with concrete numbers — should yield specific, quantified claims',
    text: "Interview with Sarah, owner of a 6-person marketing agency. She said her team currently spends about 5 hours every week manually reconciling invoices across QuickBooks and Stripe. She said she'd switch to a tool that automated it if it saved at least 3 hours a week.",
    expectedMinClaims: 1,
    expectedMaxClaims: 4,
  },
  {
    id: 'personal-note-hypothesis',
    category: 'good',
    description: 'Personal note with a concrete observation and a testable hypothesis',
    text: 'Noticed three different users asked about a Slack integration this week, all on the same day. My hypothesis: teams that already run heavily on Slack churn faster without one. Want to prioritize this for next sprint.',
    expectedMinClaims: 1,
    expectedMaxClaims: 3,
  },
  {
    id: 'article-market-stat',
    category: 'good',
    description: 'URL/article capture — should extract the market signal, not restate the headline generically',
    text: 'Article from Crunchbase News: Global venture funding for climate tech startups reached $18.2B in the first half of the year, up 22% from the same period last year, driven largely by battery storage deals.',
    expectedMinClaims: 1,
    expectedMaxClaims: 3,
  },
  {
    id: 'audio-transcript-pain',
    category: 'good',
    description: 'Audio transcript describing a concrete user pain point',
    text: "Transcript: honestly the biggest headache for us is exporting reports to PDF — it crashes maybe one out of every five times and we lose all our filters when it does. I've already complained about this to support twice.",
    expectedMinClaims: 1,
    expectedMaxClaims: 3,
  },
  {
    id: 'generic-platitude',
    category: 'bad',
    description: 'Generic startup-world platitude with no concrete claim — should extract nothing',
    text: 'Software is eating the world. Every company is becoming a tech company. Innovation drives growth.',
    expectedMinClaims: 0,
    expectedMaxClaims: 0,
  },
  {
    id: 'word-salad',
    category: 'bad',
    description: 'Incoherent, unrelated word fragments — should extract nothing',
    text: 'purple banana quickly run yesterday xylophone integer runs blue seventeen maybe',
    expectedMinClaims: 0,
    expectedMaxClaims: 0,
  },
  {
    id: 'single-concrete-fact',
    category: 'edge',
    description: 'Exactly one short but concrete, specific fact — boundary of "enough signal to extract"',
    text: 'We closed our first paying customer today at $49/month.',
    expectedMinClaims: 1,
    expectedMaxClaims: 2,
  },
  {
    id: 'mixed-generic-and-concrete',
    category: 'edge',
    description: 'One generic sentence plus one concrete data point — should keep only the concrete one',
    text: 'Growth is important for every startup. That said, we specifically saw signups drop 18% the week after we removed the free trial banner from the homepage.',
    expectedMinClaims: 1,
    expectedMaxClaims: 3,
  },
]

const JudgeSchema = z.object({
  grounded: z.boolean(),
  specific: z.boolean(),
})

export async function judgeClaimQuality(claim: string, sourceText: string): Promise<{ grounded: boolean; specific: boolean }> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content:
            "You are evaluating the quality of a claim extracted from a source text for a startup founder's second-brain app.",
        },
        {
          role: 'user',
          content: `<source_text>\n${sourceText}\n</source_text>\n<claim>\n${claim}\n</claim>\n\nIs this claim grounded in the source text and specific (not generic)? Return JSON: {"grounded": bool, "specific": bool}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.0,
    }),
  })

  if (!response.ok) {
    throw new Error(`Groq judge call failed: ${response.status} ${await response.text()}`)
  }

  const data = await response.json()
  const parsed = JSON.parse(data.choices[0].message.content)
  const result = JudgeSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(`Judge response failed schema validation: ${result.error.message}`)
  }
  return result.data
}

function findDuplicates(claims: string[]): string[] {
  return claims.filter((claim, index) => claims.indexOf(claim) !== index)
}

async function runEval(): Promise<void> {
  if (!process.env.GROQ_API_KEY) {
    console.warn('GROQ_API_KEY is not set — every case below will fail (this is expected, not a crash).\n')
  }

  let passedCount = 0
  let totalClaims = 0
  let judgedClaims = 0
  let groundedClaims = 0
  let specificClaims = 0

  for (const testCase of EVAL_CASES) {
    console.log(`\n=== ${testCase.id} [${testCase.category}] ===`)
    console.log(testCase.description)

    let result: string[] = []
    let errorMessage: string | null = null
    try {
      result = await extractClaims(testCase.text)
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err)
    }

    const tooShort = result.filter((claim) => claim.length < 10)
    const duplicates = findDuplicates(result)
    const countInRange = result.length >= testCase.expectedMinClaims && result.length <= testCase.expectedMaxClaims
    const casePassed = errorMessage === null && countInRange && tooShort.length === 0 && duplicates.length === 0

    if (casePassed) passedCount++
    totalClaims += result.length

    console.log(
      `${casePassed ? 'PASS' : 'FAIL'} — ${result.length} claim(s) (expected ${testCase.expectedMinClaims}-${testCase.expectedMaxClaims})`
    )
    if (errorMessage) console.log(`  error: ${errorMessage}`)
    if (tooShort.length > 0) console.log(`  too-short claims (<10 chars): ${JSON.stringify(tooShort)}`)
    if (duplicates.length > 0) console.log(`  duplicate claims: ${JSON.stringify(duplicates)}`)
    for (const claim of result) console.log(`  - ${claim}`)

    for (const claim of result) {
      judgedClaims++
      try {
        const judgment = await judgeClaimQuality(claim, testCase.text)
        if (judgment.grounded) groundedClaims++
        if (judgment.specific) specificClaims++
      } catch (err) {
        console.log(`  judge failed for "${claim}": ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  const avgClaimsPerItem = (totalClaims / EVAL_CASES.length).toFixed(1)
  const groundedPct = judgedClaims > 0 ? Math.round((groundedClaims / judgedClaims) * 100) : 0
  const specificPct = judgedClaims > 0 ? Math.round((specificClaims / judgedClaims) * 100) : 0

  console.log(`\n${'='.repeat(60)}`)
  console.log(
    `${passedCount}/${EVAL_CASES.length} passed | Avg claims per item: ${avgClaimsPerItem} | Grounded: ${groundedPct}% | Specific: ${specificPct}%`
  )
}

runEval().catch((err) => {
  console.error('eval:claims crashed unexpectedly', err)
  process.exitCode = 1
})
