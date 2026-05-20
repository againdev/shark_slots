export class SlotsCallbackRequestDto {
  readonly cmd?: 'freerounds.activate' | 'freerounds.complete' | 'freerounds.step' | string;
  readonly method?: string;
  readonly body?: {
    sign: string;
    session: string;
    currency: string;
    amount?: number;
    trx_id?: string;
    round_id?: number;
    game_id?: number;
    freerounds_id?: string; 
    total_win?: number; 
    step?: number;
    step_win?: number; 
    meta?: {
      tag: {
        game?: string;
        game_id?: number;
        round_id?: number;
        bet?: number;
        denomination?: number;
        freerounds_id?: string; 
      };
    };
    'partner.alias'?: string;
  };

  readonly sign?: string;
  readonly session?: string;
  readonly currency?: string;
  readonly amount?: number;
  readonly trx_id?: string;
  readonly round_id?: number;
  readonly game_id?: number;
  readonly freerounds_id?: string; 
  readonly total_win?: number; 
  readonly step?: number; 
  readonly step_win?: number; 
  readonly meta?: {
    tag: {
      game?: string;
      game_id?: number;
      round_id?: number;
      bet?: number;
      denomination?: number;
      freerounds_id?: string; 
    };
  };
  readonly 'partner.alias'?: string;
}

export class SlotsCallbackResponseDto {
  status: number;
  method?: string;
  message?: string;
  response?: {
    currency?: string;
    balance?: number;
    total?: number; 
    betlevel?: number; 
    rate?: number; 
    [key: string]: any;
  };
}