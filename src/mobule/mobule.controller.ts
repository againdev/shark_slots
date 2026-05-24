import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  ForbiddenException,
  BadRequestException,
  Param,
} from '@nestjs/common';
import { MobuleService } from './mobule.service';
import { Request } from 'express';
import {
  SlotsCallbackRequestDto,
  SlotsCallbackResponseDto,
} from './mobule.dto';

@Controller('mobule/callback')
export class MobuleController {
  constructor(private readonly mobuleService: MobuleService) { }

  @Post(':method')
  async callback(
    @Param('method') method: string,
    @Body() data: SlotsCallbackRequestDto,
    @Req() req: Request,
  ): Promise<SlotsCallbackResponseDto | boolean> {
    console.log('callback mobule');

    if (!method) {
      throw new BadRequestException('Method is required');
    }

    console.log('got callback with method: ', method);
    console.log('got callback data: ', data);

    try {
      const result = await this.mobuleService.callback(method, data, req);
      if (method === 'check.session') {
        console.log('check.session response:', result);
      }
      return result;
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException('Internal server error');
    }
  }
}
