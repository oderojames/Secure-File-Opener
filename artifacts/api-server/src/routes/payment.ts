import { Router, type Request, type Response } from "express";

const router = Router();

const BASE_URL = () => process.env["PAYNECTA_BASE_URL"] || "https://paynecta.co.ke/api/v1";
const API_KEY = () => process.env["PAYNECTA_API_KEY"] || "";
const USER_EMAIL = () => process.env["PAYNECTA_USER_EMAIL"] || "";
const PAYMENT_CODE = () => process.env["PAYNECTA_PAYMENT_CODE"] || "";

const RETRY_ATTEMPTS = 2;
const RETRY_DELAY_MS = 1200;

function paynectaHeaders() {
  return {
    "Content-Type": "application/json",
    "X-API-Key": API_KEY(),
    "X-User-Email": USER_EMAIL(),
    Accept: "application/json",
  };
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("254") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return "254" + digits.slice(1);
  if (digits.length === 9) return "254" + digits;
  return digits;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function paynectaPost(path: string, body: object): Promise<{ ok: boolean; status: number; data: any }> {
  let lastError: any;
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(`${BASE_URL()}${path}`, {
        method: "POST",
        headers: paynectaHeaders(),
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (response.status < 500) {
        return { ok: response.ok, status: response.status, data };
      }
      lastError = data;
    } catch (err) {
      lastError = err;
    }
    if (attempt < RETRY_ATTEMPTS - 1) {
      await sleep(RETRY_DELAY_MS);
    }
  }
  return {
    ok: false,
    status: 500,
    data: {
      success: false,
      code: 500,
      message: "Payment initiation failed. Please try again.",
      error: "SERVER_ERROR",
      _raw: lastError,
    },
  };
}

async function paynectaGet(url: string): Promise<{ ok: boolean; status: number; data: any }> {
  let lastError: any;
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, { headers: paynectaHeaders() });
      const data = await response.json();
      if (response.status < 500) {
        return { ok: response.ok, status: response.status, data };
      }
      lastError = data;
    } catch (err) {
      lastError = err;
    }
    if (attempt < RETRY_ATTEMPTS - 1) {
      await sleep(RETRY_DELAY_MS);
    }
  }
  return {
    ok: false,
    status: 500,
    data: { success: false, code: 500, message: "Status check failed", _raw: lastError },
  };
}

router.post("/payment/initiate", async (req: Request, res: Response) => {
  const { phone, amount } = req.body as { phone?: string; amount?: number };
  if (!phone) {
    res.status(400).json({ success: false, error: "Phone number is required" });
    return;
  }

  const formatted = formatPhone(phone);
  if (formatted.length < 12) {
    res.status(400).json({ success: false, error: "Please provide a valid Safaricom phone number" });
    return;
  }

  const chargeAmount = typeof amount === "number" && amount > 0 ? amount : 50;

  const { ok, status, data } = await paynectaPost("/payment/initialize", {
    code: PAYMENT_CODE(),
    mobile_number: formatted,
    amount: chargeAmount,
  });

  res.status(ok ? 200 : status).json(data);
});

router.get("/payment/status/:reference", async (req: Request, res: Response) => {
  const { reference } = req.params;
  const url = `${BASE_URL()}/payment/status?transaction_reference=${encodeURIComponent(reference)}`;
  const { ok, status, data } = await paynectaGet(url);
  res.status(ok ? 200 : status).json(data);
});

export default router;
