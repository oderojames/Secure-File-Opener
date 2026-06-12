import { Router, type Request, type Response } from "express";

const router = Router();

const BASE_URL = () => process.env["PAYNECTA_BASE_URL"] || "https://paynecta.co.ke/api/v1";
const API_KEY = () => process.env["PAYNECTA_API_KEY"] || "";
const USER_EMAIL = () => process.env["PAYNECTA_USER_EMAIL"] || "";
const PAYMENT_CODE = () => process.env["PAYNECTA_PAYMENT_CODE"] || "";

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

router.post("/payment/initiate", async (req: Request, res: Response) => {
  const { phone } = req.body as { phone?: string };
  if (!phone) {
    res.status(400).json({ success: false, error: "Phone number is required" });
    return;
  }

  const formatted = formatPhone(phone);
  if (formatted.length < 12) {
    res.status(400).json({ success: false, error: "Please provide a valid Safaricom phone number" });
    return;
  }

  try {
    const response = await fetch(`${BASE_URL()}/payment/initialize`, {
      method: "POST",
      headers: paynectaHeaders(),
      body: JSON.stringify({
        code: PAYMENT_CODE(),
        mobile_number: formatted,
        amount: 50,
      }),
    });
    const data = await response.json();
    res.status(response.ok ? 200 : 400).json(data);
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message || "Payment initiation failed" });
  }
});

router.get("/payment/status/:reference", async (req: Request, res: Response) => {
  const { reference } = req.params;
  try {
    const url = `${BASE_URL()}/payment/status?transaction_reference=${encodeURIComponent(reference)}`;
    const response = await fetch(url, {
      headers: paynectaHeaders(),
    });
    const data = await response.json();
    res.status(response.ok ? 200 : 400).json(data);
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message || "Status check failed" });
  }
});

export default router;
