import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

router.post("/analyze/mpesa", async (req, res) => {
  const { text } = req.body as { text?: string };

  if (!text || typeof text !== "string" || text.trim().length < 10) {
    res.status(400).json({ error: "No valid PDF text content provided." });
    return;
  }

  const prompt = `You are a senior credit analyst specializing in mobile money (M-Pesa) statement analysis for creditworthiness assessment in Kenya.

Analyze the following M-Pesa statement text thoroughly. Extract every transaction and produce a detailed credit risk report.

Return ONLY a raw JSON object (no markdown, no extra text) matching this exact structure:

{
  "dailyIncome": [
    { "date": "YYYY-MM-DD", "amount": 1234.50, "transactionCount": 3 }
  ],
  "monthlyIncome": [
    { "month": "YYYY-MM", "label": "January 2024", "amount": 5678.00, "transactionCount": 12 }
  ],
  "trustScore": {
    "score": 74,
    "grade": "B+",
    "label": "Good Credit",
    "creditLimit": 45000,
    "reasoning": "2-3 sentence overall assessment of creditworthiness",
    "factors": [
      { "name": "Income Stability", "score": 80, "weight": 30, "impact": "positive", "detail": "Consistent monthly inflows averaging KES X over Y months" },
      { "name": "Income Frequency", "score": 70, "weight": 20, "impact": "positive", "detail": "Regular transactions suggest stable income source" },
      { "name": "Cash Flow Balance", "score": 65, "weight": 20, "impact": "neutral", "detail": "Ratio of income to expenditure" },
      { "name": "Transaction Diversity", "score": 60, "weight": 10, "impact": "neutral", "detail": "Multiple income sources reduce risk" },
      { "name": "Account Longevity", "score": 75, "weight": 10, "impact": "positive", "detail": "Statement spans X months" },
      { "name": "Repayment Signals", "score": 50, "weight": 10, "impact": "negative", "detail": "Evidence of loan repayments or fuliza usage" }
    ],
    "riskLevel": "Medium",
    "recommendation": "Approve with conditions"
  },
  "summary": {
    "totalIncome": 9876.50,
    "totalExpenditure": 6543.20,
    "netCashFlow": 3333.30,
    "averageMonthlyIncome": 3292.17,
    "averageDailyIncome": 108.50,
    "peakIncomeMonth": "January 2024",
    "lowestIncomeMonth": "March 2024",
    "currency": "KES",
    "periodStart": "YYYY-MM-DD",
    "periodEnd": "YYYY-MM-DD",
    "totalTransactions": 45,
    "incomeTransactions": 20,
    "expenditureTransactions": 25
  }
}

ANALYSIS RULES:

INCOME (credits — include these):
- "Received from", "You received", "Cash received", "Paid to you"
- "Business payment received", "Payment received", "Reversal credit"
- "Deposited by agent", "M-Pesa deposit"
- Any positive credit to the account

EXPENDITURE (debits — track but do NOT count as income):
- Withdrawals, "Send money", "Pay bill", "Buy goods"
- Airtime purchases, M-Pesa transaction charges
- "Fuliza" or loan repayments (flag these — they affect creditworthiness)
- Any money leaving the account

TRUST SCORE CALCULATION (0–100, weighted):
- Income Stability (30%): Consistency of monthly income. High = similar amounts each month. Low = erratic.
- Income Frequency (20%): How often money comes in. Daily/weekly = high. Monthly only = medium.
- Cash Flow Balance (20%): Net income after expenditure. Positive surplus = good. Chronic deficit = poor.
- Transaction Diversity (10%): Multiple different income sources = lower risk.
- Account Longevity (10%): More months of data = more reliable score.
- Repayment Signals (10%): Fuliza/KCB M-Pesa/loan repayments reduce score. None found = good.

GRADE SCALE:
- 85–100: A (Excellent Credit) — recommend up to 3x avg monthly income as credit limit
- 70–84: B+ (Good Credit) — recommend up to 2x avg monthly income
- 55–69: C (Fair Credit) — recommend up to 1x avg monthly income
- 40–54: D (Poor Credit) — recommend up to 0.5x avg monthly income
- 0–39: F (Very Poor / No Credit) — do not recommend credit

RISK LEVELS: Low (85+), Medium (65–84), High (40–64), Very High (0–39)
RECOMMENDATIONS: "Approve", "Approve with conditions", "Further review required", "Decline"

If no transactions found: return empty arrays, score 0, grade F, reasoning explaining why.
Parse all date formats (DD/MM/YYYY, MMM DD YYYY, etc.). Strip commas from amounts.

M-Pesa Statement:
${text.substring(0, 20000)}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.1",
      max_completion_tokens: 8192,
      messages: [
        {
          role: "system",
          content: "You are a financial credit analyst. Always respond with valid JSON only — no markdown, no explanation outside the JSON object.",
        },
        { role: "user", content: prompt },
      ],
    });

    const content = response.choices[0]?.message?.content ?? "";

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch {
          res.status(500).json({ error: "AI returned malformed JSON.", raw: content.substring(0, 300) });
          return;
        }
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
