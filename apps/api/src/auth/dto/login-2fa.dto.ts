import { IsString, Length } from 'class-validator';

export class Login2faDto {
  @IsString()
  challengeToken!: string;

  @IsString()
  @Length(6, 10)
  code!: string;
}
