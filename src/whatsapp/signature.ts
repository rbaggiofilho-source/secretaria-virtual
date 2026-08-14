import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Valida a assinatura X-Hub-Signature-256 que a Meta envia em cada POST.
 * A assinatura é o HMAC-SHA256 do corpo BRUTO (bytes exatos recebidos) usando
 * o App Secret. Precisamos comparar contra o raw body — não contra o JSON já
 * re-serializado, que teria bytes diferentes.
 *
 * @param rawBody  corpo da requisição exatamente como recebido (string/Buffer)
 * @param headerSignature  valor do header "x-hub-signature-256" (ex.: "sha256=abc...")
 * @param appSecret  WHATSAPP_APP_SECRET
 */
export function isValidSignature(
  rawBody: string | Buffer,
  headerSignature: string | undefined,
  appSecret: string,
): boolean {
  if (!headerSignature || !headerSignature.startsWith("sha256=")) {
    return false;
  }

  const expected = createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");

  const received = headerSignature.slice("sha256=".length);

  // Comparação em tempo constante para evitar timing attacks.
  const expectedBuf = Buffer.from(expected, "hex");
  const receivedBuf = Buffer.from(received, "hex");

  if (expectedBuf.length !== receivedBuf.length) {
    return false;
  }
  return timingSafeEqual(expectedBuf, receivedBuf);
}
