/*
 * Cloudflare Pages Function: /api/billing (Razorpay checkout, payment check and webhook).
 * The logic lives in api/billing.ts; this only hands it the request and the project's environment variables.
 */
import { handleBilling } from "../../api/billing";

interface Context {
  request: Request;
  env: Record<string, string | undefined>;
}

export const onRequest = (context: Context): Promise<Response> => handleBilling(context.request, context.env);
