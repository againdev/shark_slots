import {
  Injectable,
  ForbiddenException,
  BadRequestException,
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
import { User } from 'prisma/generated/main-client';
import axios from 'axios';

@Injectable()
export class MobuleService {
  readonly mobuleApiToken = this.configService.get<
    AppConfig['MOBULE_SECRET_TOKEN']
  >('MOBULE_SECRET_TOKEN');
  private sessionMutexMap: Map<string, Mutex> = new Map();

  constructor(
    private readonly localPrismaService: LocalPrismaService,
    private readonly mainPrismaService: MainPrismaService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  async onModuleInit() {
    const redis = this.redisService.getOrThrow();
    console.log('Clearing Redis data...');
    await redis.flushdb();
    console.log('Redis cleared.');
  }

  private allowedIps = ['188.166.21.18'];

  getIp(req: any): string {
    return req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  }

  async callback(
    method: string,
    data: SlotsCallbackRequestDto,
    req: any,
  ): Promise<SlotsCallbackResponseDto | boolean> {
    const ip = this.getIp(req);

    console.log(ip);
    if (!this.allowedIps.includes(ip)) {
      throw new ForbiddenException('Error check ip!');
    }

    console.log('signature passed');
    switch (method) {
      case 'trx.cancel':
        console.log('trx_cancel');
        return this.trxCancel(data);
      case 'trx.complete':
        console.log('trx_complete');
        return this.trxComplete(data);
      case 'check.session':
        console.log('check_session');
        return this.checkSession(data);
      case 'check.balance':
        console.log('check_balance');
        return this.checkBalance(data);
      case 'withdraw.bet':
        console.log('withdraw_bet');
        return this.userBet(data);
      case 'deposit.win':
        console.log('deposit_win');
        return this.userWin(data);
      case 'freerounds.activate':
        console.log('freerounds_activate');
        return this.freeroundsActivate(data);
      case 'freerounds.complete':
        console.log('freerounds_complete');
        return this.freeroundsComplete(data);
      case 'freerounds.step':
        console.log('freerounds_step');
        return this.freeroundsStep(data);
      default:
        throw new BadRequestException('Unknown method');
    }
  }

  private trxCancel(data: SlotsCallbackRequestDto): SlotsCallbackResponseDto {
    return { status: 200 };
  }

  private trxComplete(data: SlotsCallbackRequestDto): SlotsCallbackResponseDto {
    return { status: 200 };
  }

  private async checkSession(
    data: SlotsCallbackRequestDto,
  ): Promise<SlotsCallbackResponseDto> {
    if (data.currency !== 'USD') {
      console.log({
        status: 400,
        method: 'withdraw.bet',
        message: 'Ошибка: валюта должна быть USD.',
      });
      return {
        status: 400,
        method: 'withdraw.bet',
        message: 'Ошибка: валюта должна быть USD.',
      };
    }

    console.log('passed usd check');

    try {
      const user = await this.mainPrismaService.user.findUnique({
        where: { clientSeed: data.session },
        select: {
          id: true,
          balance: true,
          role: true,
        },
      });
      console.log('in check.session\n', 'user: ', user);

      if (!user) {
        console.log({
          status: 404,
          method: 'check.session',
          message: 'Unknown user',
        });
        return {
          status: 404,
          method: 'check.session',
          message: 'Unknown user',
        };
      }

      const specialRoles = ['YOUTUBER'];
      const partnerAlias = data['partner.alias'];

      if (specialRoles.includes(user.role)) {
        if (partnerAlias !== 'so_yt20') {
          console.log({
            status: 403,
            method: 'check.session',
            message: 'Invalid partner alias for special role',
          });
          return {
            status: 403,
            method: 'check.session',
            message: 'Invalid partner alias for special role',
          };
        }
      } else {
        if (partnerAlias === 'so_yt20') {
          console.log({
            status: 403,
            method: 'check.session',
            message: 'Invalid partner alias for non-special role',
          });
          return {
            status: 403,
            method: 'check.session',
            message: 'Invalid partner alias for non-special role',
          };
        }
      }

      if (data.currency !== 'USD' || !partnerAlias) {
        console.log({
          status: 400,
          method: 'check.session',
          message: 'Invalid currency or partner alias',
        });
        return {
          status: 400,
          method: 'check.session',
          message: 'Invalid currency or partner alias',
        };
      }

      console.log('returning in check session: ', {
        status: 200,
        method: 'check.session',
        response: {
          id_player: user.id,
          id_group: 'default',
          balance: Math.round(Number(user.balance) * 100),
        },
      });

      return {
        status: 200,
        method: 'check.session',
        response: {
          id_player: user.id,
          id_group: 'default',
          balance: Math.round(Number(user.balance) * 100),
        },
      };
    } catch (error) {
      console.error('Error in check.session:', error);
    }
  }

  private async checkBalance(
    data: SlotsCallbackRequestDto,
  ): Promise<SlotsCallbackResponseDto> {
    const user = await this.mainPrismaService.user.findUnique({
      where: { clientSeed: data.session },
    });

    if (!user) {
      console.log({
        status: 404,
        method: 'check.balance',
        message: 'Unknown user',
      });
      return { status: 404, method: 'check.balance', message: 'Unknown user' };
    }

    return {
      status: 200,
      method: 'check.balance',
      response: {
        currency: 'USD',
        balance: Math.round(Number(user.balance) * 100),
      },
    };
  }

  private calculateUserRakeBack(user: User): number {
    const currentDate = new Date();
    let rakeBackPercent = 0.25;

    if (user.dayRakeBackBonusValidTo > currentDate) {
      rakeBackPercent += 0.25;
    }
    if (user.weekRakeBackBonusValidTo > currentDate) {
      rakeBackPercent += 0.25;
    }
    if (user.monthRakeBackBonusValidTo > currentDate) {
      rakeBackPercent += 0.25;
    }
    if (Number(user.deposit) >= 100) {
      rakeBackPercent += 0.1;
    }
    if (Number(user.deposit) >= 500) {
      rakeBackPercent += 0.2;
    }
    if (Number(user.deposit) >= 1000) {
      rakeBackPercent += 0.3;
    }
    if (Number(user.deposit) >= 5000) {
      rakeBackPercent += 0.5;
    }
    if (Number(user.deposit) >= 10000) {
      rakeBackPercent += 1;
    }
    if (Number(user.deposit) >= 50000) {
      rakeBackPercent += 2;
    }
    if (Number(user.deposit) >= 100000) {
      rakeBackPercent += 3;
    }

    return rakeBackPercent;
  }

  async userBet(
    data: SlotsCallbackRequestDto,
  ): Promise<SlotsCallbackResponseDto> {
    if (data.currency !== 'USD') {
      console.log({
        status: 400,
        method: 'withdraw.bet',
        message: 'Ошибка: валюта должна быть USD.',
      });
      return {
        status: 400,
        method: 'withdraw.bet',
        message: 'Ошибка: валюта должна быть USD.',
      };
    }

    if (!data.session) {
      console.log({
        status: 404,
        method: 'withdraw.bet',
        message: 'Unknown session',
      });
      return {
        status: 404,
        method: 'withdraw.bet',
        message: 'Unknown session',
      };
    }

    if (!data.amount) {
      console.log({
        status: 400,
        method: 'withdraw.bet',
        message: 'Amount is required',
      });
      return {
        status: 400,
        method: 'withdraw.bet',
        message: 'Amount is required',
      };
    }

    let mutex = this.sessionMutexMap.get(data.session);
    if (!mutex) {
      mutex = new Mutex();
      this.sessionMutexMap.set(data.session, mutex);
    }

    const release = await mutex.acquire();

    try {
      const user = await this.mainPrismaService.user.findUnique({
        where: { clientSeed: data.session },
        select: {
          id: true,
          balance: true,
          wager: true,
          betSum: true,
          games: true,
          topWin: true,
          role: true,
        },
      });

      if (!user) {
        console.log({
          status: 404,
          method: 'withdraw.bet',
          message: 'Unknown user',
        });
        return { status: 404, method: 'withdraw.bet', message: 'Unknown user' };
      }

      const specialRoles = ['YOUTUBER'];
      let agregator = data['partner.alias'] || null;
      if (specialRoles.includes(user.role)) {
        agregator = 'so_yt20';
      }

      const amount = data.amount / 100;

      if (Number(user.balance) < amount) {
        console.log({
          status: 400,
          method: 'withdraw.bet',
          message: 'Insufficient balance',
        });
        return {
          status: 400,
          method: 'withdraw.bet',
          message: 'Insufficient balance',
        };
      }

      const wager = Math.max(Number(user.wager) - amount, 0);

      return await this.mainPrismaService.$transaction(async (mainTx) => {
        const updatedUser = await mainTx.user.update({
          where: { id: user.id },
          data: {
            balance: { decrement: amount },
            wager: wager,
            betSum: { increment: amount },
            games: { increment: 1 },
          },
        });

        const rakeBackPercent = this.calculateUserRakeBack(updatedUser);
        const rakeBackAmount = new Decimal(amount)
          .mul(rakeBackPercent / 100)
          .toDecimalPlaces(6, Decimal.ROUND_HALF_UP);

        await mainTx.user.update({
          where: { id: user.id },
          data: {
            rakeBackBalance: { increment: rakeBackAmount.toNumber() * 0.06 },
            totalRakeBackAmount: {
              increment: rakeBackAmount.toNumber() * 0.06,
            },
          },
        });

        const currentTopWin = new Decimal(user.topWin || 0);
        const newTopWin = Decimal.max(
          currentTopWin,
          new Decimal(amount),
        ).toNumber();

        await mainTx.user.update({
          where: { id: user.id },
          data: {
            topWin: { set: newTopWin },
          },
        });

        await this.localPrismaService.$transaction(async (localTx) => {
          await localTx.slotSpins.create({
            data: {
              userId: user.id,
              gameId: data.meta?.tag?.game_id || null,
              type: 'bet',
              value: amount,
              transactionId: data.trx_id || null,
              gameToken: data.session,
              agregator: agregator,
            },
          });
        });

        const redis = this.redisService.getOrThrow();
        const cacheKey = `user.${user.id}.historyBalance`;

        let historyBalance = await redis.get(cacheKey);
        let historyArray = historyBalance ? JSON.parse(historyBalance) : [];

        if (!Array.isArray(historyArray)) {
          historyArray = [];
        }

        const histBalance = {
          user_id: user.id,
          type: 'Ставка в слотах',
          balance_before: Number(user.balance),
          balance_after: Number(user.balance) - amount,
          date: new Date().toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }),
        };

        historyArray.push(histBalance);
        await redis.set(cacheKey, JSON.stringify(historyArray));

        return {
          status: 200,
          method: 'withdraw.bet',
          response: {
            currency: 'USD',
            balance: Math.round(Number(updatedUser.balance) * 100),
          },
        };
      });
    } catch (error) {
      console.error('Error processing userBet:', error);
      return {
        status: 500,
        method: 'withdraw.bet',
        message: 'Internal server error',
      };
    } finally {
      release();
    }
  }

  private async userWin(
    data: SlotsCallbackRequestDto,
  ): Promise<SlotsCallbackResponseDto> {
    const requestData = data.body || data;

    if (requestData.currency !== 'USD') {
      console.log({
        status: 400,
        method: 'deposit.win',
        message: 'Ошибка: валюта должна быть USD.',
      });
      return {
        status: 400,
        method: 'deposit.win',
        message: 'Ошибка: валюта должна быть USD.',
      };
    }

    if (!requestData.session) {
      console.log({
        status: 404,
        method: 'deposit.win',
        message: 'Unknown session',
      });
      return { status: 404, method: 'deposit.win', message: 'Unknown session' };
    }

    let mutex = this.sessionMutexMap.get(requestData.session);
    if (!mutex) {
      mutex = new Mutex();
      this.sessionMutexMap.set(requestData.session, mutex);
    }

    const release = await mutex.acquire();

    try {
      const user = await this.mainPrismaService.user.findUnique({
        where: { clientSeed: requestData.session },
        select: {
          id: true,
          balance: true,
          winSum: true,
          games: true,
          topWin: true,
          photoUrl: true,
          firstName: true,
          role: true,
        },
      });

      if (!user) {
        console.log({
          status: 404,
          method: 'deposit.win',
          message: 'Unknown user',
        });
        return { status: 404, method: 'deposit.win', message: 'Unknown user' };
      }

      const specialRoles = ['YOUTUBER'];
      let agregator = requestData['partner.alias'] || null;
      if (specialRoles.includes(user.role)) {
        agregator = 'so_yt20';
      }

      const amount = new Decimal(requestData.amount / 100);

      return await this.mainPrismaService.$transaction(async (mainTx) => {
        const updatedUser = await mainTx.user.update({
          where: { id: user.id },
          data: {
            balance: { increment: amount.toNumber() },
            winSum: { increment: amount.toNumber() },
            games: { increment: 1 },
          },
        });

        const rakeBackPercent = this.calculateUserRakeBack(updatedUser);
        const rakeBackAmount = new Decimal(amount)
          .mul(rakeBackPercent / 100)
          .toDecimalPlaces(6, Decimal.ROUND_HALF_UP);

        await mainTx.user.update({
          where: { id: user.id },
          data: {
            rakeBackBalance: { increment: rakeBackAmount.toNumber() * 0.06 },
            totalRakeBackAmount: {
              increment: rakeBackAmount.toNumber() * 0.06,
            },
          },
        });

        const currentTopWin = new Decimal(user.topWin || 0);
        const newTopWin = Decimal.max(currentTopWin, amount).toNumber();

        await mainTx.user.update({
          where: { id: user.id },
          data: {
            topWin: { set: newTopWin },
          },
        });

        await this.localPrismaService.$transaction(async (localTx) => {
          await localTx.slotSpins.create({
            data: {
              userId: user.id,
              gameId: requestData.meta?.tag?.game_id || null,
              type: 'win',
              value: amount.toNumber(),
              transactionId: requestData.trx_id || null,
              gameToken: requestData.session,
              agregator: agregator,
            },
          });
        });

        const redis = this.redisService.getOrThrow();
        const cacheKey = `user.${user.id}.historyBalance`;

        let cacheHistUser = await redis.get(cacheKey);
        if (!cacheHistUser) {
          cacheHistUser = '[]';
        }

        let historyBalance = JSON.parse(cacheHistUser);
        if (!Array.isArray(historyBalance)) {
          historyBalance = [];
        }

        const histBalance = {
          user_id: user.id,
          type: 'Выигрыш в слотах',
          balance_before: new Decimal(user.balance).minus(amount).toNumber(),
          balance_after: new Decimal(user.balance).toNumber(),
          date: new Date().toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }),
        };

        historyBalance.push(histBalance);
        await redis.set(cacheKey, JSON.stringify(historyBalance));

        if (amount.greaterThan(1)) {
          const callback = {
            icon_game: 'slots',
            name_game: requestData.meta.tag.game,
            avatar: user.photoUrl,
            name: user.firstName,
            bet: 0,
            win: amount.toNumber(),
          };

          await redis.publish('history', JSON.stringify(callback));

          const updateLiveGames = [
            {
              time: Math.floor(Date.now() / 1000),
              game_type: 'mobile',
              game_id: requestData.meta?.tag?.game_id || null,
              game_name: requestData.meta.tag.game,
              user_name: user.firstName,
              user_win: amount.toNumber(),
              game_img: '/img/slots/default.jpg',
            },
          ];

          await redis.publish(
            'updateLiveGames',
            JSON.stringify(updateLiveGames),
          );

          let bets = await redis.get('games');
          if (!bets) {
            bets = '[]';
          }

          let betsArray = JSON.parse(bets);
          if (!Array.isArray(betsArray)) {
            betsArray = [];
          }

          betsArray.push(callback);
          betsArray = betsArray.slice(-10);
          await redis.set('games', JSON.stringify(betsArray));
        }

        const postData = {
          slotId: requestData.meta.tag.game_id,
          photoUrl: user.photoUrl,
          firstName: user.firstName,
          bet: requestData.meta.tag.bet / 100,
          result: amount.toNumber(),
          userDeposit: updatedUser.deposit.toNumber(),
        };

        try {
          const response = await axios.post(
            `${this.configService.get<AppConfig['MAIN_APP_URL']>(
              'MAIN_APP_URL',
            )}/live-feed/push-bet`,
            postData,
            {
              headers: { 'Content-Type': 'application/json' },
            },
          );

          console.log(postData);

          console.log('Успешный ответ:', {
            status: response.status,
            data: response.data,
          });
        } catch (err) {
          console.error('Ошибка отправки данных на основной сайт:', {
            message: err.message,
            response: err.response?.data,
            status: err.response?.status,
          });
        }

        return {
          status: 200,
          method: 'deposit.win',
          response: {
            currency: 'USD',
            balance: Math.round(Number(updatedUser.balance) * 100),
          },
        };
      });
    } catch (error) {
      console.error('Error processing userWin:', error);
      return {
        status: 500,
        method: 'deposit.win',
        message: 'Internal server error',
      };
    } finally {
      release();
    }
  }

  private async freeroundsActivate(
    data: SlotsCallbackRequestDto,
  ): Promise<SlotsCallbackResponseDto> {
    if (data.currency !== 'USD') {
      return {
        status: 400,
        method: 'freerounds.activate',
        message: 'Ошибка: валюта должна быть USD.',
      };
    }

    if (!data.session) {
      return {
        status: 404,
        method: 'freerounds.activate',
        message: 'Unknown session',
      };
    }

    if (!data.freerounds_id) {
      return {
        status: 400,
        method: 'freerounds.activate',
        message: 'Freerounds ID is required',
      };
    }

    if (!data.game_id) {
      return {
        status: 400,
        method: 'freerounds.activate',
        message: 'Game ID is required',
      };
    }

    let mutex = this.sessionMutexMap.get(data.session);
    if (!mutex) {
      mutex = new Mutex();
      this.sessionMutexMap.set(data.session, mutex);
    }

    const release = await mutex.acquire();

    try {
      const user = await this.mainPrismaService.user.findUnique({
        where: { clientSeed: data.session },
      });

      if (!user) {
        return {
          status: 404,
          method: 'freerounds.activate',
          message: 'Unknown user',
        };
      }

      const freespin = await this.mainPrismaService.freespin.findUnique({
        where: {
          id: data.freerounds_id,
          userId: user.id,
          gameId: data.game_id,
          status: {
            in: [0, 1],
          },
        },
      });

      if (!freespin) {
        return {
          status: 404,
          method: 'freerounds.activate',
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
        method: 'freerounds.activate',
        response: {
          total: freespin.count,
          betlevel: freespin.betLevel,
          rate: freespin.rate,
          currency: data.currency || 'USD',
        },
      };
    } catch (error) {
      console.error('Freerounds activate error:', error);
      return {
        status: 500,
        method: 'freerounds.activate',
        message: 'Internal server error',
      };
    } finally {
      release();
    }
  }

  private async freeroundsComplete(
    data: SlotsCallbackRequestDto,
  ): Promise<SlotsCallbackResponseDto> {
    if (!data.session) {
      console.log({
        status: 404,
        method: 'freerounds.complete',
        message: 'Unknown session',
      });
      return {
        status: 404,
        method: 'freerounds.complete',
        message: 'Unknown session',
      };
    }

    if (!data.freerounds_id) {
      console.log({
        status: 400,
        method: 'freerounds.complete',
        message: 'Freerounds ID is required',
      });
      return {
        status: 400,
        method: 'freerounds.complete',
        message: 'Freerounds ID is required',
      };
    }

    if (!data.total_win) {
      console.log({
        status: 400,
        method: 'freerounds.complete',
        message: 'Total win amount is required',
      });
      return {
        status: 400,
        method: 'freerounds.complete',
        message: 'Total win amount is required',
      };
    }

    let mutex = this.sessionMutexMap.get(data.session);
    if (!mutex) {
      mutex = new Mutex();
      this.sessionMutexMap.set(data.session, mutex);
    }

    const release = await mutex.acquire();

    try {
      const user = await this.mainPrismaService.user.findUnique({
        where: { clientSeed: data.session },
      });

      if (!user) {
        console.log({
          status: 404,
          method: 'freerounds.complete',
          message: 'Unknown user',
        });
        return {
          status: 404,
          method: 'freerounds.complete',
          message: 'Unknown user',
        };
      }

      const freespin = await this.mainPrismaService.freespin.findUnique({
        where: {
          id: data.freerounds_id,
          userId: user.id,
          status: 1,
        },
      });

      if (!freespin) {
        console.log({
          status: 404,
          method: 'freerounds.complete',
          message: 'No active freespins found',
        });
        return {
          status: 404,
          method: 'freerounds.complete',
          message: 'No active freespins found',
        };
      }

      const winAmount = Number(data.total_win) / 100;
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
          data: {
            status: 2,
          },
        }),
      ]);

      console.log({
        status: 200,
        method: 'freerounds.complete',
        response: {
          currency: data.currency || 'USD',
          balance: Math.round(Number(updatedUser.balance) * 100),
        },
      });
      return {
        status: 200,
        method: 'freerounds.complete',
        response: {
          currency: data.currency || 'USD',
          balance: Math.round(Number(updatedUser.balance) * 100),
        },
      };
    } catch (error) {
      console.error('Freerounds complete error:', error);
      return {
        status: 500,
        method: 'freerounds.complete',
        message: 'Internal server error',
      };
    } finally {
      release();
    }
  }

  private async freeroundsStep(
    data: SlotsCallbackRequestDto,
  ): Promise<boolean> {
    console.log('freeroundsStep called, но мне похуй');
    return true;
  }
}
