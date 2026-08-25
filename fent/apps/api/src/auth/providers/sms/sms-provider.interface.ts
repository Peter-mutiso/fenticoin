export interface SmsProvider {
  readonly name: string;
  sendOtp(phoneE164: string, code: string): Promise<void>;
}

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');
