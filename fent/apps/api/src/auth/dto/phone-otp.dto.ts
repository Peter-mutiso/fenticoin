import { IsString, Length, Matches } from 'class-validator';

const E164_REGEX = /^\+[1-9]\d{1,14}$/;

export class RequestPhoneOtpDto {
  @IsString()
  @Matches(E164_REGEX, { message: 'phone must be in E.164 format, e.g. +14155551234' })
  phone!: string;
}

export class VerifyPhoneOtpDto {
  @IsString()
  @Matches(E164_REGEX, { message: 'phone must be in E.164 format, e.g. +14155551234' })
  phone!: string;

  @IsString()
  @Length(6, 6)
  code!: string;
}
