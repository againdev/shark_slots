import * as crypto from 'crypto';

/**
 * @see https://help.crypt.bot/crypto-pay-api#verifying-webhook-updates
 * secret = SHA256(api_token), signature = HMAC-SHA256(secret, raw_body)
 */
export function verifyCryptoPayWebhookSignature(
  apiToken: string,
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
): boolean {
  if (!apiToken || !signatureHeader) {
    return false;
  }

  const body =
    typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const secret = crypto.createHash('sha256').update(apiToken).digest();
  const expected = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(signatureHeader, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
