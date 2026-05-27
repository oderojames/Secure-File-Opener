import { Router } from "express";

const router = Router();

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawTransaction {
  date: string;
  amount: number;
  type: "credit" | "debit";
  description: string;
  category: string;
  isFee?: boolean;
}

interface BehavioralInsight {
  type: "positive" | "negative" | "warning";
  title: string;
  description: string;
}

// ─── Date parsing ─────────────────────────────────────────────────────────────

const MONTH_MAP: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function extractDate(text: string): string | null {
  // DD/MM/YYYY or D/M/YY (most common in M-Pesa statements)
  let m = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2}|\d{2})\b/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  // YYYY-MM-DD
  m = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // DD MMM YYYY or DD-MMM-YYYY
  m = text.match(/\b(\d{1,2})[\s\-](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*[\s\-,]+(20\d{2})\b/i);
  if (m) {
    const mo = MONTH_MAP[m[2].toLowerCase().slice(0, 3)] ?? "01";
    return `${m[3]}-${mo}-${m[1].padStart(2, "0")}`;
  }
  // MMM DD YYYY
  m = text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+(\d{1,2})[,\s]+(20\d{2})\b/i);
  if (m) {
    const mo = MONTH_MAP[m[1].toLowerCase().slice(0, 3)] ?? "01";
    return `${m[3]}-${mo}-${m[2].padStart(2, "0")}`;
  }
  return null;
}

// ─── Amount extraction ────────────────────────────────────────────────────────

const AMOUNT_RE = /\b(\d{1,3}(?:,\d{3})*\.\d{2})\b/g;

function extractAmounts(text: string): number[] {
  // Strip tagged markers before scanning so they don't double-count
  const clean = text.replace(/\|PAIDIN=[\d.]+/g, "").replace(/\|WITHDRAWN=[\d.]+/g, "").replace(/\|BALANCE=[\d.]+/g, "");
  return [...clean.matchAll(AMOUNT_RE)]
    .map(m => parseFloat(m[1].replace(/,/g, "")))
    .filter(a => a > 0 && a < 50_000_000);
}

/** Extract column-tagged amounts from frontend-tagged rows.
 *  Returns null if the row wasn't tagged (fallback path applies). */
function extractTaggedAmounts(text: string): { paidIn: number; withdrawn: number; balance: number } | null {
  const paidInM    = text.match(/\|PAIDIN=([\d.]+)/);
  const withdrawnM = text.match(/\|WITHDRAWN=([\d.]+)/);
  const balanceM   = text.match(/\|BALANCE=([\d.]+)/);
  if (!paidInM && !withdrawnM) return null;        // untagged row
  return {
    paidIn:    paidInM    ? parseFloat(paidInM[1])    : 0,
    withdrawn: withdrawnM ? parseFloat(withdrawnM[1]) : 0,
    balance:   balanceM   ? parseFloat(balanceM[1])   : 0,
  };
}

// ─── Transaction classification ───────────────────────────────────────────────

const CREDIT_RE =
  /received from|you received|cash received|paid to you|payment received|business payment received|reversal|deposited by agent|mpesa deposit|transfer received|deposited for\b|salary\b|cash deposit|airtime commission|business credit/i;

const DEBIT_RE =
  /withdrawal|send money|sent to|pay bill|paybill|buy goods|lipa na mpesa|airtime (?:for|purchase|\d{10})|transaction cost|charge for|fuliza|loan repayment|kcb mpesa|okoa jahazi|till number|merchant payment|global pay|m-shwari|lock savings|funds transfer/i;

const FEE_RE = /transaction cost|charge for/i;

const FAILED_RE = /\b(failed|reversed|cancelled|declined)\b/i;

const SKIP_RE =
  /^(receipt no|completion time|details|transaction status|paid in|withdrawn|balance|transaction|m-pesa statement|safaricom|page \d|customer name|account no|phone|period:|opening balance|closing balance|statement period|dear |to whom)/i;

function classify(text: string): "credit" | "debit" | null {
  if (CREDIT_RE.test(text)) return "credit";
  if (DEBIT_RE.test(text)) return "debit";
  return null;
}

// ─── Description cleaning ─────────────────────────────────────────────────────

function cleanDescription(text: string): string {
  return text
    .replace(/\b\d{1,2}[\/\-]\d{1,2}[\/\-](?:20)?\d{2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?\b/g, "")
    .replace(/\b20\d{2}-\d{2}-\d{2}(?:[\sT]\d{1,2}:\d{2}(?::\d{2})?)?\b/g, "")
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?\b/gi, "")
    .replace(AMOUNT_RE, "")
    .replace(/\b[A-Z]{2,4}[A-Z0-9]{6,10}\b/g, "") // receipt numbers
    .replace(/\b(completed|failed|cancelled|declined|reversed)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ─── Category mapping ─────────────────────────────────────────────────────────

function categorize(desc: string, type: "credit" | "debit"): { category: string; isFee: boolean } {
  const d = desc.toLowerCase();
  if (FEE_RE.test(d)) return { category: "Other", isFee: true };
  if (/pay bill|paybill|buy goods|till number|lipa na mpesa|merchant/.test(d)) return { category: "Bill Payment", isFee: false };
  if (/\bairtime\b/.test(d)) return { category: "Airtime", isFee: false };
  if (/fuliza|loan repayment|kcb mpesa|okoa jahazi|m-shwari/.test(d)) return { category: "Loan", isFee: false };
  if (/withdrawal/.test(d)) return { category: "Withdrawal", isFee: false };
  if (/send money|sent to|funds transfer/.test(d)) return { category: "Transfer", isFee: false };
  if (type === "credit") return { category: "Income", isFee: false };
  return { category: "Other", isFee: false };
}

// ─── M-Pesa statement parser ──────────────────────────────────────────────────

// Safaricom M-Pesa receipt numbers: 2-4 uppercase letters + 6-10 alphanumeric chars
const RECEIPT_RE = /\b([A-Z]{2,4}[A-Z0-9]{6,10})\b/;

/**
 * Parse a M-Pesa statement text (tab-separated rows from position-aware pdfjs extraction,
 * or fallback space-joined text).
 *
 * M-Pesa statement columns (tab-separated per visual row):
 *   [0] Receipt No  [1] Completion Time  [2..n-3] Details  [n-2] Paid In or Withdrawn  [n-1] Balance
 *
 * Strategy:
 * 1. Normalise tabs → spaces so all processing works on plain strings.
 * 2. Anchor on receipt numbers to collect one transaction per segment.
 * 3. Within each segment: extract date, classify credit/debit by keywords,
 *    then pick the second-to-last amount (last = running balance).
 * 4. Fallback: keyword + date line scan if no receipt numbers found.
 */
function parseTransactions(rawText: string): RawTransaction[] {
  const results: RawTransaction[] = [];

  // Normalise: CR, then convert tabs → single space so downstream regexes work uniformly.
  const text = rawText
    .replace(/\r\n|\r/g, "\n")
    .replace(/\t/g, " ");          // TAB → space; amounts/dates stay findable

  const lines = text
    .split("\n")
    .map(l => l.replace(/\s{2,}/g, " ").trim())
    .filter(l => l.length > 5);

  // ── Strategy 1: Receipt-number anchored ───────────────────────────────────
  // The frontend emits one tagged row per transaction:
  //   "OAX... date desc |PAIDIN=1000 |BALANCE=5000"   (credit)
  //   "OBX... date desc |WITHDRAWN=500 |BALANCE=4500"  (debit)
  // A receipt number marks the start of a transaction segment.
  const segments: string[] = [];
  let buffer = "";

  for (const line of lines) {
    // Skip explicit header markers and table headers
    if (line === "##HEADER##") continue;
    if (SKIP_RE.test(line) && !RECEIPT_RE.test(line)) continue;

    if (RECEIPT_RE.test(line)) {
      if (buffer) segments.push(buffer.trim());
      buffer = line;
    } else if (buffer) {
      buffer += " " + line;
    } else if (CREDIT_RE.test(line) || DEBIT_RE.test(line)) {
      buffer = line;
    }
  }
  if (buffer) segments.push(buffer.trim());

  for (const seg of segments) {
    if (FAILED_RE.test(seg)) continue;

    const date = extractDate(seg);
    if (!date) continue;

    // ── Path A: column-tagged row (accurate) ─────────────────────────────
    const tagged = extractTaggedAmounts(seg);
    if (tagged) {
      let amount = 0;
      let type: "credit" | "debit";

      if (tagged.paidIn > 0 && tagged.withdrawn > 0) {
        // Both columns filled → use keyword to decide (shouldn't happen in normal statements)
        const kw = classify(seg);
        type   = kw ?? "debit";
        amount = type === "credit" ? tagged.paidIn : tagged.withdrawn;
      } else if (tagged.paidIn > 0) {
        type   = "credit";
        amount = tagged.paidIn;
      } else if (tagged.withdrawn > 0) {
        type   = "debit";
        amount = tagged.withdrawn;
      } else {
        continue; // Neither column has a value — balance-only row or header
      }

      if (!amount || amount <= 0) continue;

      const desc = cleanDescription(seg);
      if (!desc || desc.length < 4) continue;

      const { category, isFee } = categorize(desc, type);
      results.push({ date, amount, type, description: desc, category, isFee });
      continue;
    }

    // ── Path B: untagged row — keyword + positional heuristic (fallback) ─
    const type = classify(seg);
    if (!type) continue;

    const amounts = extractAmounts(seg);
    if (!amounts.length) continue;

    // Last amount = running balance; second-to-last = transaction amount
    const nonZero = amounts.filter(a => a > 0);
    if (!nonZero.length) continue;
    const amount = nonZero.length >= 2 ? nonZero[nonZero.length - 2] : nonZero[0];
    if (!amount || amount <= 0) continue;

    const desc = cleanDescription(seg);
    if (!desc || desc.length < 4) continue;

    const { category, isFee } = categorize(desc, type);
    results.push({ date, amount, type, description: desc, category, isFee });
  }

  // ── Strategy 2: Keyword line-by-line fallback (no receipt numbers found) ─
  if (results.length === 0) {
    for (const line of lines) {
      if (line === "##HEADER##") continue;
      if (SKIP_RE.test(line) || line.length < 15) continue;
      if (FAILED_RE.test(line)) continue;

      // Try tagged path first
      const tagged = extractTaggedAmounts(line);
      if (tagged && extractDate(line)) {
        const type: "credit" | "debit" = tagged.paidIn > 0 ? "credit" : "debit";
        const amount = tagged.paidIn > 0 ? tagged.paidIn : tagged.withdrawn;
        if (amount > 0) {
          const date = extractDate(line)!;
          const desc = cleanDescription(line);
          if (desc && desc.length >= 4) {
            const { category, isFee } = categorize(desc, type);
            results.push({ date, amount, type, description: desc, category, isFee });
            continue;
          }
        }
      }

      const type = classify(line);
      if (!type) continue;

      const date = extractDate(line);
      if (!date) continue;

      const amounts = extractAmounts(line);
      if (!amounts.length) continue;

      const nonZero = amounts.filter(a => a > 0);
      if (!nonZero.length) continue;
      const amount = nonZero.length >= 2 ? nonZero[nonZero.length - 2] : nonZero[0];
      if (!amount || amount <= 0) continue;

      const desc = cleanDescription(line);
      if (!desc || desc.length < 4) continue;

      const { category, isFee } = categorize(desc, type);
      results.push({ date, amount, type, description: desc, category, isFee });
    }
  }

  return results;
}

// ─── Deduplicate ──────────────────────────────────────────────────────────────

function dedup(txs: RawTransaction[]): RawTransaction[] {
  const seen = new Set<string>();
  return txs.filter(t => {
    const key = `${t.date}|${t.amount}|${t.type}|${t.description.slice(0, 40)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Scoring engine ───────────────────────────────────────────────────────────

function computeScore(txs: RawTransaction[]) {
  const credits = txs.filter(t => t.type === "credit");
  const debits  = txs.filter(t => t.type === "debit" && !t.isFee);
  const fees    = txs.filter(t => t.isFee);

  const totalIncome      = round2(credits.reduce((s, t) => s + t.amount, 0));
  const totalExpenditure = round2(debits.reduce((s, t) => s + t.amount, 0));
  const totalFees        = round2(fees.reduce((s, t) => s + t.amount, 0));
  const netCashFlow      = round2(totalIncome - totalExpenditure - totalFees);
  const cashFlowRatio    = totalExpenditure === 0 ? 2.0 : round2(totalIncome / totalExpenditure);

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

  const totalIncomeCount  = credits.length;
  const avgIncomePerMonth = totalIncomeCount / monthCount;

  const debtCount = txs.filter(t =>
    /fuliza|loan repayment|kcb mpesa|okoa jahazi|m-shwari/i.test(t.description)
  ).length;

  const savingsCount = txs.filter(t =>
    /lock savings|m-shwari deposit|savings|fixed/i.test(t.description)
  ).length;

  const maxWithdrawal = debits.filter(t => t.category === "Withdrawal")
    .reduce((max, t) => Math.max(max, t.amount), 0);

  const payers = new Set(credits.map(t => t.description.replace(/\d{4,}/g, "").trim().toLowerCase().slice(0, 30)));
  const incomeSourceCount = payers.size;

  const monthsWithBills = months.filter(m =>
    txs.some(t => t.date.startsWith(m) && t.category === "Bill Payment")
  ).length;

  // Factor scores
  const F1 = cashFlowRatio >= 2.5 ? 100 : cashFlowRatio >= 2.0 ? 90 : cashFlowRatio >= 1.5 ? 75
    : cashFlowRatio >= 1.2 ? 60 : cashFlowRatio >= 1.0 ? 42 : cashFlowRatio >= 0.8 ? 25 : 10;

  const mean = avgMonthlyIncome;
  const cv = mean === 0 ? 1 : (() => {
    const variance = monthlyIncomeAmounts.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / monthlyIncomeAmounts.length;
    return Math.sqrt(variance) / mean;
  })();
  const F2 = cv <= 0.10 ? 100 : cv <= 0.20 ? 85 : cv <= 0.35 ? 65 : cv <= 0.55 ? 45 : cv <= 0.80 ? 25 : 10;

  const F3 = avgIncomePerMonth >= 12 ? 100 : avgIncomePerMonth >= 8 ? 85 : avgIncomePerMonth >= 4 ? 65
    : avgIncomePerMonth >= 2 ? 45 : avgIncomePerMonth >= 1 ? 30 : 10;

  const debtRatio = totalIncome === 0 ? 0 : (txs.filter(t => t.category === "Loan").reduce((s, t) => s + t.amount, 0) / totalIncome);
  const F4 = debtCount === 0 ? 100 : debtRatio <= 0.05 ? 80 : debtRatio <= 0.10 ? 60
    : debtRatio <= 0.20 ? 40 : debtRatio <= 0.35 ? 25 : 10;

  const F5 = monthCount >= 6 ? 100 : monthCount >= 4 ? 80 : monthCount >= 3 ? 65 : monthCount >= 2 ? 45 : 25;

  const F6 = savingsCount >= 3 ? 100 : savingsCount >= 1 ? 70 : incomeSourceCount >= 3 ? 60
    : monthsWithBills >= Math.floor(monthCount * 0.7) ? 55 : 30;

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
    { name: "Cash Flow Strength",     score: F1, weight: 35, impact: impactOf(F1), detail: `Ratio ${cashFlowRatio.toFixed(2)} — income KES ${fmt(totalIncome)} vs spending KES ${fmt(totalExpenditure)}` },
    { name: "Income Stability",       score: F2, weight: 20, impact: impactOf(F2), detail: `CV=${cv.toFixed(2)} across ${monthCount} month${monthCount !== 1 ? "s" : ""} (lower is better)` },
    { name: "Income Frequency",       score: F3, weight: 15, impact: impactOf(F3), detail: `Avg ${avgIncomePerMonth.toFixed(1)} income transactions/month` },
    { name: "Debt Burden",            score: F4, weight: 15, impact: impactOf(F4), detail: `${debtCount} loan/Fuliza event${debtCount !== 1 ? "s" : ""}, ${(debtRatio * 100).toFixed(1)}% of income` },
    { name: "Statement Coverage",     score: F5, weight: 5,  impact: impactOf(F5), detail: `${monthCount} month${monthCount !== 1 ? "s" : ""} of history` },
    { name: "Financial Discipline",   score: F6, weight: 5,  impact: impactOf(F6), detail: `${savingsCount} savings event${savingsCount !== 1 ? "s" : ""}; bills paid in ${monthsWithBills}/${monthCount} months` },
    { name: "Income Diversification", score: F7, weight: 5,  impact: impactOf(F7), detail: `${incomeSourceCount} distinct income source${incomeSourceCount !== 1 ? "s" : ""} detected` },
  ] as const;

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
      monthsWithBills,
    },
    score: { finalScore, grade, label, creditLimit, riskLevel, recommendation, factors },
    dailyIncome,
    monthlyIncome,
  };
}

// ─── Deterministic insights ───────────────────────────────────────────────────

function generateInsights(
  metrics: ReturnType<typeof computeScore>["metrics"],
  score: ReturnType<typeof computeScore>["score"]
): BehavioralInsight[] {
  const insights: BehavioralInsight[] = [];

  // 1. Cash flow
  if (metrics.cashFlowRatio >= 1.5) {
    insights.push({
      type: "positive",
      title: "Strong positive cash flow ratio",
      description: `Total income of KES ${fmt(metrics.totalIncome)} comfortably exceeds spending of KES ${fmt(metrics.totalExpenditure)}, yielding a cash flow ratio of ${metrics.cashFlowRatio.toFixed(2)}. This surplus indicates reliable capacity to service credit obligations.`,
    });
  } else if (metrics.cashFlowRatio >= 1.0) {
    insights.push({
      type: "warning",
      title: "Slim cash flow margin detected",
      description: `Income of KES ${fmt(metrics.totalIncome)} barely exceeds spending of KES ${fmt(metrics.totalExpenditure)} (ratio ${metrics.cashFlowRatio.toFixed(2)}). Any income disruption could create repayment difficulty.`,
    });
  } else {
    insights.push({
      type: "negative",
      title: "Expenditure exceeds income",
      description: `Spending of KES ${fmt(metrics.totalExpenditure)} exceeds income of KES ${fmt(metrics.totalIncome)} (ratio ${metrics.cashFlowRatio.toFixed(2)}). This pattern is unsustainable and signals significant financial stress.`,
    });
  }

  // 2. Income stability
  const cvPct = (metrics.cv * 100).toFixed(0);
  if (metrics.cv <= 0.20) {
    insights.push({
      type: "positive",
      title: "Highly consistent monthly income",
      description: `Monthly income is stable with only ${cvPct}% variation across ${metrics.monthCount} months, averaging KES ${fmt(metrics.avgMonthlyIncome)}/month. Predictable earnings strongly support reliable loan repayment.`,
    });
  } else if (metrics.cv <= 0.55) {
    insights.push({
      type: "warning",
      title: "Moderate income variability noted",
      description: `Monthly income varies by ${cvPct}% around an average of KES ${fmt(metrics.avgMonthlyIncome)}/month over ${metrics.monthCount} months. Moderate fluctuations may affect repayment consistency.`,
    });
  } else {
    insights.push({
      type: "negative",
      title: "Highly irregular income pattern",
      description: `Income fluctuates by ${cvPct}% with an average of KES ${fmt(metrics.avgMonthlyIncome)}/month over ${metrics.monthCount} months. High irregularity poses an elevated repayment risk.`,
    });
  }

  // 3. Debt burden
  if (metrics.debtCount === 0) {
    insights.push({
      type: "positive",
      title: "No mobile loan activity detected",
      description: `No Fuliza, M-Shwari, KCB M-Pesa, or Okoa Jahazi events found over the ${metrics.monthCount}-month period. The customer is not reliant on short-term mobile credit, indicating self-sufficient cash management.`,
    });
  } else {
    const debtPct = (metrics.debtRatio * 100).toFixed(1);
    insights.push({
      type: metrics.debtRatio > 0.20 ? "negative" : "warning",
      title: `${metrics.debtCount} mobile loan event${metrics.debtCount !== 1 ? "s" : ""} detected`,
      description: `Loan/Fuliza activity represents ${debtPct}% of total income (KES ${fmt(metrics.totalIncome)}). ${metrics.debtRatio > 0.20 ? "This elevated debt burden may impair repayment capacity for new credit." : "Debt usage is within manageable limits but should be monitored."}`,
    });
  }

  // 4. Savings / withdrawal discipline
  if (metrics.savingsCount >= 3) {
    insights.push({
      type: "positive",
      title: "Active and consistent savings behaviour",
      description: `${metrics.savingsCount} savings deposits (M-Shwari/Lock Savings) recorded over ${metrics.monthCount} months alongside an average monthly income of KES ${fmt(metrics.avgMonthlyIncome)}. Regular saving is a strong indicator of financial discipline.`,
    });
  } else if (metrics.maxWithdrawal > metrics.avgMonthlyIncome * 0.5 && metrics.avgMonthlyIncome > 0) {
    insights.push({
      type: "warning",
      title: "Large single withdrawal flagged",
      description: `A single withdrawal of KES ${fmt(metrics.maxWithdrawal)} represents ${((metrics.maxWithdrawal / metrics.avgMonthlyIncome) * 100).toFixed(0)}% of the average monthly income of KES ${fmt(metrics.avgMonthlyIncome)}. Large irregular withdrawals can destabilise cash flow.`,
    });
  } else {
    insights.push({
      type: "warning",
      title: "Limited savings activity observed",
      description: `Only ${metrics.savingsCount} savings event${metrics.savingsCount !== 1 ? "s" : ""} detected over ${metrics.monthCount} months. Building a regular savings habit would meaningfully improve future creditworthiness assessments.`,
    });
  }

  // 5. Income diversification & frequency
  const billCoverage = metrics.monthCount > 0 ? ((metrics.monthsWithBills / metrics.monthCount) * 100).toFixed(0) : "0";
  if (metrics.incomeSourceCount >= 3) {
    insights.push({
      type: "positive",
      title: "Diversified income sources detected",
      description: `${metrics.incomeSourceCount} distinct income sources identified with ${metrics.avgIncomePerMonth.toFixed(1)} income transactions/month. Multiple payers reduce concentration risk and support stable repayment capacity.`,
    });
  } else if (metrics.monthsWithBills >= Math.ceil(metrics.monthCount * 0.6) && metrics.monthCount >= 2) {
    insights.push({
      type: "positive",
      title: "Consistent bill payment behaviour",
      description: `Bill payments recorded in ${metrics.monthsWithBills} of ${metrics.monthCount} months (${billCoverage}% coverage). Regular paybill and buy-goods activity shows financial responsibility and organised payment habits.`,
    });
  } else {
    const diversityType = metrics.incomeSourceCount <= 1 ? "negative" : "warning" as const;
    insights.push({
      type: diversityType,
      title: "Limited income diversification",
      description: `Only ${metrics.incomeSourceCount} income source${metrics.incomeSourceCount !== 1 ? "s" : ""} detected over ${metrics.monthCount} months. Concentration in a single payer increases vulnerability to income disruption.`,
    });
  }

  return insights.slice(0, 5);
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
  if (score >= 80) return { grade: "A", label: "Excellent Credit", limitMult: 4.0 };
  if (score >= 60) return { grade: "B", label: "Good Credit",      limitMult: 2.5 };
  if (score >= 50) return { grade: "C", label: "Fair Credit",      limitMult: 1.0 };
  return             { grade: "D", label: "Poor Credit",      limitMult: 0.3 };
}

function monthLabel(ym: string) {
  if (!ym || ym.length < 7) return ym;
  const [y, mo] = ym.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(mo, 10) - 1] ?? mo} ${y}`;
}

// ─── Customer name extraction ─────────────────────────────────────────────────

/** Scan the first ~40 lines of the statement for the account holder's name.
 *  M-Pesa statements typically place it near the top in patterns like:
 *    "Customer Name: JOHN DOE"  /  "Full Statement For: JOHN DOE"  /
 *    "Account Name: JOHN DOE"   /  "Statement for JOHN DOE WANJIRU"
 *  Falls back to the first ALL-CAPS multi-word token block found. */
function extractCustomerName(text: string): string | null {
  const top = text.split("\n").slice(0, 40).join("\n");

  // Pattern 1: explicit label before the name
  const labeled = top.match(
    /(?:customer\s*name|account\s*name|full\s*statement\s*for|statement\s*for|prepared\s*for|name)\s*[:\-]?\s*([A-Z][A-Za-z''\-]{1,}\s+[A-Z][A-Za-z'\-\s]{1,})/i
  );
  if (labeled) return labeled[1].trim().replace(/\s+/g, " ");

  // Pattern 2: a run of 2-4 ALL-CAPS words (typical Kenyan name format)
  const caps = top.match(/\b([A-Z]{2,}(?:\s+[A-Z]{2,}){1,3})\b/);
  if (caps) {
    const candidate = caps[1].trim();
    // Reject generic header words
    const SKIP = /^(MPESA|SAFARICOM|STATEMENT|ACCOUNT|CUSTOMER|MOBILE|MONEY|PAGE|DATE|PERIOD)$/i;
    const words = candidate.split(/\s+/);
    if (words.every(w => !SKIP.test(w))) return candidate;
  }

  return null;
}

// ─── Route ────────────────────────────────────────────────────────────────────

router.post("/analyze/mpesa", async (req, res) => {
  const { text } = req.body as { text?: string };
  if (!text || typeof text !== "string" || text.trim().length < 10) {
    res.status(400).json({ error: "No valid PDF text content provided." });
    return;
  }

  try {
    const customerName = extractCustomerName(text);

    // Parse transactions using the regex engine (fast, no API call)
    let transactions = dedup(parseTransactions(text.trim()));

    // Sort by date ascending
    transactions.sort((a, b) => a.date.localeCompare(b.date));

    if (transactions.length === 0) {
      res.status(422).json({
        error: "No transactions could be extracted from this statement. Please ensure you are uploading a valid M-Pesa statement PDF.",
      });
      return;
    }

    // Compute all metrics deterministically
    const { metrics, score, dailyIncome, monthlyIncome } = computeScore(transactions);

    // Generate behavioral insights deterministically
    const insights = generateInsights(metrics, score);

    // Deterministic reasoning
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

    // Recent transactions (last 20, newest first)
    const recentTransactions = [...transactions]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 20);

    res.json({
      customerName,
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
