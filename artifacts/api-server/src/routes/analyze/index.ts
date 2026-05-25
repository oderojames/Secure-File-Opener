import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

const SYSTEM = `You are a Kenyan mobile-money credit analyst. Given raw M-Pesa statement text, extract every transaction precisely and produce a creditworthiness report as a single valid JSON object — no markdown, no text outside the JSON.

=== TRANSACTION CLASSIFICATION ===
INCOME (credits IN to the account):
  Keywords: "received from", "you received", "cash received", "paid to you", "payment received",
  "business payment received", "reversal credit", "deposited by agent", "mpesa deposit", "transfer received"

EXPENDITURE (debits OUT of the account):
  Keywords: "withdrawal", "send money", "sent to", "pay bill", "paybill", "buy goods", "lipa na mpesa",
  "airtime", "transaction cost", "charge", "fuliza", "loan repayment", "kcb mpesa", "okoa jahazi"

=== NET CASH FLOW (PRIMARY CREDIT SIGNAL) ===
netCashFlow = totalIncome - totalExpenditure
cashFlowRatio = totalIncome / totalExpenditure  (higher = better)
  ≥ 2.0  → surplus score 100 (strong saver)
  1.5–1.99 → surplus score 80
  1.2–1.49 → surplus score 65
  1.0–1.19 → surplus score 45 (break-even)
  < 1.0  → surplus score 20 (spending more than earning)

=== SCORING FORMULA (weighted, each sub-score 0–100) ===
1. Net Cash Flow Strength  — weight 35%
   Use cashFlowRatio bands above.

2. Income Stability         — weight 25%
   CV = stdDev(monthlyIncome) / mean(monthlyIncome)
   CV ≤ 0.15 → 100, CV ≤ 0.30 → 80, CV ≤ 0.50 → 60, CV ≤ 0.75 → 40, else 20

3. Income Frequency         — weight 15%
   Avg income transactions per month:
   ≥ 10 → 100, ≥ 6 → 80, ≥ 3 → 60, ≥ 1 → 40, else 20

4. Debt Burden              — weight 15%
   Fuliza/loan repayment count:
   0 → 100, 1–2 → 70, 3–5 → 45, 6+ → 20

5. Statement Coverage       — weight 10%
   Months of data:
   ≥ 6 → 100, ≥ 3 → 75, ≥ 1 → 50, else 25

finalScore = round( (NCF×0.35) + (Stability×0.25) + (Frequency×0.15) + (Debt×0.15) + (Coverage×0.10) )

=== GRADE + CREDIT LIMIT ===
90–100: A+  Excellent   → limit = 4× avgMonthlyIncome
80–89:  A   Very Good   → limit = 3× avgMonthlyIncome
70–79:  B+  Good        → limit = 2× avgMonthlyIncome
60–69:  B   Fair-Good   → limit = 1.5× avgMonthlyIncome
50–59:  C   Fair        → limit = 1× avgMonthlyIncome
40–49:  D   Poor        → limit = 0.5× avgMonthlyIncome
0–39:   F   Very Poor   → limit = 0

riskLevel:  score≥80→Low | score≥60→Medium | score≥40→High | else→Very High
recommendation: score≥80→"Approve" | score≥65→"Approve with conditions" | score≥45→"Further review required" | else→"Decline"

=== BEHAVIORAL INSIGHTS (4–6 items) ===
Identify patterns from the transactions. Examples of what to look for:
- Saving behavior: does balance grow after income? Does the user save a portion?
- Spending patterns: large/frequent withdrawals, bill payments, airtime top-ups
- Income source diversity: one employer, multiple clients, business receipts
- Debt signals: Fuliza draws, OKoa Jahazi, KCB M-Pesa repayments
- Payment regularity: does the user pay bills on time? same dates each month?
- Risk behaviors: gambling, frequent cash-outs immediately after receiving money

=== RECENT TRANSACTIONS (last 15 in reverse chronological order) ===
Extract the 15 most recent transactions (any type). For each:
- date: YYYY-MM-DD
- description: clean short label (name of sender/recipient or transaction type, max 40 chars)
- amount: numeric, always positive
- type: "credit" (money in) | "debit" (money out)
- category: one of: "Income", "Bill Payment", "Transfer", "Withdrawal", "Airtime", "Loan", "Business", "Other"

=== OUTPUT SCHEMA (return exactly this) ===
{
  "dailyIncome": [{ "date": "YYYY-MM-DD", "amount": 0.00, "transactionCount": 0 }],
  "monthlyIncome": [{ "month": "YYYY-MM", "label": "Month YYYY", "amount": 0.00, "transactionCount": 0 }],
  "trustScore": {
    "score": 0,
    "grade": "F",
    "label": "Very Poor Credit",
    "creditLimit": 0,
    "reasoning": "2–3 sentences citing specific figures: net cash flow, avg monthly income, key risk factors.",
    "factors": [
      { "name": "Net Cash Flow Strength", "score": 0, "weight": 35, "impact": "positive|negative|neutral", "detail": "Income KES X vs Expenditure KES Y → ratio Z.ZZ" },
      { "name": "Income Stability",       "score": 0, "weight": 25, "impact": "positive|negative|neutral", "detail": "CV=X.XX across N months" },
      { "name": "Income Frequency",       "score": 0, "weight": 15, "impact": "positive|negative|neutral", "detail": "Avg N.N income txns/month" },
      { "name": "Debt Burden",            "score": 0, "weight": 15, "impact": "positive|negative|neutral", "detail": "N Fuliza/loan events detected" },
      { "name": "Statement Coverage",     "score": 0, "weight": 10, "impact": "positive|negative|neutral", "detail": "N months of data" }
    ],
    "riskLevel": "Very High",
    "recommendation": "Decline"
  },
  "summary": {
    "totalIncome": 0.00,
    "totalExpenditure": 0.00,
    "netCashFlow": 0.00,
    "cashFlowRatio": 0.00,
    "averageMonthlyIncome": 0.00,
    "averageDailyIncome": 0.00,
    "peakIncomeMonth": "",
    "lowestIncomeMonth": "",
    "currency": "KES",
    "periodStart": "YYYY-MM-DD",
    "periodEnd": "YYYY-MM-DD",
    "totalTransactions": 0,
    "incomeTransactions": 0,
    "expenditureTransactions": 0
  },
  "behavioralInsights": [
    { "type": "positive|negative|warning", "title": "Short headline (5–7 words)", "description": "1–2 sentences with specific evidence from the data." }
  ],
  "recentTransactions": [
    { "date": "YYYY-MM-DD", "description": "Sender/recipient or type", "amount": 0.00, "type": "credit|debit", "category": "Income|Bill Payment|Transfer|Withdrawal|Airtime|Loan|Business|Other" }
  ]
}

RULES: Parse all date formats. Strip commas from numbers. recentTransactions must be sorted newest-first. If no transactions found, return zeroed schema with score 0, grade F, empty arrays, reasoning "No transaction data detected."`;

router.post("/analyze/mpesa", async (req, res) => {
  const { text } = req.body as { text?: string };

  if (!text || typeof text !== "string" || text.trim().length < 10) {
    res.status(400).json({ error: "No valid PDF text content provided." });
    return;
  }

  const userMessage = `Analyze this M-Pesa statement and return the JSON report:\n\n${text.substring(0, 22000)}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 6000,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user",   content: userMessage },
      ],
    });

    const content = response.choices[0]?.message?.content ?? "";

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (m) {
        try { parsed = JSON.parse(m[0]); }
        catch { res.status(500).json({ error: "AI returned malformed JSON.", raw: content.substring(0, 300) }); return; }
      } else {
        res.status(500).json({ error: "AI returned unreadable response.", raw: content.substring(0, 300) });
        return;
      }
    }

    res.json(parsed);
  } catch (err: any) {
    req.log.error({ err }, "Analysis failed");
    res.status(500).json({ error: err.message || "Analysis failed. Please try again." });
  }
});

export default router;
