import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationsService } from './notifications.service';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { PushNotificationsService } from './services/push-notifications.service';
import {
  SavePushSubscriptionDto,
  UnsubscribePushDto,
} from './dto/push-subscription.dto';

interface AuthenticatedRequest {
  user: {
    id: number;
    role?: string;
    username?: string;
    companyId?: number | null;
  };
  headers: Record<string, string | undefined>;
}

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly pushService: PushNotificationsService,
  ) {}

  @Get()
  findAll(
    @Request() req: AuthenticatedRequest,
    @Query('page') page = 0,
    @Query('pageSize') pageSize = 20,
  ) {
    return this.notificationsService.findAll(
      req.user.id,
      +page,
      +pageSize,
      req.user,
    );
  }

  @Get('unread-count')
  getUnreadCount(@Request() req: AuthenticatedRequest) {
    return this.notificationsService
      .getUnreadCount(req.user.id, req.user)
      .then((count) => ({ count }));
  }

  @Get('preferences')
  getPreferences(@Request() req: AuthenticatedRequest) {
    return this.notificationsService.getPreferences(req.user.id);
  }

  @Patch('preferences')
  updatePreferences(
    @Request() req: AuthenticatedRequest,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.notificationsService.updatePreferences(req.user.id, dto);
  }

  @Get('push/public-key')
  getPushPublicKey() {
    return { publicKey: this.pushService.getPublicKey() };
  }

  @Post('push/subscribe')
  subscribePush(
    @Request() req: AuthenticatedRequest,
    @Body() dto: SavePushSubscriptionDto,
  ) {
    const userAgent = req.headers['user-agent'];
    return this.pushService.saveSubscription(req.user.id, dto, userAgent);
  }

  @Post('push/unsubscribe')
  unsubscribePush(
    @Request() req: AuthenticatedRequest,
    @Body() dto: UnsubscribePushDto,
  ) {
    return this.pushService.removeSubscription(req.user.id, dto.endpoint);
  }

  @Post('push/test')
  sendTestPush(@Request() req: AuthenticatedRequest) {
    return this.pushService.sendTestPush(req.user.id);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  markAsRead(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
  ): Promise<void> {
    return this.notificationsService.markAsRead(id, req.user.id);
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  markAllAsRead(@Request() req: AuthenticatedRequest): Promise<void> {
    return this.notificationsService.markAllAsRead(req.user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
  ): Promise<void> {
    return this.notificationsService.remove(id, req.user.id);
  }
}
