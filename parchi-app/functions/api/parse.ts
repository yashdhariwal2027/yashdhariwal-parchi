/*
 * Cloudflare Pages Function: /api/parse (reading an order with Gemini).
 * The logic lives in api/parse.ts; this only hands it the request and the project's environment variables
 * (Cloudflare > Workers & Pages > parchi > Settings > Variables and Secrets).
 */
import { handleParse } from "../../api/parse";

interface Context {
  request: Request;
  env: Record<string, string | undefined>;
}

export const onRequest = (context: Context): Promise<Response> => handleParse(context.request, context.env);
