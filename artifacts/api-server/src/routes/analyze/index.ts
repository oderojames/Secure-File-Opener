import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

router.post("/analyze/mpesa", async (req, res) => {
  const { text } = req.body as { text?: string };

  if (!text || typeof text !== "string" || text.trim().length < 10) {
    res.status(400).json({ error: "No valid PDF text content provided." });
    return;
  }

  const prompt = `You are a financial analyst specializing in M-Pesa mobile money statements.

The following is raw text extracted from an M-Pesa statement PDF. Analyze it thoroughly and return a JSON object with this exact structure:

{
  "dailyIncome": [
    { "date": "YYYY-MM-DD", "amount": 1234.50, "transactionCount": 3 }
  ],
  "monthlyIncome": [
    { "month": "YYYY-MM", "label": "January 2024", "amount": 5678.00, "transactionCount": 12 }
  ],
  "trustScore": {
    "score": 72,
    "label": "Good",
    "reasoning": "Brief explanation of the score",
    "factors": [
      { "name": "Income Consistency", "impact": "positive", "detail": "Regular weekly income..." },
      { "name": "Frequency", "impact": "positive", "detail": "..." },
      { "name": "Volatility", "impact": "negative", "detail": "..." }
    ]
  },
  "summary": {
    "totalIncome": 9876.50,
    "averageMonthlyIncome": 3292.17,
    "averageDailyIncome": 108.50,
    "currency": "KES",
    "periodStart": "YYYY-MM-DD",
    "periodEnd": "YYYY-MM-DD",
    "totalTransactions": 45
  }
}

Rules:
- Only count INCOMING transactions as income (money received, deposits). Exclude withdrawals, payments, transfers out, airtime purchases, M-Pesa charges, and any money sent OUT.
- Incoming transactions include: "received from", "deposited", "paid by", "from ", customer deposits, and similar credit entries.
- Amounts should be in KES (Kenyan Shillings).
- Trust score (0-100): 
  - 80-100 = Excellent: very consistent, high-frequency income
  - 60-79 = Good: reasonably consistent
  - 40-59 = Fair: some inconsistency
  - 0-39 = Poor: very irregular or low income
  - Base it on: income consistency, frequency, average amounts, and growth trend.
- If you cannot find clear transaction data, still return the structure with empty arrays and a trust score of 0 with reasoning explaining the issue.
- Return ONLY valid JSON, no markdown, no explanation outside the JSON.

M-Pesa Statement Text:
${text.substring(0, 15000)}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.1",
      max_completion_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.choices[0]?.message?.content ?? "";

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        res.status(500).json({ error: "AI returned unreadable response.", raw: content.substring(0, 200) });
        return;
      }
    }

    res.json(parsed);
  } catch (err: any) {
    req.log.error({ err }, "Analysis failed");
    res.status(500).json({ error: "Analysis failed. Please try again." });
  }
});

export default router;
