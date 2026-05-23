export interface JwtSubject {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  is_premium?: boolean;
  language_code?: string;
  allows_write_to_pm?: boolean;
  photo_url?: string;
}

export interface GoogleUser {
  id: string;
  email?: string;
  firstName: string;
  lastName: string;
  photoUrl?: string;
}

export interface AuthTokenPairDto {
  accessToken: string;
  refreshToken: string;
  userId: string;
}
