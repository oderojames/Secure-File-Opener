import { Router } from "express";
import OpenAI from "openai";

const router = Router();

function getOpenAIClient() {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");
  let baseURL: string | undefined;
  if (apiKey.startsWith("sk-or-")) baseURL = "https://openrouter.ai/api/v1";
  if (apiKey.startsWith("nvapi-")) baseURL = "https://integrate.api.nvidia.com/v1";
  return new OpenAI({ apiKey, ...(baseURL && { baseURL }) });
}

function getModel(apiKey: string) {
  if (apiKey.startsWith("sk-or-")) return "openai/gpt-4o";
  if (apiKey.startsWith("nvapi-")) return "nvidia/llama-3.3-nemotron-super-49b-v1";
  return "gpt-4o";
}

router.post("/analyze/mpesa", async (req, res) => {
  const { text } = req.body as { text?: string };

  if (!text || typeof text !== "string" || text.trim().length < 10) {
    res.status(400).json({ error: "No valid PDF text content provided." });
    return;
  }

  const prompt = `You are a financial analyst specializing in M-Pesa mobile money statements from Kenya.

The following is raw text extracted from an M-Pesa statement PDF. Analyze ALL transactions carefully and return a JSON object with this exact structure:

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

CRITICAL RULES:
1. INCOME ONLY — count ONLY money coming IN to the account:
   - "Received from" / "You received" / "Cash received"
   - "Paid to you" / "Payment received" / "Business payment received"
   - "Deposited by agent" / "M-Pesa deposit" / "Reversal credit"
   - Any positive credit to the M-Pesa account
2. EXCLUDE all outgoing money: withdrawals, payments sent, airtime, M-Pesa charges, transfers out, "pay bill", "send money", "buy goods".
3. Parse dates from whatever format appears in the statement (e.g. "15/01/2024", "Jan 15, 2024", "15 Jan 2024").
4. Amounts in KES. Strip commas before parsing numbers (e.g. "1,500.00" → 1500.00).
5. Trust score 0–100:
   - 80–100 Excellent: consistent, frequent, growing income
   - 60–79 Good: reasonably regular income
   - 40–59 Fair: irregular or sporadic
   - 0–39 Poor: very low, rare, or no income found
6. If no transactions are found, return empty arrays and score 0 with a clear reasoning.
7. Return ONLY raw valid JSON — no markdown fences, no extra text before or after.

M-Pesa Statement Text:
${text.substring(0, 20000)}`;

  try {
    const apiKey = process.env["OPENAI_API_KEY"] ?? "";
    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: getModel(apiKey),
      max_tokens: 2000,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.choices[0]?.message?.content ?? "";

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      res.status(500).json({ error: "AI returned unreadable response.", raw: content.substring(0, 300) });
      return;
    }

    res.json(parsed);
  } catch (err: any) {
    req.log.error({ err }, "Analysis failed");
    res.status(500).json({ error: err.message || "Analysis failed. Please try again." });
  }
});

export default router;
