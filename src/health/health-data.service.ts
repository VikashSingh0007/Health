import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { UserHealthData } from '../database/entities/health-data.entity';
import { GoogleFitService } from './google-fit.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class HealthDataService {
  constructor(
    @InjectRepository(UserHealthData)
    private healthDataRepository: Repository<UserHealthData>,
    private googleFitService: GoogleFitService,
    private usersService: UsersService,
  ) {}

  async saveHealthData(userId: string, data: any): Promise<UserHealthData> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let healthData = await this.healthDataRepository.findOne({
      where: {
        user_id: userId,
        date: today,
      },
    });

    if (!healthData) {
      const newHealthData = {
        user_id: userId,
        date: today,
        steps: data.steps || 0,
        heart_rate: data.heart_rate || null,
        calories: data.calories || null,
        distance: data.distance || null,
        weight: data.weight || null,
        height: data.height || null,
        sleep_duration: data.sleep_duration || null,
        active_minutes: data.active_minutes || null,
        speed: data.speed || null,
      };
      healthData = this.healthDataRepository.create(newHealthData);
    } else {
      Object.assign(healthData, data);
    }

    return this.healthDataRepository.save(healthData);
  }

  async getLatestHealthData(userId: string): Promise<UserHealthData | null> {
    return this.healthDataRepository.findOne({
      where: { user_id: userId },
      order: { fetched_at: 'DESC' },
    });
  }

  async getHealthDataByDateRange(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<UserHealthData[]> {
    return this.healthDataRepository.find({
      where: {
        user_id: userId,
        date: Between(startDate, endDate),
      },
      order: { date: 'DESC' },
    });
  }

  async fetchAndSaveHealthData(userId: string): Promise<UserHealthData> {
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    // Use Promise.allSettled to handle individual failures gracefully
    // This way if one data type fails (e.g., token expired), others can still succeed
    const results = await Promise.allSettled([
      this.googleFitService.fetchSteps(userId, startOfDay, endOfDay),
      this.googleFitService.fetchHeartRate(userId, startOfDay, endOfDay),
      this.googleFitService.fetchCalories(userId, startOfDay, endOfDay),
      this.googleFitService.fetchDistance(userId, startOfDay, endOfDay),
      this.googleFitService.fetchWeight(userId, startOfDay, endOfDay),
      this.googleFitService.fetchHeight(userId, startOfDay, endOfDay),
      this.googleFitService.fetchSleepDuration(userId, startOfDay, endOfDay),
      this.googleFitService.fetchActiveMinutes(userId, startOfDay, endOfDay),
      this.googleFitService.fetchSpeed(userId, startOfDay, endOfDay),
    ]);

    // Extract values, handling both fulfilled and rejected promises
    const steps = results[0].status === 'fulfilled' ? results[0].value : 0;
    const heartRate = results[1].status === 'fulfilled' ? results[1].value : null;
    const calories = results[2].status === 'fulfilled' ? results[2].value : null;
    const distance = results[3].status === 'fulfilled' ? results[3].value : null;
    const weight = results[4].status === 'fulfilled' ? results[4].value : null;
    const height = results[5].status === 'fulfilled' ? results[5].value : null;
    const sleepDuration = results[6].status === 'fulfilled' ? results[6].value : null;
    const activeMinutes = results[7].status === 'fulfilled' ? results[7].value : null;
    const speed = results[8].status === 'fulfilled' ? results[8].value : null;

    // Log any errors for debugging
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const dataTypes = ['steps', 'heartRate', 'calories', 'distance', 'weight', 'height', 'sleepDuration', 'activeMinutes', 'speed'];
        console.error(`Error fetching ${dataTypes[index]}:`, result.reason?.message || result.reason);
      }
    });

    const savedData = await this.saveHealthData(userId, {
      steps,
      heart_rate: heartRate,
      calories,
      distance,
      weight,
      height,
      sleep_duration: sleepDuration,
      active_minutes: activeMinutes,
      speed,
    });
    
    console.log('Health data saved:', {
      userId,
      steps: savedData.steps,
      heartRate: savedData.heart_rate,
      calories: savedData.calories,
      date: savedData.date,
    });
    
    return savedData;
  }

  async getDashboardData(userId: string): Promise<any> {
    // Get TODAY's data, not just latest record
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayData = await this.healthDataRepository.findOne({
      where: {
        user_id: userId,
        date: today,
      },
      order: { fetched_at: 'DESC' },
    });
    
    console.log('getDashboardData - today data:', todayData ? {
      id: todayData.id,
      steps: todayData.steps,
      heartRate: todayData.heart_rate,
      calories: todayData.calories,
      date: todayData.date,
    } : 'null');
    
    // If no data for today, get latest available data as fallback
    if (!todayData) {
      console.log('No data found for today, fetching latest available data...');
      const latest = await this.getLatestHealthData(userId);
      
      if (!latest) {
        console.log('No health data found for user:', userId);
        return {
          steps: 0,
          calories: null,
          heartRate: null,
          distance: null,
          weight: null,
          height: null,
          sleepDuration: null,
          activeMinutes: null,
          speed: null,
          date: null,
        };
      }
      
      // Use latest data but log that it's not today's
      console.log('Using latest available data (not today):', {
        date: latest.date,
        steps: latest.steps,
      });
      
      const dashboardData = {
        steps: latest.steps,
        calories: latest.calories,
        heartRate: latest.heart_rate,
        distance: latest.distance != null ? Number(latest.distance) : null,
        weight: latest.weight != null ? Number(latest.weight) : null,
        height: latest.height != null ? Number(latest.height) : null,
        sleepDuration: latest.sleep_duration != null ? Number(latest.sleep_duration) : null,
        activeMinutes: latest.active_minutes,
        speed: latest.speed != null ? Number(latest.speed) : null,
        date: latest.date,
      };
      
      console.log('Dashboard data being returned (latest, not today):', dashboardData);
      return dashboardData;
    }

    // Convert decimal fields to numbers (PostgreSQL returns them as strings)
    const dashboardData = {
      steps: todayData.steps,
      calories: todayData.calories,
      heartRate: todayData.heart_rate,
      distance: todayData.distance != null ? Number(todayData.distance) : null,
      weight: todayData.weight != null ? Number(todayData.weight) : null,
      height: todayData.height != null ? Number(todayData.height) : null,
      sleepDuration: todayData.sleep_duration != null ? Number(todayData.sleep_duration) : null,
      activeMinutes: todayData.active_minutes,
      speed: todayData.speed != null ? Number(todayData.speed) : null,
      date: todayData.date,
    };
    
    console.log('Dashboard data being returned (today):', dashboardData);
    
    return dashboardData;
  }

  /**
   * Get leaderboard - all users with their latest health data
   * Sorted by metric (steps or calories)
   * Supports date range filtering (today, week, month)
   */
  async getLeaderboard(
    metric: 'steps' | 'calories' = 'steps',
    limit: number = 50,
    startDate?: Date,
    endDate?: Date,
  ): Promise<any[]> {
    // Determine date range
    let start: Date;
    let end: Date = new Date();
    end.setHours(23, 59, 59, 999);

    if (startDate && endDate) {
      start = startDate;
      end = endDate;
    } else {
      // Default to today
      start = new Date();
      start.setHours(0, 0, 0, 0);
    }

    // Get all health data entries within date range
    const healthData = await this.healthDataRepository
      .createQueryBuilder('health')
      .where('health.date >= :start', { start })
      .andWhere('health.date <= :end', { end })
      .orderBy('health.fetched_at', 'DESC')
      .getMany();

    // Aggregate data by user (sum for date range, or latest for single day)
    const userDataMap = new Map<string, any>();
    const isSingleDay = start.toDateString() === end.toDateString();

    if (isSingleDay) {
      // For single day, get latest data per user
      healthData.forEach((data) => {
        if (!userDataMap.has(data.user_id)) {
          userDataMap.set(data.user_id, data);
        }
      });
    } else {
      // For date range, aggregate (sum) data per user
      healthData.forEach((data) => {
        if (!userDataMap.has(data.user_id)) {
          userDataMap.set(data.user_id, {
            ...data,
            steps: data.steps || 0,
            calories: data.calories || 0,
            active_minutes: data.active_minutes || 0,
          });
        } else {
          const existing = userDataMap.get(data.user_id);
          existing.steps += data.steps || 0;
          existing.calories += data.calories || 0;
          existing.active_minutes += data.active_minutes || 0;
        }
      });
    }

    // Fetch user info for each user
    const leaderboardEntries = await Promise.all(
      Array.from(userDataMap.values()).map(async (healthData) => {
        const user = await this.usersService.findById(healthData.user_id);
        if (!user) return null;

        return {
          userId: user.id,
          name: user.name,
          picture: user.picture,
          email: user.email,
          steps: healthData.steps || 0,
          calories: healthData.calories || 0,
          heartRate: healthData.heart_rate,
          distance: healthData.distance != null ? Number(healthData.distance) : null,
          weight: healthData.weight != null ? Number(healthData.weight) : null,
          height: healthData.height != null ? Number(healthData.height) : null,
          activeMinutes: healthData.active_minutes || 0,
          date: healthData.date,
        };
      }),
    );

    // Filter out null entries and sort by metric
    const validEntries = leaderboardEntries.filter((entry) => entry !== null);
    
    validEntries.sort((a, b) => {
      const aValue = metric === 'steps' ? a.steps : (a.calories || 0);
      const bValue = metric === 'steps' ? b.steps : (b.calories || 0);
      return bValue - aValue; // Descending order
    });

    // Add rank to each entry
    const rankedEntries = validEntries.map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));

    // Limit results
    return rankedEntries.slice(0, limit);
  }

  /**
   * Get location-based statistics
   * Returns aggregated health data by location
   * Supports date range filtering
   */
  async getLocationStatistics(
    startDate?: Date,
    endDate?: Date,
  ): Promise<any[]> {
    // Determine date range
    let start: Date;
    let end: Date = new Date();
    end.setHours(23, 59, 59, 999);

    if (startDate && endDate) {
      start = startDate;
      end = endDate;
    } else {
      // Default to today
      start = new Date();
      start.setHours(0, 0, 0, 0);
    }

    // Get all locations
    const locations = await this.usersService.getAllLocations();

    // Get statistics for each location
    const locationStats = await Promise.all(
      locations.map(async (location) => {
        // Get users in this location
        const users = await this.usersService.getUsersByLocation(location);
        const userIds = users.map((u) => u.id);

        if (userIds.length === 0) {
          return null;
        }

        // Get health data for all users in this location within date range
        const healthData = await this.healthDataRepository
          .createQueryBuilder('health')
          .where('health.user_id IN (:...userIds)', { userIds })
          .andWhere('health.date >= :start', { start })
          .andWhere('health.date <= :end', { end })
          .getMany();

        // Calculate aggregates (sum for date range)
        const totalSteps = healthData.reduce((sum, d) => sum + (d.steps || 0), 0);
        const totalCalories = healthData.reduce(
          (sum, d) => sum + (d.calories || 0),
          0,
        );
        const totalActiveMinutes = healthData.reduce(
          (sum, d) => sum + (d.active_minutes || 0),
          0,
        );
        
        // Calculate unique days for average calculation
        // Handle date as either Date object or string
        const uniqueDays = new Set(
          healthData.map((d) => {
            const date = d.date instanceof Date ? d.date : new Date(d.date);
            return date.toISOString().split('T')[0];
          })
        ).size;
        const avgSteps = uniqueDays > 0 ? totalSteps / uniqueDays : 0;
        const avgCalories = uniqueDays > 0 ? totalCalories / uniqueDays : 0;
        const avgActiveMinutes = uniqueDays > 0 ? totalActiveMinutes / uniqueDays : 0;

        return {
          location,
          userCount: users.length,
          activeUserCount: healthData.length,
          totalSteps,
          totalCalories,
          totalActiveMinutes,
          avgSteps: Math.round(avgSteps),
          avgCalories: Math.round(avgCalories),
          avgActiveMinutes: Math.round(avgActiveMinutes),
        };
      }),
    );

    // Filter out null entries and sort by total steps (descending)
    return locationStats
      .filter((stat) => stat !== null)
      .sort((a, b) => b.totalSteps - a.totalSteps);
  }

  /**
   * Get location-based leaderboard
   */
  async getLocationLeaderboard(
    location?: string,
    metric: 'steps' | 'calories' = 'steps',
  ): Promise<any[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let userIds: string[] = [];

    if (location) {
      // Get users in specific location
      const users = await this.usersService.getUsersByLocation(location);
      userIds = users.map((u) => u.id);
    } else {
      // Get all users
      const allUsers = await this.usersService.getAllLocations();
      const allUsersList = await Promise.all(
        allUsers.map((loc) => this.usersService.getUsersByLocation(loc)),
      );
      userIds = allUsersList.flat().map((u) => u.id);
    }

    if (userIds.length === 0) {
      return [];
    }

    // Get health data
    const healthData = await this.healthDataRepository
      .createQueryBuilder('health')
      .where('health.user_id IN (:...userIds)', { userIds })
      .andWhere('health.date = :today', { today })
      .getMany();

    // Get unique users with their latest data
    const userDataMap = new Map<string, any>();
    healthData.forEach((data) => {
      if (!userDataMap.has(data.user_id)) {
        userDataMap.set(data.user_id, data);
      }
    });

    // Fetch user info for each user
    const leaderboardEntries = await Promise.all(
      Array.from(userDataMap.values()).map(async (healthData) => {
        const user = await this.usersService.findById(healthData.user_id);
        if (!user) return null;

        return {
          userId: user.id,
          name: user.name,
          picture: user.picture,
          email: user.email,
          location: user.location,
          steps: healthData.steps || 0,
          calories: healthData.calories || 0,
          heartRate: healthData.heart_rate,
          activeMinutes: healthData.active_minutes,
          date: healthData.date,
        };
      }),
    );

    // Filter out null entries and sort by metric
    const validEntries = leaderboardEntries.filter((entry) => entry !== null);

    validEntries.sort((a, b) => {
      const aValue = metric === 'steps' ? a.steps : (a.calories || 0);
      const bValue = metric === 'steps' ? b.steps : (b.calories || 0);
      return bValue - aValue; // Descending order
    });

    // Add rank to each entry
    return validEntries.map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));
  }

  /**
   * Get all available locations
   */
  async getAllLocations(): Promise<string[]> {
    return this.usersService.getAllLocations();
  }

  /**
   * Fetch real health data from Google Fit API for last N days
   */
  async fetchRealDataFromGoogleFit(userId: string, days: number = 30): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let fetchedCount = 0;
    const errors: string[] = [];
    
    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      // Check if data already exists for this date
      const existing = await this.healthDataRepository.findOne({
        where: {
          user_id: userId,
          date: date,
        },
      });
      
      if (existing) {
        console.log(`Data already exists for ${date.toISOString().split('T')[0]}, skipping...`);
        continue; // Skip if data already exists
      }
      
      try {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);
        
        // Fetch data from Google Fit for this specific day
        const results = await Promise.allSettled([
          this.googleFitService.fetchSteps(userId, startOfDay, endOfDay),
          this.googleFitService.fetchHeartRate(userId, startOfDay, endOfDay),
          this.googleFitService.fetchCalories(userId, startOfDay, endOfDay),
          this.googleFitService.fetchDistance(userId, startOfDay, endOfDay),
          this.googleFitService.fetchWeight(userId, startOfDay, endOfDay),
          this.googleFitService.fetchHeight(userId, startOfDay, endOfDay),
          this.googleFitService.fetchSleepDuration(userId, startOfDay, endOfDay),
          this.googleFitService.fetchActiveMinutes(userId, startOfDay, endOfDay),
          this.googleFitService.fetchSpeed(userId, startOfDay, endOfDay),
        ]);
        
        const steps = results[0].status === 'fulfilled' ? results[0].value : 0;
        const heartRate = results[1].status === 'fulfilled' ? results[1].value : null;
        const calories = results[2].status === 'fulfilled' ? results[2].value : null;
        const distance = results[3].status === 'fulfilled' ? results[3].value : null;
        const weight = results[4].status === 'fulfilled' ? results[4].value : null;
        const height = results[5].status === 'fulfilled' ? results[5].value : null;
        const sleepDuration = results[6].status === 'fulfilled' ? results[6].value : null;
        const activeMinutes = results[7].status === 'fulfilled' ? results[7].value : null;
        const speed = results[8].status === 'fulfilled' ? results[8].value : null;
        
        // Only save if we have at least some data (steps > 0 or other data)
        if (steps > 0 || heartRate || calories || distance) {
          const healthData = this.healthDataRepository.create({
            user_id: userId,
            date: date,
            steps: steps,
            heart_rate: heartRate,
            calories: calories,
            distance: distance,
            weight: weight,
            height: height,
            sleep_duration: sleepDuration,
            active_minutes: activeMinutes,
            speed: speed,
            fetched_at: new Date(),
          });
          
          await this.healthDataRepository.save(healthData);
          fetchedCount++;
          console.log(`Fetched data for ${date.toISOString().split('T')[0]}: ${steps} steps`);
        } else {
          console.log(`No data found for ${date.toISOString().split('T')[0]}`);
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error: any) {
        const errorMsg = `Error fetching data for ${date.toISOString().split('T')[0]}: ${error.message}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }
    
    console.log(`Fetched ${fetchedCount} days of data from Google Fit. Errors: ${errors.length}`);
    if (errors.length > 0) {
      console.error('Errors:', errors);
    }
    
    return fetchedCount;
  }

  /**
   * Generate test data for last 30 days (for testing purposes)
   */
  async generateTestData(userId: string, days: number = 30): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let insertedCount = 0;
    
    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      // Check if data already exists for this date
      const existing = await this.healthDataRepository.findOne({
        where: {
          user_id: userId,
          date: date,
        },
      });
      
      if (existing) {
        continue; // Skip if data already exists
      }
      
      // Generate random but realistic health data
      const steps = Math.floor(Math.random() * 5000) + 5000; // 5000-10000 steps
      const heartRate = Math.floor(Math.random() * 30) + 65; // 65-95 bpm
      const calories = Math.floor(steps * 0.04) + Math.floor(Math.random() * 200) + 1800; // Based on steps
      const distance = (steps * 0.0008) + (Math.random() * 2); // ~0.8m per step
      const weight = 70 + (Math.random() * 5 - 2.5); // 67.5-72.5 kg (slight variation)
      const height = 1.7 + (Math.random() * 0.1 - 0.05); // 1.65-1.75 m
      const sleepDuration = 6 + (Math.random() * 3); // 6-9 hours
      const activeMinutes = Math.floor(steps / 100) + Math.floor(Math.random() * 30); // Based on steps
      const speed = 4 + (Math.random() * 3); // 4-7 km/h
      
      const testData = this.healthDataRepository.create({
        user_id: userId,
        date: date,
        steps: steps,
        heart_rate: heartRate,
        calories: calories,
        distance: distance,
        weight: weight,
        height: height,
        sleep_duration: sleepDuration,
        active_minutes: activeMinutes,
        speed: speed,
        fetched_at: new Date(),
      });
      
      await this.healthDataRepository.save(testData);
      insertedCount++;
    }
    
    return insertedCount;
  }
}

