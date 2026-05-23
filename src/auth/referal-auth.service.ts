import { BadRequestException, Injectable } from '@nestjs/common';
import { MainPrismaService } from 'src/main-prisma.service';

@Injectable()
export class ReferalAuthService {
  constructor(private readonly prisma: MainPrismaService) {}

  async createRelationsBetweenUserAndReferal(
    referalId: string,
    referalCode: string,
    tgId: number | null,
  ): Promise<void> {
    const referrer = await this.prisma.user.findFirst({
      where: { referalCode },
    });
    if (!referrer) {
      return;
    }

    const existingReferal = await this.prisma.referal.findFirst({
      where: { userId: referalId },
    });
    if (existingReferal) {
      throw new BadRequestException('Referral relationship already exists');
    }

    await this.prisma.referal.create({
      data: {
        referralId: referrer.id,
        userId: referalId,
        tgId: tgId != null ? BigInt(tgId) : null,
      },
    });
  }
}
