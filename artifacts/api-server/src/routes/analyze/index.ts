import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawTransaction {
  date: string;        // YYYY-MM-DD
  amount: number;      // always positive
  type: "credit" | "debit";
  description: string;
  category: string;
  isFee?: boolean;     // true = M-Pesa transaction cost / charge (exclude from expenditure)
}

interface BehavioralInsight {
  type: "positive" | "negative" | "warning";
  title: string;
  description: string;
}

// ─── Extraction prompt ────────────────────────────────────────────────────────

const EXTRACT_SYSTEM = `You are a precise Kenyan M-Pesa statement parser. Your only job is to extract EVERY COMPLETED transaction and return a raw JSON array.

CRITICAL RULES:
1. SKIP any line that contains "Failed", "Reversed" (as an entry type, not a credit reversal), "Cancelled", or "Declined".
2. ONLY include transactions that are completed/successful.
3. Transaction Cost / Charge lines: include them with isFee=true (they are separate entries, not part of the main transaction).

CREDIT (type="credit") — line contains any of:
  "received from" | "you received" | "cash received" | "paid to you" | "payment received"
  "business payment received" | "reversal" | "deposited by agent" | "mpesa deposit" | "transfer received"
  "deposited for" | "salary" | "credit" | "cash deposit"

DEBIT (type="debit") — line contains any of:
  "withdrawal" | "send money" | "sent to" | "pay bill" | "paybill" | "buy goods" | "lipa na mpesa"
  "airtime" | "transaction cost" | "charge" | "fuliza" | "loan repayment" | "kcb mpesa" | "okoa jahazi"
  "till number" | "merchant payment" | "global pay" | "m-shwari" | "lock savings"

If a line matches neither → skip it entirely.

CATEGORY rules (apply first match):
  "pay bill" | "paybill" | "buy goods" | "till number" | "lipa na mpesa" | "merchant" → "Bill Payment"
  "airtime" → "Airtime"
  "fuliza" | "loan" | "kcb mpesa" | "okoa jahazi" | "m-shwari" → "Loan"
  "withdrawal" → "Withdrawal"
  "send money" | "sent to" | "transfer" → "Transfer"
  "transaction cost" | "charge" → "Other" (and set isFee=true)
  credit + payer looks like a company/business → "Business"
  credit → "Income"
  everything else → "Other"

DATE: parse all formats (DD/MM/YYYY, DD/MM/YY, MMM DD YYYY, DD-MMM-YYYY, D/M/YYYY, etc.) to YYYY-MM-DD.
AMOUNT: strip commas, ignore currency symbols. Always a positive number.

OUTPUT: return ONLY a raw JSON array, no markdown, no extra text.
[
  { "date": "YYYY-MM-DD", "amount": 1234.56, "type": "credit", "description": "Received from Jane Doe via 0722000000", "category": "Income", "isFee": false },
  { "date": "YYYY-MM-DD", "amount": 27.00,   "type": "debit",  "description": "Transaction cost", "category": "Other", "isFee": true }
]

Return [] if no valid completed transactions found.`;

// ─── Insights prompt ──────────────────────────────────────────────────────────

const INSIGHTS_SYSTEM = `You are a senior Kenyan credit analyst with deep M-Pesa expertise. Given computed financial metrics and a transaction sample, write exactly 5 highly specific behavioral insights. Return ONLY a raw JSON array — no markdown, no preamble.

Each object:
{ "type": "positive"|"negative"|"warning", "title": "5–8 word headline", "description": "2 sentences citing specific KES figures or percentages from the data." }

Focus on: income regularity, savings vs spending ratio, debt/loan usage patterns, withdrawal behavior, bill payment consistency, income source diversity. Be precise and cite numbers.`;

// ─── Scoring engine ───────────────────────────────────────────────────────────

function computeScore(txs: RawTransaction[]) {
  const credits = txs.filter(t => t.type === "credit");
  // Exclude transaction fees from expenditure — they're not real spending
  const debits  = txs.filter(t => t.type === "debit" && !t.isFee);
  const fees    = txs.filter(t => t.isFee);

  const totalIncome      = round2(credits.reduce((s, t) => s + t.amount, 0));
  const totalExpenditure = round2(debits.reduce((s, t) => s + t.amount, 0));
  const totalFees        = round2(fees.reduce((s, t) => s + t.amount, 0));
  const netCashFlow      = round2(totalIncome - totalExpenditure - totalFees);
  const cashFlowRatio    = totalExpenditure === 0 ? 2.0 : round2(totalIncome / totalExpenditure);

  // Group by YYYY-MM (credits only for income stability)
  const monthMap: Record<string, { income: number; spending: number; incomeCount: number }> = {};
  for (const t of txs) {
    const ym = t.date.substring(0, 7);
    if (!ym || ym.length < 7) continue;
    if (!monthMap[ym]) monthMap[ym] = { income: 0, spending: 0, incomeCount: 0 };
    if (t.type === "credit") { monthMap[ym].income += t.amount; monthMap[ym].incomeCount++; }
    if (t.type === "debit" && !t.isFee) monthMap[ym].spending += t.amount;
  }
  const months = Object.keys(monthMap).sort();
  const monthCount = months.length || 1;

  const monthlyIncomeAmounts = months.map(m => monthMap[m].income);
  const avgMonthlyIncome = round2(totalIncome / monthCount);
  const avgDailyIncome   = round2(totalIncome / Math.max(daySpan(txs), 1));

  const totalIncomeCount = credits.length;
  const avgIncomePerMonth = totalIncomeCount / monthCount;

  // Debt / loan events
  const debtCount = txs.filter(t =>
    /fuliza|loan repayment|kcb mpesa|okoa jahazi|m-shwari/i.test(t.description)
  ).length;

  // Savings signals: lock savings, M-Shwari deposits
  const savingsCount = txs.filter(t =>
    /lock savings|m-shwari deposit|savings|fixed/i.test(t.description)
  ).length;

  // Highest single withdrawal (risk signal)
  const maxWithdrawal = debits.filter(t => t.category === "Withdrawal")
    .reduce((max, t) => Math.max(max, t.amount), 0);

  // Income diversity: number of distinct payers (rough)
  const payers = new Set(credits.map(t => t.description.replace(/\d{4,}/g, "").trim().toLowerCase().slice(0, 30)));
  const incomeSourceCount = payers.size;

  // Bill payment regularity: how many months had at least 1 bill payment
  const monthsWithBills = months.filter(m =>
    txs.some(t => t.date.startsWith(m) && t.category === "Bill Payment")
  ).length;

  // ── Factor scores ──────────────────────────────────────────────────────────

  // F1: Cash flow ratio (35%)
  const F1 = cashFlowRatio >= 2.5 ? 100 : cashFlowRatio >= 2.0 ? 90 : cashFlowRatio >= 1.5 ? 75
    : cashFlowRatio >= 1.2 ? 60 : cashFlowRatio >= 1.0 ? 42 : cashFlowRatio >= 0.8 ? 25 : 10;

  // F2: Income stability — coefficient of variation (20%)
  const mean = avgMonthlyIncome;
  const cv = mean === 0 ? 1 : (() => {
    const variance = monthlyIncomeAmounts.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / monthlyIncomeAmounts.length;
    return Math.sqrt(variance) / mean;
  })();
  const F2 = cv <= 0.10 ? 100 : cv <= 0.20 ? 85 : cv <= 0.35 ? 65 : cv <= 0.55 ? 45 : cv <= 0.80 ? 25 : 10;

  // F3: Income frequency (15%)
  const F3 = avgIncomePerMonth >= 12 ? 100 : avgIncomePerMonth >= 8 ? 85 : avgIncomePerMonth >= 4 ? 65
    : avgIncomePerMonth >= 2 ? 45 : avgIncomePerMonth >= 1 ? 30 : 10;

  // F4: Debt burden (15%)
  const debtRatio = totalIncome === 0 ? 0 : (txs.filter(t => t.category === "Loan").reduce((s, t) => s + t.amount, 0) / totalIncome);
  const F4 = debtCount === 0 ? 100 : debtRatio <= 0.05 ? 80 : debtRatio <= 0.10 ? 60
    : debtRatio <= 0.20 ? 40 : debtRatio <= 0.35 ? 25 : 10;

  // F5: Statement coverage (5%)
  const F5 = monthCount >= 6 ? 100 : monthCount >= 4 ? 80 : monthCount >= 3 ? 65 : monthCount >= 2 ? 45 : 25;

  // F6: Savings & financial discipline (5%) — bonus factor
  const F6 = savingsCount >= 3 ? 100 : savingsCount >= 1 ? 70 : incomeSourceCount >= 3 ? 60
    : monthsWithBills >= Math.floor(monthCount * 0.7) ? 55 : 30;

  // F7: Income source diversity (5%)
  const F7 = incomeSourceCount >= 5 ? 100 : incomeSourceCount >= 3 ? 75 : incomeSourceCount >= 2 ? 55 : 30;

  const finalScore = Math.round(
    F1 * 0.35 + F2 * 0.20 + F3 * 0.15 + F4 * 0.15 + F5 * 0.05 + F6 * 0.05 + F7 * 0.05
  );

  const { grade, label, limitMult } = gradeFor(finalScore);
  const creditLimit = Math.round(avgMonthlyIncome * limitMult);

  const riskLevel = finalScore >= 80 ? "Low" : finalScore >= 65 ? "Medium" : finalScore >= 45 ? "High" : "Very High";
  const recommendation = finalScore >= 80 ? "Approve" : finalScore >= 65 ? "Approve with conditions"
    : finalScore >= 45 ? "Further review required" : "Decline";

  const incomeByMonth = months.map(m => ({
    month: m, amount: monthMap[m].income, count: monthMap[m].incomeCount,
  }));
  const peak   = incomeByMonth.reduce((a, b) => b.amount > a.amount ? b : a, incomeByMonth[0] ?? { month: "", amount: 0, count: 0 });
  const lowest = incomeByMonth.reduce((a, b) => b.amount < a.amount ? b : a, incomeByMonth[0] ?? { month: "", amount: 0, count: 0 });

  const factors = [
    { name: "Cash Flow Strength",    score: F1, weight: 35, impact: impactOf(F1), detail: `Ratio ${cashFlowRatio.toFixed(2)} — income KES ${fmt(totalIncome)} vs spending KES ${fmt(totalExpenditure)}` },
    { name: "Income Stability",      score: F2, weight: 20, impact: impactOf(F2), detail: `CV=${cv.toFixed(2)} across ${monthCount} month${monthCount !== 1 ? "s" : ""} (lower is better)` },
    { name: "Income Frequency",      score: F3, weight: 15, impact: impactOf(F3), detail: `Avg ${avgIncomePerMonth.toFixed(1)} income transactions/month` },
    { name: "Debt Burden",           score: F4, weight: 15, impact: impactOf(F4), detail: `${debtCount} loan/Fuliza event${debtCount !== 1 ? "s" : ""}, ${(debtRatio * 100).toFixed(1)}% of income` },
    { name: "Statement Coverage",    score: F5, weight: 5,  impact: impactOf(F5), detail: `${monthCount} month${monthCount !== 1 ? "s" : ""} of history` },
    { name: "Financial Discipline",  score: F6, weight: 5,  impact: impactOf(F6), detail: `${savingsCount} savings event${savingsCount !== 1 ? "s" : ""}; bills paid in ${monthsWithBills}/${monthCount} months` },
    { name: "Income Diversification",score: F7, weight: 5,  impact: impactOf(F7), detail: `${incomeSourceCount} distinct income source${incomeSourceCount !== 1 ? "s" : ""} detected` },
  ] as const;

  // Daily income map
  const dayMap: Record<string, { sum: number; count: number }> = {};
  for (const t of credits) {
    if (!dayMap[t.date]) dayMap[t.date] = { sum: 0, count: 0 };
    dayMap[t.date].sum   += t.amount;
    dayMap[t.date].count += 1;
  }
  const dailyIncome = Object.keys(dayMap).sort().map(d => ({
    date: d, amount: round2(dayMap[d].sum), transactionCount: dayMap[d].count,
  }));
  const monthlyIncome = incomeByMonth.map(m => ({
    month: m.month, label: monthLabel(m.month), amount: round2(m.amount), transactionCount: m.count,
  }));

  return {
    metrics: {
      totalIncome, totalExpenditure, netCashFlow, cashFlowRatio,
      avgMonthlyIncome, avgDailyIncome, monthCount, avgIncomePerMonth,
      debtCount, debtRatio, savingsCount, incomeSourceCount, maxWithdrawal, totalFees,
      totalIncomeCount, totalTransactions: txs.length,
      incomeTransactions: credits.length, expenditureTransactions: debits.length,
      periodStart: txs.find(t => t.date)?.date ?? "",
      periodEnd: [...txs].reverse().find(t => t.date)?.date ?? "",
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
function impactOf(score: number): "positive" | "neutral" | "negative" {
  return score >= 65 ? "positive" : score >= 40 ? "neutral" : "negative";
}

function daySpan(txs: RawTransaction[]) {
  if (!txs.length) return 1;
  const dates = txs.map(t => new Date(t.date).getTime()).filter(d => !isNaN(d));
  if (!dates.length) return 1;
  return Math.max(1, Math.round((Math.max(...dates) - Math.min(...dates)) / 86_400_000) + 1);
}

function gradeFor(score: number): { grade: string; label: string; limitMult: number } {
  if (score >= 90) return { grade: "A+", label: "Excellent Credit",  limitMult: 4.5 };
  if (score >= 80) return { grade: "A",  label: "Very Good Credit",  limitMult: 3.5 };
  if (score >= 72) return { grade: "B+", label: "Good Credit",       limitMult: 2.5 };
  if (score >= 63) return { grade: "B",  label: "Fair-Good Credit",  limitMult: 1.8 };
  if (score >= 52) return { grade: "C",  label: "Fair Credit",       limitMult: 1.0 };
  if (score >= 40) return { grade: "D",  label: "Poor Credit",       limitMult: 0.4 };
  return             { grade: "F",  label: "Very Poor Credit", limitMult: 0 };
}

function monthLabel(ym: string) {
  if (!ym || ym.length < 7) return ym;
  const [y, m] = ym.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m, 10) - 1] ?? m} ${y}`;
}

// Split long text into overlapping chunks to avoid missing transactions
function chunkText(text: string, chunkSize = 55000, overlap = 500): string[] {
  if (text.length <= chunkSize) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + chunkSize));
    start += chunkSize - overlap;
  }
  return chunks;
}

// ─── Route ────────────────────────────────────────────────────────────────────

router.post("/analyze/mpesa", async (req, res) => {
  const { text } = req.body as { text?: string };
  if (!text || typeof text !== "string" || text.trim().length < 10) {
    res.status(400).json({ error: "No valid PDF text content provided." });
    return;
  }

  try {
    const chunks = chunkText(text.trim());

    // ── Extract transactions from all chunks in parallel ──────────────────────
    const chunkResults = await Promise.all(
      chunks.map(chunk =>
        openai.chat.completions.create({
          model: "openai/gpt-4o-mini",
          temperature: 0,
          max_tokens: 4000,
          messages: [
            { role: "system", content: EXTRACT_SYSTEM },
            { role: "user",   content: `Extract all completed transactions from this M-Pesa statement text:\n\n${chunk}` },
          ],
        })
      )
    );

    // ── Merge, deduplicate, and parse ─────────────────────────────────────────
    let transactions: RawTransaction[] = [];
    for (const resp of chunkResults) {
      const raw = resp.choices[0]?.message?.content ?? "[]";
      let parsed: RawTransaction[] = [];
      try {
        const arr = JSON.parse(raw);
        parsed = Array.isArray(arr) ? arr : [];
      } catch {
        const m = raw.match(/\[[\s\S]*\]/);
        if (m) { try { parsed = JSON.parse(m[0]); } catch { parsed = []; } }
      }
      transactions.push(...parsed);
    }

    // Deduplicate by date+amount+type+description (multi-chunk overlap may cause duplicates)
    const seen = new Set<string>();
    transactions = transactions.filter(t => {
      const key = `${t.date}|${t.amount}|${t.type}|${t.description?.slice(0, 40)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by date ascending
    transactions.sort((a, b) => a.date.localeCompare(b.date));

    // ── Compute all metrics deterministically ─────────────────────────────────
    const { metrics, score, dailyIncome, monthlyIncome } = computeScore(transactions);

    // ── Build a rich summary for insights ────────────────────────────────────
    const topIncomeSources = [...new Map(
      transactions
        .filter(t => t.type === "credit")
        .map(t => [t.description.slice(0, 40), t.amount])
    ).entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([desc, amt]) => `${desc}: KES ${fmt(amt)}`).join(", ");

    const categoryBreakdown = ["Bill Payment","Transfer","Withdrawal","Airtime","Loan","Business","Income"]
      .map(cat => {
        const sum = transactions.filter(t => t.category === cat).reduce((s, t) => s + t.amount, 0);
        return sum > 0 ? `${cat}=KES ${fmt(sum)}` : null;
      }).filter(Boolean).join(", ");

    const insightPrompt = `Computed metrics (authoritative — do NOT invent or contradict these):
totalIncome=KES ${fmt(metrics.totalIncome)}, totalExpenditure=KES ${fmt(metrics.totalExpenditure)},
netCashFlow=KES ${fmt(metrics.netCashFlow)}, cashFlowRatio=${metrics.cashFlowRatio.toFixed(2)},
avgMonthlyIncome=KES ${fmt(metrics.avgMonthlyIncome)}, monthCount=${metrics.monthCount},
incomeFreq=${metrics.avgIncomePerMonth.toFixed(1)}/month, incomeSourceCount=${metrics.incomeSourceCount},
debtEvents=${metrics.debtCount}, debtAsIncomePct=${(metrics.debtRatio * 100).toFixed(1)}%,
savingsEvents=${metrics.savingsCount}, maxSingleWithdrawal=KES ${fmt(metrics.maxWithdrawal)},
totalFees=KES ${fmt(metrics.totalFees)}, creditScore=${score.finalScore}, grade=${score.grade}

Category breakdown: ${categoryBreakdown}
Top income sources: ${topIncomeSources || "not identified"}

Transaction sample (${Math.min(transactions.length, 80)} of ${transactions.length}):
${transactions.slice(0, 80).map(t => `${t.date} ${t.type.toUpperCase()} KES ${t.amount} [${t.category}] ${t.description}`).join("\n")}

Write 5 highly specific behavioral insights citing the KES figures above.`;

    // ── Insights (parallel to response build) ────────────────────────────────
    const insightsResp = await openai.chat.completions.create({
      model: "openai/gpt-4o-mini",
      temperature: 0,
      max_tokens: 1200,
      messages: [
        { role: "system", content: INSIGHTS_SYSTEM },
        { role: "user",   content: insightPrompt },
      ],
    });

    let insights: BehavioralInsight[] = [];
    const insightContent = insightsResp.choices[0]?.message?.content ?? "[]";
    try {
      const arr = JSON.parse(insightContent);
      insights = Array.isArray(arr) ? arr : [];
    } catch {
      const m = insightContent.match(/\[[\s\S]*\]/);
      if (m) { try { insights = JSON.parse(m[0]); } catch { insights = []; } }
    }

    // ── Deterministic reasoning ───────────────────────────────────────────────
    const reasoning =
      `${score.grade} grade: cash flow ratio of ${metrics.cashFlowRatio.toFixed(2)} ` +
      `(income KES ${fmt(metrics.totalIncome)} vs spending KES ${fmt(metrics.totalExpenditure)}) ` +
      `over ${metrics.monthCount} month${metrics.monthCount !== 1 ? "s" : ""}, ` +
      `averaging KES ${fmt(metrics.avgMonthlyIncome)}/month. ` +
      (metrics.debtCount > 0
        ? `${metrics.debtCount} loan/Fuliza event${metrics.debtCount > 1 ? "s" : ""} ` +
          `represent ${(metrics.debtRatio * 100).toFixed(1)}% of income. `
        : "No loan or Fuliza activity detected. ") +
      (metrics.savingsCount > 0
        ? `${metrics.savingsCount} savings event${metrics.savingsCount > 1 ? "s" : ""} noted.`
        : "No savings activity detected.");

    // ── Recent transactions (last 20, newest first) ───────────────────────────
    const recentTransactions = [...transactions]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 20);

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
