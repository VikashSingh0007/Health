import {
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
  Query,
  ParseIntPipe,
  Body,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HealthDataService } from './health-data.service';
import { GoogleFitService } from './google-fit.service';

@Controller('health')
export class HealthController {
  constructor(
    private healthDataService: HealthDataService,
    private googleFitService: GoogleFitService,
  ) {}

  @Post('fetch')
  @UseGuards(JwtAuthGuard)
  async fetchHealthData(@Req() req: Request) {
    const user = req.user as any;
    const healthData = await this.healthDataService.fetchAndSaveHealthData(
      user.userId,
    );
    return {
      message: 'Health data fetched and saved successfully',
      data: healthData,
    };
  }

  @Get('latest')
  @UseGuards(JwtAuthGuard)
  async getLatestHealthData(@Req() req: Request) {
    const user = req.user as any;
    const healthData = await this.healthDataService.getLatestHealthData(
      user.userId,
    );
    if (!healthData) {
      return {
        message: 'No health data found',
        data: null,
      };
    }
    return {
      data: healthData,
    };
  }

  @Get('dashboard')
  @UseGuards(JwtAuthGuard)
  async getDashboardData(@Req() req: Request) {
    const user = req.user as any;
    const dashboardData = await this.healthDataService.getDashboardData(
      user.userId,
    );
    return dashboardData;
  }

  @Get('history')
  @UseGuards(JwtAuthGuard)
  async getHistory(
    @Req() req: Request,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const user = req.user as any;
    const start = startDate
      ? new Date(startDate)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
    const end = endDate ? new Date(endDate) : new Date();

    const history = await this.healthDataService.getHealthDataByDateRange(
      user.userId,
      start,
      end,
    );

    // Transform decimal fields to numbers (PostgreSQL returns them as strings)
    const transformedHistory = history.map((item) => ({
      ...item,
      distance: item.distance != null ? Number(item.distance) : null,
      weight: item.weight != null ? Number(item.weight) : null,
      height: item.height != null ? Number(item.height) : null,
      sleep_duration: item.sleep_duration != null ? Number(item.sleep_duration) : null,
      speed: item.speed != null ? Number(item.speed) : null,
    }));

    return {
      data: transformedHistory,
      startDate: start,
      endDate: end,
    };
  }

  /**
   * Test endpoint to insert heart rate data into Google Fit
   * This is for testing purposes - inserts a heart rate measurement
   */
  @Post('test/heart-rate')
  @UseGuards(JwtAuthGuard)
  async insertTestHeartRate(
    @Req() req: Request,
    @Body() body: { heartRate: number; timestamp?: string },
  ) {
    const user = req.user as any;
    const heartRate = body.heartRate || 72; // Default 72 bpm
    const timestamp = body.timestamp ? new Date(body.timestamp) : new Date();

    // Insert into Google Fit
    const success = await this.googleFitService.insertHeartRateData(
      user.userId,
      heartRate,
      timestamp,
    );

    if (success) {
      // Also save directly to our database so it shows immediately
      // This ensures the data is available even if Google Fit hasn't aggregated it yet
      await this.healthDataService.saveHealthData(user.userId, {
        heart_rate: heartRate,
      });

      // Fetch the updated data to return
      const updatedData = await this.healthDataService.getLatestHealthData(
        user.userId,
      );

      return {
        message: 'Heart rate data inserted successfully',
        heartRate,
        timestamp: timestamp.toISOString(),
        data: updatedData,
      };
    } else {
      return {
        message: 'Failed to insert heart rate data',
        error: 'Check backend logs for details',
      };
    }
  }

  /**
   * Fetch real health data from Google Fit API for last N days
   * This will fetch actual data from user's Google Fit account
   */
  @Post('test/fetch-real-data')
  @UseGuards(JwtAuthGuard)
  async fetchRealData(
    @Req() req: Request,
    @Body() body: { days?: number },
  ) {
    const user = req.user as any;
    const days = body.days || 30;
    
    const fetchedCount = await this.healthDataService.fetchRealDataFromGoogleFit(
      user.userId,
      days,
    );
    
    return {
      message: `Real data fetched from Google Fit successfully`,
      fetchedCount,
      days,
      userId: user.userId,
    };
  }

  /**
   * Get leaderboard - all users ranked by steps or calories
   * Supports date range filtering: today, week, month
   */
  @Get('leaderboard')
  @UseGuards(JwtAuthGuard)
  async getLeaderboard(
    @Req() req: Request,
    @Query('metric') metric?: 'steps' | 'calories',
    @Query('limit') limit?: string,
    @Query('period') period?: 'today' | 'week' | 'month',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const user = req.user as any;
    const metricType = metric || 'steps';
    const limitNum = limit ? parseInt(limit, 10) : 50;

    // Calculate date range based on period
    let start: Date | undefined;
    let end: Date | undefined;

    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
    } else if (period) {
      const now = new Date();
      end = new Date(now);
      end.setHours(23, 59, 59, 999);

      switch (period) {
        case 'today':
          start = new Date(now);
          start.setHours(0, 0, 0, 0);
          break;
        case 'week':
          start = new Date(now);
          start.setDate(now.getDate() - 7);
          start.setHours(0, 0, 0, 0);
          break;
        case 'month':
          start = new Date(now.getFullYear(), now.getMonth(), 1);
          start.setHours(0, 0, 0, 0);
          break;
      }
    }

    const leaderboard = await this.healthDataService.getLeaderboard(
      metricType,
      limitNum,
      start,
      end,
    );

    // Mark current user in leaderboard
    const leaderboardWithCurrentUser = leaderboard.map((entry) => ({
      ...entry,
      isCurrentUser: entry.userId === user.userId,
    }));

    return {
      data: leaderboardWithCurrentUser,
      metric: metricType,
      currentUserId: user.userId,
    };
  }

  /**
   * Get location-based statistics for company funding
   * Supports date range filtering: today, week, month
   */
  @Get('locations/stats')
  @UseGuards(JwtAuthGuard)
  async getLocationStatistics(
    @Query('period') period?: 'today' | 'week' | 'month',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    // Calculate date range based on period
    let start: Date | undefined;
    let end: Date | undefined;

    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
    } else if (period) {
      const now = new Date();
      end = new Date(now);
      end.setHours(23, 59, 59, 999);

      switch (period) {
        case 'today':
          start = new Date(now);
          start.setHours(0, 0, 0, 0);
          break;
        case 'week':
          start = new Date(now);
          start.setDate(now.getDate() - 7);
          start.setHours(0, 0, 0, 0);
          break;
        case 'month':
          start = new Date(now.getFullYear(), now.getMonth(), 1);
          start.setHours(0, 0, 0, 0);
          break;
      }
    }

    const stats = await this.healthDataService.getLocationStatistics(start, end);
    return {
      data: stats,
      message: 'Location statistics retrieved successfully',
    };
  }

  /**
   * Get location-based leaderboard
   */
  @Get('locations/leaderboard')
  @UseGuards(JwtAuthGuard)
  async getLocationLeaderboard(
    @Req() req: Request,
    @Query('location') location?: string,
    @Query('metric') metric?: 'steps' | 'calories',
  ) {
    const user = req.user as any;
    const metricType = metric || 'steps';

    const leaderboard = await this.healthDataService.getLocationLeaderboard(
      location,
      metricType,
    );

    // Mark current user
    const leaderboardWithCurrentUser = leaderboard.map((entry) => ({
      ...entry,
      isCurrentUser: entry.userId === user.userId,
    }));

    return {
      data: leaderboardWithCurrentUser,
      location: location || 'All Locations',
      metric: metricType,
      currentUserId: user.userId,
    };
  }

  /**
   * Get all available locations
   */
  @Get('locations')
  @UseGuards(JwtAuthGuard)
  async getAllLocations() {
    const { UsersService } = await import('../users/users.service');
    // We need to inject this properly, but for now let's use healthDataService
    // Actually, let's add this method to healthDataService
    return {
      message: 'Use /health/locations/list endpoint',
    };
  }

  @Get('locations/list')
  @UseGuards(JwtAuthGuard)
  async getLocationsList() {
    const locations = await this.healthDataService.getAllLocations();
    return {
      data: locations,
    };
  }
}

