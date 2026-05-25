import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawTransaction {
  date: string;        // YYYY-MM-DD
  amount: number;      // always positive
  type: "credit" | "debit";
  description: string; // max 50 chars
  category: string;    // Income | Bill Payment | Transfer | Withdrawal | Airtime | Loan | Business | Other
}

interface BehavioralInsight {
  type: "positive" | "negative" | "warning";
  title: string;
  description: string;
}

// ─── Extraction prompt (AI job: parse transactions only) ───────────────────────

const EXTRACT_SYSTEM = `You are a Kenyan M-Pesa statement parser. Extract EVERY transaction from the text and return ONLY a raw JSON array — no markdown, no extra text.

CLASSIFICATION RULES (apply in order, first match wins):

CREDIT (type="credit") — line contains any of:
  "received from" | "you received" | "cash received" | "paid to you" | "payment received"
  "business payment received" | "reversal credit" | "deposited by agent" | "mpesa deposit" | "transfer received"

DEBIT (type="debit") — line contains any of:
  "withdrawal" | "send money" | "sent to" | "pay bill" | "paybill" | "buy goods" | "lipa na mpesa"
  "airtime" | "transaction cost" | "charge" | "fuliza" | "loan repayment" | "kcb mpesa" | "okoa jahazi"

Lines matching NEITHER type → skip completely.

CATEGORY rules:
  credit transactions → "Income" (default) or "Business" if payer name looks like a company
  "pay bill" | "paybill" | "buy goods" → "Bill Payment"
  "send money" | "sent to" | "transfer" → "Transfer"
  "withdrawal" → "Withdrawal"
  "airtime" → "Airtime"
  "fuliza" | "loan" | "kcb mpesa" | "okoa jahazi" → "Loan"
  everything else → "Other"

OUTPUT FORMAT — return exactly this JSON array:
[
  {
    "date": "YYYY-MM-DD",
    "amount": 1234.56,
    "type": "credit",
    "description": "Received from John Doe",
    "category": "Income"
  }
]

Parse all date formats (DD/MM/YYYY, MMM DD YYYY, DD-MMM-YYYY, etc.) to YYYY-MM-DD.
Strip commas from amounts. Amount is always a positive number.
Return [] if no transactions found.`;

const INSIGHTS_SYSTEM = `You are a Kenyan credit analyst. Given computed financial metrics, write 4–6 behavioral insights. Return ONLY a raw JSON array — no markdown.

Each insight:
{ "type": "positive"|"negative"|"warning", "title": "5–8 word headline", "description": "1–2 sentences citing specific figures." }

Analyze: saving behavior, spending patterns, income diversity, debt signals, payment regularity, cash-out habits.`;

// ─── Deterministic scoring engine ─────────────────────────────────────────────

function computeScore(txs: RawTransaction[]) {
  const credits = txs.filter(t => t.type === "credit");
  const debits  = txs.filter(t => t.type === "debit");

  const totalIncome      = round2(credits.reduce((s, t) => s + t.amount, 0));
  const totalExpenditure = round2(debits.reduce((s, t) => s + t.amount, 0));
  const netCashFlow      = round2(totalIncome - totalExpenditure);
  const cashFlowRatio    = totalExpenditure === 0 ? 2.0 : round2(totalIncome / totalExpenditure);

  // Group income by YYYY-MM
  const monthMap: Record<string, { sum: number; count: number }> = {};
  for (const t of txs) {
    const ym = t.date.substring(0, 7);
    if (!monthMap[ym]) monthMap[ym] = { sum: 0, count: 0 };
    monthMap[ym].sum   += t.type === "credit" ? t.amount : 0;
    monthMap[ym].count += t.type === "credit" ? 1 : 0;
  }
  const months = Object.keys(monthMap).sort();
  const monthCount = months.length || 1;

  const monthlyIncomes = months.map(m => monthMap[m].sum);
  const avgMonthlyIncome = round2(totalIncome / monthCount);
  const avgDailyIncome   = round2(totalIncome / Math.max(daySpan(txs), 1));

  // Income frequency
  const totalIncomeCount = credits.length;
  const avgIncomePerMonth = totalIncomeCount / monthCount;

  // Debt count
  const debtCount = txs.filter(t =>
    /fuliza|loan repayment|kcb mpesa|okoa jahazi/i.test(t.description)
  ).length;

  // Peak / lowest income months
  const incomeByMonth = months.map(m => ({ month: m, amount: monthMap[m].sum, count: monthMap[m].count }));
  const peak   = incomeByMonth.reduce((a, b) => b.amount > a.amount ? b : a, incomeByMonth[0] ?? { month: "", amount: 0, count: 0 });
  const lowest = incomeByMonth.reduce((a, b) => b.amount < a.amount ? b : a, incomeByMonth[0] ?? { month: "", amount: 0, count: 0 });

  // ── Factor scores (exact lookup tables) ──
  const F1 = cashFlowRatio >= 2.0 ? 100 : cashFlowRatio >= 1.5 ? 80 : cashFlowRatio >= 1.2 ? 65 : cashFlowRatio >= 1.0 ? 45 : 20;

  const mean = avgMonthlyIncome;
  const cv = mean === 0 ? 1 : (() => {
    const variance = monthlyIncomes.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / monthlyIncomes.length;
    return Math.sqrt(variance) / mean;
  })();
  const F2 = cv <= 0.15 ? 100 : cv <= 0.30 ? 80 : cv <= 0.50 ? 60 : cv <= 0.75 ? 40 : 20;

  const F3 = avgIncomePerMonth >= 10 ? 100 : avgIncomePerMonth >= 6 ? 80 : avgIncomePerMonth >= 3 ? 60 : avgIncomePerMonth >= 1 ? 40 : 20;

  const F4 = debtCount === 0 ? 100 : debtCount <= 2 ? 70 : debtCount <= 5 ? 45 : 20;

  const F5 = monthCount >= 6 ? 100 : monthCount >= 3 ? 75 : monthCount >= 1 ? 50 : 25;

  const finalScore = Math.round(F1 * 0.35 + F2 * 0.25 + F3 * 0.15 + F4 * 0.15 + F5 * 0.10);

  // Grade + credit limit
  const { grade, label, limitMult } = gradeFor(finalScore);
  const creditLimit = Math.round(avgMonthlyIncome * limitMult);

  const riskLevel = finalScore >= 80 ? "Low" : finalScore >= 60 ? "Medium" : finalScore >= 40 ? "High" : "Very High";
  const recommendation = finalScore >= 80 ? "Approve" : finalScore >= 65 ? "Approve with conditions" : finalScore >= 45 ? "Further review required" : "Decline";

  const factors = [
    { name: "Net Cash Flow Strength", score: F1, weight: 35, impact: impactOf(F1), detail: `Income KES ${fmt(totalIncome)} vs Expenditure KES ${fmt(totalExpenditure)} → ratio ${cashFlowRatio.toFixed(2)}` },
    { name: "Income Stability",       score: F2, weight: 25, impact: impactOf(F2), detail: `CV=${cv.toFixed(2)} across ${monthCount} month${monthCount !== 1 ? "s" : ""}` },
    { name: "Income Frequency",       score: F3, weight: 15, impact: impactOf(F3), detail: `Avg ${avgIncomePerMonth.toFixed(1)} income txn${avgIncomePerMonth !== 1 ? "s" : ""}/month` },
    { name: "Debt Burden",            score: F4, weight: 15, impact: impactOf(F4), detail: `${debtCount} Fuliza/loan event${debtCount !== 1 ? "s" : ""} detected` },
    { name: "Statement Coverage",     score: F5, weight: 10, impact: impactOf(F5), detail: `${monthCount} month${monthCount !== 1 ? "s" : ""} of data` },
  ] as const;

  // Daily income map (for schema compat)
  const dayMap: Record<string, { sum: number; count: number }> = {};
  for (const t of credits) {
    if (!dayMap[t.date]) dayMap[t.date] = { sum: 0, count: 0 };
    dayMap[t.date].sum   += t.amount;
    dayMap[t.date].count += 1;
  }
  const dailyIncome = Object.keys(dayMap).sort().map(d => ({ date: d, amount: round2(dayMap[d].sum), transactionCount: dayMap[d].count }));
  const monthlyIncome = incomeByMonth.map(m => ({ month: m.month, label: monthLabel(m.month), amount: round2(m.amount), transactionCount: m.count }));

  return {
    metrics: { totalIncome, totalExpenditure, netCashFlow, cashFlowRatio, avgMonthlyIncome, avgDailyIncome,
      monthCount, avgIncomePerMonth, debtCount, totalIncomeCount, totalTransactions: txs.length,
      incomeTransactions: credits.length, expenditureTransactions: debits.length,
      periodStart: txs[0]?.date ?? "", periodEnd: txs[txs.length - 1]?.date ?? "",
      peakIncomeMonth: peak.month, lowestIncomeMonth: lowest.month, cv,
    },
    score: { finalScore, grade, label, creditLimit, riskLevel, recommendation, factors },
    dailyIncome,
    monthlyIncome,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function round2(n: number) { return Math.round(n * 100) / 100; }
function fmt(n: number) { return n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function impactOf(score: number): "positive" | "neutral" | "negative" { return score >= 70 ? "positive" : score >= 45 ? "neutral" : "negative"; }

function daySpan(txs: RawTransaction[]) {
  if (!txs.length) return 1;
  const dates = txs.map(t => new Date(t.date).getTime()).filter(d => !isNaN(d));
  return Math.max(1, Math.round((Math.max(...dates) - Math.min(...dates)) / 86_400_000) + 1);
}

function gradeFor(score: number): { grade: string; label: string; limitMult: number } {
  if (score >= 90) return { grade: "A+", label: "Excellent Credit",   limitMult: 4 };
  if (score >= 80) return { grade: "A",  label: "Very Good Credit",   limitMult: 3 };
  if (score >= 70) return { grade: "B+", label: "Good Credit",        limitMult: 2 };
  if (score >= 60) return { grade: "B",  label: "Fair-Good Credit",   limitMult: 1.5 };
  if (score >= 50) return { grade: "C",  label: "Fair Credit",        limitMult: 1 };
  if (score >= 40) return { grade: "D",  label: "Poor Credit",        limitMult: 0.5 };
  return { grade: "F", label: "Very Poor Credit", limitMult: 0 };
}

function monthLabel(ym: string) {
  const [y, m] = ym.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m, 10) - 1] ?? m} ${y}`;
}

// ─── Route ────────────────────────────────────────────────────────────────────

router.post("/analyze/mpesa", async (req, res) => {
  const { text } = req.body as { text?: string };
  if (!text || typeof text !== "string" || text.trim().length < 10) {
    res.status(400).json({ error: "No valid PDF text content provided." });
    return;
  }

  try {
    // ── Pass 1: extract raw transactions (deterministic at temperature 0) ──
    const extractResp = await openai.chat.completions.create({
      model: "gpt-5.4",
      temperature: 0,
      seed: 42,
      max_completion_tokens: 4000,
      messages: [
        { role: "system", content: EXTRACT_SYSTEM },
        { role: "user",   content: `Extract all transactions from this M-Pesa statement:\n\n${text.substring(0, 22000)}` },
      ],
    });

    const rawContent = extractResp.choices[0]?.message?.content ?? "[]";
    let transactions: RawTransaction[] = [];
    try {
      const arr = JSON.parse(rawContent);
      transactions = Array.isArray(arr) ? arr : [];
    } catch {
      const m = rawContent.match(/\[[\s\S]*\]/);
      if (m) { try { transactions = JSON.parse(m[0]); } catch { transactions = []; } }
    }

    // ── Compute all metrics deterministically on the server ──
    const { metrics, score, dailyIncome, monthlyIncome } = computeScore(transactions);

    // ── Pass 2: AI generates insights + reasoning from the already-computed numbers ──
    const insightPrompt = `Statement metrics (already computed — do NOT change these numbers):
totalIncome=${metrics.totalIncome}, totalExpenditure=${metrics.totalExpenditure},
netCashFlow=${metrics.netCashFlow}, cashFlowRatio=${metrics.cashFlowRatio},
avgMonthlyIncome=${metrics.avgMonthlyIncome}, monthCount=${metrics.monthCount},
incomeFrequency=${metrics.avgIncomePerMonth.toFixed(1)}/month, debtEvents=${metrics.debtCount},
finalScore=${score.finalScore}, grade=${score.grade}, riskLevel=${score.riskLevel}

Transaction summary (${transactions.length} transactions):
${transactions.slice(0, 40).map(t => `${t.date} ${t.type} KES ${t.amount} - ${t.description}`).join("\n")}

Write 4–6 behavioral insights as a JSON array.`;

    const [insightsResp] = await Promise.all([
      openai.chat.completions.create({
        model: "gpt-5.4",
        temperature: 0,
        seed: 42,
        max_completion_tokens: 1500,
        messages: [
          { role: "system", content: INSIGHTS_SYSTEM },
          { role: "user",   content: insightPrompt },
        ],
      }),
    ]);

    let insights: BehavioralInsight[] = [];
    const insightContent = insightsResp.choices[0]?.message?.content ?? "[]";
    try {
      const arr = JSON.parse(insightContent);
      insights = Array.isArray(arr) ? arr : [];
    } catch {
      const m = insightContent.match(/\[[\s\S]*\]/);
      if (m) { try { insights = JSON.parse(m[0]); } catch { insights = []; } }
    }

    // ── Build reasoning string from computed numbers ──
    const reasoning = `${score.grade} grade based on a cash flow ratio of ${metrics.cashFlowRatio.toFixed(2)} (income KES ${fmt(metrics.totalIncome)} vs expenditure KES ${fmt(metrics.totalExpenditure)}), ` +
      `averaging KES ${fmt(metrics.avgMonthlyIncome)}/month over ${metrics.monthCount} month${metrics.monthCount !== 1 ? "s" : ""}. ` +
      `${metrics.debtCount > 0 ? `${metrics.debtCount} debt event${metrics.debtCount > 1 ? "s" : ""} detected, reducing the score.` : "No debt events detected."}`;

    // ── Recent transactions (last 15, newest first) ──
    const recentTransactions = [...transactions]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 15);

    res.json({
      dailyIncome,
      monthlyIncome,
      trustScore: {
        score: score.finalScore,
        grade: score.grade,
        label: score.label,
        creditLimit: score.creditLimit,
        reasoning,
        factors: score.factors,
        riskLevel: score.riskLevel,
        recommendation: score.recommendation,
      },
      summary: {
        totalIncome: metrics.totalIncome,
        totalExpenditure: metrics.totalExpenditure,
        netCashFlow: metrics.netCashFlow,
        cashFlowRatio: metrics.cashFlowRatio,
        averageMonthlyIncome: metrics.avgMonthlyIncome,
        averageDailyIncome: metrics.avgDailyIncome,
        peakIncomeMonth: monthLabel(metrics.peakIncomeMonth),
        lowestIncomeMonth: monthLabel(metrics.lowestIncomeMonth),
        currency: "KES",
        periodStart: metrics.periodStart,
        periodEnd: metrics.periodEnd,
        totalTransactions: metrics.totalTransactions,
        incomeTransactions: metrics.incomeTransactions,
        expenditureTransactions: metrics.expenditureTransactions,
      },
      behavioralInsights: insights,
      recentTransactions,
    });
  } catch (err: any) {
    req.log.error({ err }, "Analysis failed");
    res.status(500).json({ error: err.message || "Analysis failed. Please try again." });
  }
});

export default router;
