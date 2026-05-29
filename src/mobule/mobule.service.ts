import {
  Injectable,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { LocalPrismaService } from 'src/local-prisma.service';
import { MainPrismaService } from 'src/main-prisma.service';
import {
  SlotsCallbackRequestDto,
  SlotsCallbackResponseDto,
} from './mobule.dto';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from 'src/app.config';
import { RedisService } from '@liaoliaots/nestjs-redis';
import { Decimal } from '@prisma/client/runtime/library';
import { Mutex } from 'async-mutex';
import { Currency } from 'prisma/generated/main-client';
import axios from 'axios';
import {
  amountFromMinorUnits,
  balanceToMinorUnits,
  calculateUserRakeBackPercent,
  computeRakeBackIncrement,
  currencyMismatchMessage,
  resolveAggregatorAlias,
  resolveUserCurrency,
  validatePartnerAlias,
} from './mobule.helpers';

const MOBULE_METHODS_REQUIRING_MAIN_DB = new Set([
  'check.session',
  'check.balance',
  'withdraw.bet',
  'deposit.win',
  'freerounds.activate',
  'freerounds.complete',
]);

const USER_SESSION_SELECT = {
  id: true,
  balance: true,
  wager: true,
  betSum: true,
  winSum: true,
  games: true,
  topWin: true,
  role: true,
  currency: true,
  deposit: true,
  photoUrl: true,
  firstName: true,
} as const;

@Injectable()
export class MobuleService implements OnModuleInit {
  private sessionMutexMap: Map<string, Mutex> = new Map();
  private allowedIps: string[];

  constructor(
    private readonly localPrismaService: LocalPrismaService,
    private readonly mainPrismaService: MainPrismaService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    const fromEnv = process.env.MOBULE_ALLOWED_IPS?.trim();
    this.allowedIps = fromEnv
      ? fromEnv.split(',').map((ip) => ip.trim()).filter(Boolean)
      : ['188.166.21.18'];
  }

  onModuleInit() {}

  private headerValue(
    req: { headers: Record<string, string | string[] | undefined> },
    name: string,
  ): string | undefined {
    const raw = req.headers[name];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return value?.split(',')[0]?.trim() || undefined;
  }

  private normalizeIp(ip: string): string {
    return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  }

  /** Client IP behind nginx / Cloudflare (Mobule callback). */
  getIp(req: {
    headers: Record<string, string | string[] | undefined>;
    connection?: { remoteAddress?: string };
    socket?: { remoteAddress?: string };
  }): string {
    const candidates = [
      this.headerValue(req, 'cf-connecting-ip'),
      this.headerValue(req, 'x-real-ip'),
      this.headerValue(req, 'x-forwarded-for'),
      req.connection?.remoteAddress,
      req.socket?.remoteAddress,
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;
      const normalized = this.normalizeIp(candidate);
      if (normalized) return normalized;
    }
    return '';
  }

  async callback(
    method: string,
    data: SlotsCallbackRequestDto,
    req: Parameters<MobuleService['getIp']>[0],
  ): Promise<SlotsCallbackResponseDto | boolean> {
    const ip = this.getIp(req);
    // TODO(test): включить на проде — MOBULE_ALLOWED_IPS в .env
    // if (!this.allowedIps.includes(ip)) {
    //   console.warn(
    //     `Mobule callback IP rejected: "${ip}" (method=${method}), allowed: [${this.allowedIps.join(', ')}], ` +
    //       `x-real-ip=${this.headerValue(req, 'x-real-ip') ?? '-'}, ` +
    //       `x-forwarded-for=${this.headerValue(req, 'x-forwarded-for') ?? '-'}, ` +
    //       `cf-connecting-ip=${this.headerValue(req, 'cf-connecting-ip') ?? '-'}`,
    //   );
    //   throw new ForbiddenException('Error check ip!');
    // }
    console.log(`Mobule callback from IP: ${ip || '(unknown)'} (method=${method})`);

    if (
      MOBULE_METHODS_REQUIRING_MAIN_DB.has(method) &&
      !this.mainPrismaService.isConnected()
    ) {
      return {
        status: 503,
        method,
        message: 'Main database unavailable',
      };
    }

    switch (method) {
      case 'trx.cancel':
        return this.trxCancel();
      case 'trx.complete':
        return this.trxComplete();
      case 'check.session':
        return this.checkSession(data);
      case 'check.balance':
        return this.checkBalance(data);
      case 'withdraw.bet':
        return this.userBet(data);
      case 'deposit.win':
        return this.userWin(data);
      case 'freerounds.activate':
        return this.freeroundsActivate(data);
      case 'freerounds.complete':
        return this.freeroundsComplete(data);
      case 'freerounds.step':
        return this.freeroundsStep();
      default:
        throw new BadRequestException('Unknown method');
    }
  }

  private trxCancel(): SlotsCallbackResponseDto {
    return { status: 200 };
  }

  private trxComplete(): SlotsCallbackResponseDto {
    return { status: 200 };
  }

  private async findUserBySession(session: string | undefined) {
    if (!session) return null;
    return this.mainPrismaService.user.findUnique({
      where: { clientSeed: session },
      select: USER_SESSION_SELECT,
    });
  }

  private validateCurrencyForUser(
    requestCurrency: string | undefined,
    userCurrency: Currency,
    method: string,
  ): SlotsCallbackResponseDto | null {
    if (!requestCurrency) {
      return {
        status: 400,
        method,
        message: 'Currency is required',
      };
    }
    if (requestCurrency !== userCurrency) {
      return {
        status: 400,
        method,
        message: currencyMismatchMessage(userCurrency),
      };
    }
    return null;
  }

  private async checkSession(
    data: SlotsCallbackRequestDto,
  ): Promise<SlotsCallbackResponseDto> {
    const method = 'check.session';

    try {
      const user = await this.findUserBySession(data.session);
      if (!user) {
        console.warn(
          `check.session: unknown user for session=${data.session ?? '(empty)'}`,
        );
        return { status: 404, method, message: 'Unknown user' };
      }

      const userCurrency = resolveUserCurrency(user.currency);
      const currencyError = this.validateCurrencyForUser(
        data.currency,
        userCurrency,
        method,
      );
      if (currencyError) {
        console.warn('check.session: currency mismatch', currencyError);
        return currencyError;
      }

      const aliasCheck = validatePartnerAlias(
        user.role,
        data['partner.alias'],
      );
      if (aliasCheck.ok === false) {
        console.warn('check.session: partner alias rejected', aliasCheck.message);
        return { status: 403, method, message: aliasCheck.message };
      }

      const response = {
        status: 200,
        method,
        response: {
          id_player: user.id,
          id_group: 'default',
          balance: balanceToMinorUnits(user.balance),
        },
      };
      console.log('check.session: ok', {
        userId: user.id,
        balance: response.response.balance,
        currency: userCurrency,
      });
      return response;
    } catch (error) {
      console.error('Error in check.session:', error);
      return { status: 500, method, message: 'Internal server error' };
    }
  }

  private async checkBalance(
    data: SlotsCallbackRequestDto,
  ): Promise<SlotsCallbackResponseDto> {
    const method = 'check.balance';
    const user = await this.findUserBySession(data.session);

    if (!user) {
      return { status: 404, method, message: 'Unknown user' };
    }

    const userCurrency = resolveUserCurrency(user.currency);
    const currencyError = this.validateCurrencyForUser(
      data.currency,
      userCurrency,
      method,
    );
    if (currencyError) return currencyError;

    return {
      status: 200,
      method,
      response: {
        currency: userCurrency,
        balance: balanceToMinorUnits(user.balance),
      },
    };
  }

  async userBet(
    data: SlotsCallbackRequestDto,
  ): Promise<SlotsCallbackResponseDto> {
    const method = 'withdraw.bet';

    if (!data.session) {
      return { status: 404, method, message: 'Unknown session' };
    }
    if (data.amount == null) {
      return { status: 400, method, message: 'Amount is required' };
    }

    const mutex = this.getSessionMutex(data.session);
    const release = await mutex.acquire();

    try {
      const user = await this.findUserBySession(data.session);
      if (!user) {
        return { status: 404, method, message: 'Unknown user' };
      }

      const userCurrency = resolveUserCurrency(user.currency);
      const currencyError = this.validateCurrencyForUser(
        data.currency,
        userCurrency,
        method,
      );
      if (currencyError) return currencyError;

      const amount = amountFromMinorUnits(data.amount);
      if (Number(user.balance) < amount) {
        return { status: 400, method, message: 'Insufficient balance' };
      }

      const agregator = resolveAggregatorAlias(user.role, data['partner.alias']);
      const wager = Math.max(Number(user.wager) - amount, 0);
      const rakeBackPercent = calculateUserRakeBackPercent(user);
      const rakeBackIncrement = computeRakeBackIncrement(amount, rakeBackPercent);

      const result = await this.mainPrismaService.$transaction(async (mainTx) => {
        const updatedUser = await mainTx.user.update({
          where: { id: user.id },
          data: {
            balance: { decrement: amount },
            wager,
            betSum: { increment: amount },
            games: { increment: 1 },
            rakeBackBalance: { increment: rakeBackIncrement },
            totalRakeBackAmount: { increment: rakeBackIncrement },
          },
        });

        await this.localPrismaService.slotSpins.create({
          data: {
            userId: user.id,
            gameId: data.meta?.tag?.game_id ?? null,
            type: 'bet',
            value: amount,
            transactionId: data.trx_id ?? null,
            gameToken: data.session,
            agregator,
          },
        });

        await this.pushBalanceHistory(user.id, {
          type: 'Ставка в слотах',
          balance_before: Number(user.balance),
          balance_after: Number(user.balance) - amount,
        });

        return {
          status: 200 as const,
          method,
          response: {
            currency: userCurrency,
            balance: balanceToMinorUnits(updatedUser.balance),
          },
          userId: user.id,
          balanceAfter: updatedUser.balance,
        };
      });

      this.publishBalanceToMain(result.userId, result.balanceAfter);

      return {
        status: result.status,
        method: result.method,
        response: result.response,
      };
    } catch (error) {
      console.error('Error processing userBet:', error);
      return { status: 500, method, message: 'Internal server error' };
    } finally {
      release();
    }
  }

  private async userWin(
    data: SlotsCallbackRequestDto,
  ): Promise<SlotsCallbackResponseDto> {
    const method = 'deposit.win';
    const requestData = data.body ?? data;

    if (!requestData.session) {
      return { status: 404, method, message: 'Unknown session' };
    }

    const mutex = this.getSessionMutex(requestData.session);
    const release = await mutex.acquire();

    try {
      const user = await this.findUserBySession(requestData.session);
      if (!user) {
        return { status: 404, method, message: 'Unknown user' };
      }

      const userCurrency = resolveUserCurrency(user.currency);
      const currencyError = this.validateCurrencyForUser(
        requestData.currency,
        userCurrency,
        method,
      );
      if (currencyError) return currencyError;

      const amount = new Decimal(amountFromMinorUnits(requestData.amount));
      const agregator = resolveAggregatorAlias(
        user.role,
        requestData['partner.alias'],
      );
      const rakeBackPercent = calculateUserRakeBackPercent(user);
      const rakeBackIncrement = computeRakeBackIncrement(
        amount.toNumber(),
        rakeBackPercent,
      );

      const result = await this.mainPrismaService.$transaction(async (mainTx) => {
        const updatedUser = await mainTx.user.update({
          where: { id: user.id },
          data: {
            balance: { increment: amount.toNumber() },
            winSum: { increment: amount.toNumber() },
            games: { increment: 1 },
            topWin: {
              set: Decimal.max(
                new Decimal(user.topWin ?? 0),
                amount,
              ).toNumber(),
            },
            rakeBackBalance: { increment: rakeBackIncrement },
            totalRakeBackAmount: { increment: rakeBackIncrement },
          },
        });

        await this.localPrismaService.slotSpins.create({
          data: {
            userId: user.id,
            gameId: requestData.meta?.tag?.game_id ?? null,
            type: 'win',
            value: amount.toNumber(),
            transactionId: requestData.trx_id ?? null,
            gameToken: requestData.session,
            agregator,
          },
        });

        const balanceAfter = new Decimal(user.balance).plus(amount);
        await this.pushBalanceHistory(user.id, {
          type: 'Выигрыш в слотах',
          balance_before: Number(user.balance),
          balance_after: balanceAfter.toNumber(),
        });

        return {
          status: 200 as const,
          method,
          response: {
            currency: userCurrency,
            balance: balanceToMinorUnits(updatedUser.balance),
          },
          winPublish: {
            user,
            requestData,
            amount,
            deposit: updatedUser.deposit,
            currency: userCurrency,
            balanceAfter: updatedUser.balance,
          },
        };
      });

      await this.publishWinEvents(
        result.winPublish.user,
        result.winPublish.requestData,
        result.winPublish.amount,
        result.winPublish.deposit,
        result.winPublish.currency,
      );

      this.publishBalanceToMain(
        result.winPublish.user.id,
        result.winPublish.balanceAfter,
      );

      return {
        status: result.status,
        method: result.method,
        response: result.response,
      };
    } catch (error) {
      console.error('Error processing userWin:', error);
      return { status: 500, method, message: 'Internal server error' };
    } finally {
      release();
    }
  }

  private async freeroundsActivate(
    data: SlotsCallbackRequestDto,
  ): Promise<SlotsCallbackResponseDto> {
    const method = 'freerounds.activate';

    if (!data.session) {
      return { status: 404, method, message: 'Unknown session' };
    }
    if (!data.freerounds_id) {
      return { status: 400, method, message: 'Freerounds ID is required' };
    }
    if (!data.game_id) {
      return { status: 400, method, message: 'Game ID is required' };
    }

    const mutex = this.getSessionMutex(data.session);
    const release = await mutex.acquire();

    try {
      const user = await this.findUserBySession(data.session);
      if (!user) {
        return { status: 404, method, message: 'Unknown user' };
      }

      const userCurrency = resolveUserCurrency(user.currency);
      const currencyError = this.validateCurrencyForUser(
        data.currency,
        userCurrency,
        method,
      );
      if (currencyError) return currencyError;

      const freespin = await this.mainPrismaService.freespin.findFirst({
        where: {
          id: data.freerounds_id,
          userId: user.id,
          gameId: data.game_id,
          status: { in: [0, 1] },
        },
      });

      if (!freespin) {
        return {
          status: 404,
          method,
          message: 'No available freespins or already used',
        };
      }

      if (freespin.status === 0) {
        await this.mainPrismaService.freespin.update({
          where: { id: freespin.id },
          data: { status: 1 },
        });
      }

      return {
        status: 200,
        method,
        response: {
          total: freespin.count,
          betlevel: freespin.betLevel,
          rate: freespin.rate,
          currency: userCurrency,
        },
      };
    } catch (error) {
      console.error('Freerounds activate error:', error);
      return { status: 500, method, message: 'Internal server error' };
    } finally {
      release();
    }
  }

  private async freeroundsComplete(
    data: SlotsCallbackRequestDto,
  ): Promise<SlotsCallbackResponseDto> {
    const method = 'freerounds.complete';

    if (!data.session) {
      return { status: 404, method, message: 'Unknown session' };
    }
    if (!data.freerounds_id) {
      return { status: 400, method, message: 'Freerounds ID is required' };
    }
    if (data.total_win == null) {
      return { status: 400, method, message: 'Total win amount is required' };
    }

    const mutex = this.getSessionMutex(data.session);
    const release = await mutex.acquire();

    try {
      const user = await this.findUserBySession(data.session);
      if (!user) {
        return { status: 404, method, message: 'Unknown user' };
      }

      const userCurrency = resolveUserCurrency(user.currency);

      const freespin = await this.mainPrismaService.freespin.findFirst({
        where: {
          id: data.freerounds_id,
          userId: user.id,
          status: 1,
        },
      });

      if (!freespin) {
        return { status: 404, method, message: 'No active freespins found' };
      }

      const winAmount = amountFromMinorUnits(data.total_win);
      const wagerMultiply = freespin.isPromo ? 10 : 1;

      const [updatedUser] = await this.mainPrismaService.$transaction([
        this.mainPrismaService.user.update({
          where: { id: user.id },
          data: {
            balance: { increment: winAmount },
            wager: { increment: winAmount * wagerMultiply },
          },
        }),
        this.mainPrismaService.freespin.update({
          where: { id: freespin.id },
          data: { status: 2 },
        }),
      ]);

      this.publishBalanceToMain(user.id, updatedUser.balance);

      return {
        status: 200,
        method,
        response: {
          currency: userCurrency,
          balance: balanceToMinorUnits(updatedUser.balance),
        },
      };
    } catch (error) {
      console.error('Freerounds complete error:', error);
      return { status: 500, method, message: 'Internal server error' };
    } finally {
      release();
    }
  }

  private freeroundsStep(): boolean {
    return true;
  }

  private getSessionMutex(session: string): Mutex {
    let mutex = this.sessionMutexMap.get(session);
    if (!mutex) {
      mutex = new Mutex();
      this.sessionMutexMap.set(session, mutex);
    }
    return mutex;
  }

  private async pushBalanceHistory(
    userId: string,
    entry: {
      type: string;
      balance_before: number;
      balance_after: number;
    },
  ): Promise<void> {
    const redis = this.redisService.getOrThrow();
    const cacheKey = `user.${userId}.historyBalance`;
    const raw = await redis.get(cacheKey);
    let history: unknown[] = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(history)) history = [];

    history.push({
      user_id: userId,
      ...entry,
      date: new Date().toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    });
    await redis.set(cacheKey, JSON.stringify(history));
  }

  private publishBalanceToMain(
    userId: string,
    balance: Decimal | number,
  ): void {
    const mainUrl = this.configService.get<AppConfig['MAIN_APP_URL']>(
      'MAIN_APP_URL',
    );
    if (!mainUrl) return;

    const internalSecret = this.configService.get<
      AppConfig['INTERNAL_WEBHOOK_SECRET']
    >('INTERNAL_WEBHOOK_SECRET');

    const safeBalance =
      Math.round(Math.max(0, Number(balance)) * 10000) / 10000;

    void axios
      .post(
        `${mainUrl.replace(/\/$/, '')}/live-feed/push-balance`,
        { userId, balance: safeBalance },
        {
          headers: {
            'Content-Type': 'application/json',
            ...(internalSecret
              ? { 'X-Internal-Webhook-Secret': internalSecret }
              : {}),
          },
          timeout: 5000,
        },
      )
      .catch((err) => {
        console.error('live-feed/push-balance error:', err?.message ?? err);
      });
  }

  private async publishWinEvents(
    user: {
      id: string;
      photoUrl: string | null;
      firstName: string;
    },
    requestData: SlotsCallbackRequestDto,
    amount: Decimal,
    userDeposit: Decimal,
    currency: Currency,
  ): Promise<void> {
    if (!amount.greaterThan(0)) return;

    const gameName = requestData.meta?.tag?.game;
    const callback = {
      icon_game: 'slots',
      name_game: gameName,
      avatar: user.photoUrl,
      name: user.firstName,
      bet: 0,
      win: amount.toNumber(),
    };

    const redis = this.redisService.getOrThrow();
    await redis.publish('history', JSON.stringify(callback));

    await redis.publish(
      'updateLiveGames',
      JSON.stringify([
        {
          time: Math.floor(Date.now() / 1000),
          game_type: 'mobile',
          game_id: requestData.meta?.tag?.game_id ?? null,
          game_name: gameName,
          user_name: user.firstName,
          user_win: amount.toNumber(),
          game_img: '/img/slots/default.jpg',
        },
      ]),
    );

    let bets = await redis.get('games');
    let betsArray: unknown[] = bets ? JSON.parse(bets) : [];
    if (!Array.isArray(betsArray)) betsArray = [];
    betsArray.push(callback);
    await redis.set('games', JSON.stringify(betsArray.slice(-10)));

    const mainUrl = this.configService.get<AppConfig['MAIN_APP_URL']>(
      'MAIN_APP_URL',
    );
    if (!mainUrl || !requestData.meta?.tag) return;

    const internalSecret = this.configService.get<
      AppConfig['INTERNAL_WEBHOOK_SECRET']
    >('INTERNAL_WEBHOOK_SECRET');

    const betMinor = requestData.meta.tag.bet ?? 0;

    try {
      await axios.post(
        `${mainUrl.replace(/\/$/, '')}/live-feed/push-bet`,
        {
          gameId: requestData.meta.tag.game_id,
          gameName: gameName ?? undefined,
          photoUrl: user.photoUrl,
          firstName: user.firstName,
          bet: betMinor / 100,
          result: amount.toNumber(),
          userDeposit: Number(userDeposit),
          currency,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            ...(internalSecret
              ? { 'X-Internal-Webhook-Secret': internalSecret }
              : {}),
          },
          timeout: 5000,
        },
      );
    } catch (err) {
      console.error('live-feed/push-bet error:', err?.message ?? err);
    }
  }
}
