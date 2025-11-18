import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthController } from './health.controller';
import { HealthDataService } from './health-data.service';
import { GoogleFitService } from './google-fit.service';
import { UserHealthData } from '../database/entities/health-data.entity';
import { UsersModule } from '../users/users.module';
import { GoogleTokenRefreshService } from '../auth/google-token-refresh.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserHealthData]), UsersModule],
  controllers: [HealthController],
  providers: [HealthDataService, GoogleFitService, GoogleTokenRefreshService],
  exports: [HealthDataService],
})
export class HealthModule {}

