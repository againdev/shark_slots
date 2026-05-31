import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class AuthenticateTelegramDto {
  @IsString()
  id: string;

  @IsOptional()
  @IsString()
  first_name?: string;

  @IsOptional()
  @IsString()
  last_name?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  photo_url?: string;

  @IsInt()
  auth_date: number;

  @IsString()
  hash: string;

  @IsNumber()
  deviceHeight: number;

  @IsNumber()
  deviceWidth: number;

  @IsOptional()
  @IsObject()
  cookies?: Record<string, string>;

  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;
}

export class ConnectTelegramDto extends AuthenticateTelegramDto {
  @IsString()
  userId: string;
}

