declare namespace Express {
  export interface Request {
    user?: {
      tgId: number;
      sub: string;
    };
  }
}
