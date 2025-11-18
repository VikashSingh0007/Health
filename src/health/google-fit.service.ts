import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { GoogleTokenRefreshService } from '../auth/google-token-refresh.service';
import axios from 'axios';

@Injectable()
export class GoogleFitService {
  private readonly fitApiUrl = 'https://www.googleapis.com/fitness/v1';

  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
    private tokenRefreshService: GoogleTokenRefreshService,
  ) {}

  private async getAccessToken(userId: string, retry = true): Promise<string> {
    try {
      return await this.tokenRefreshService.getValidAccessToken(userId);
    } catch (error) {
      throw new HttpException(
        'User not authenticated with Google Fit',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  private async refreshTokenIfNeeded(
    userId: string,
    error: any,
  ): Promise<string | null> {
    if (error.response?.status === 401) {
      try {
        console.log('Token expired, attempting refresh...');
        const newAccessToken = await this.tokenRefreshService.refreshAccessToken(
          userId,
        );
        console.log('Token refreshed successfully');
        return newAccessToken;
      } catch (refreshError: any) {
        console.error('Token refresh failed:', refreshError);
        // Don't throw here - let the calling method handle it gracefully
        // This allows other data types to still be fetched even if one fails
        console.warn('Token refresh failed. User needs to re-authenticate. Continuing with other data types...');
        return null;
      }
    }
    return null;
  }

  private async makeFitRequest(
    userId: string,
    endpoint: string,
    params?: any,
    method: 'GET' | 'POST' = 'GET',
    body?: any,
  ): Promise<any> {
    let accessToken = await this.getAccessToken(userId);
    
    const makeRequest = async (token: string) => {
      const config: any = {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      };
      
      if (method === 'POST') {
        config.headers['Content-Type'] = 'application/json';
        return axios.post(`${this.fitApiUrl}${endpoint}`, body, config);
      } else {
        config.params = params;
        return axios.get(`${this.fitApiUrl}${endpoint}`, config);
      }
    };

    try {
      const response = await makeRequest(accessToken);
      return response.data;
    } catch (error: any) {
      // Try to refresh token on 401 error
      if (error.response?.status === 401) {
        const newToken = await this.refreshTokenIfNeeded(userId, error);
        if (newToken) {
          // Retry the request with new token
          try {
            const response = await makeRequest(newToken);
            return response.data;
          } catch (retryError: any) {
            // If retry also fails, throw error but let calling method handle it
            const customError: any = new Error(
              retryError.response?.data?.error?.message || 'Google Fit API error after token refresh'
            );
            customError.status = retryError.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
            customError.response = retryError.response;
            throw customError;
          }
        } else {
          // Token refresh failed - throw error but let calling method handle gracefully
          const customError: any = new Error('Google Fit token expired and refresh failed. Please re-authenticate.');
          customError.status = 401;
          customError.response = error.response;
          throw customError;
        }
      }
      
      // Handle 403 errors (permission/data type not available) - let calling method handle gracefully
      // Don't throw for 403, let individual fetch methods handle it
      if (error.response?.status === 403) {
        const errorMessage = error.response?.data?.error?.message || 'Data type not available or permission denied';
        const customError: any = new Error(errorMessage);
        customError.status = 403;
        customError.response = error.response;
        throw customError;
      }
      
      throw new HttpException(
        error.response?.data?.error?.message || 'Google Fit API error',
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private getTimeRange(startDate: Date, endDate: Date) {
    return {
      startTimeMillis: startDate.getTime(),
      endTimeMillis: endDate.getTime(),
    };
  }

  async fetchSteps(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    const timeRange = this.getTimeRange(startDate, endDate);
    const dataSourceId = 'derived:com.google.step_count.delta:com.google.android.gms:estimated_steps';

    const requestBody = {
      aggregateBy: [
        {
          dataTypeName: 'com.google.step_count.delta',
        },
      ],
      bucketByTime: { durationMillis: 86400000 }, // 1 day
      startTimeMillis: timeRange.startTimeMillis,
      endTimeMillis: timeRange.endTimeMillis,
    };

    try {
      // Send POST request for aggregate with automatic token refresh
      const aggregateResponse = await this.makeFitRequest(
        userId,
        '/users/me/dataset:aggregate',
        {},
        'POST',
        requestBody,
      );

      let totalSteps = 0;
      if (aggregateResponse?.bucket) {
        aggregateResponse.bucket.forEach((bucket: any) => {
          if (bucket.dataset?.[0]?.point?.[0]?.value?.[0]?.intVal) {
            totalSteps += bucket.dataset[0].point[0].value[0].intVal;
          }
        });
      }

      return totalSteps;
    } catch (error: any) {
      console.error('Error fetching steps:', error);
      return 0;
    }
  }

  async fetchHeartRate(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number | null> {
    const timeRange = this.getTimeRange(startDate, endDate);
    
    // Method 1: Try aggregated data with average
    const requestBody = {
      aggregateBy: [
        {
          dataTypeName: 'com.google.heart_rate.bpm',
        },
      ],
      bucketByTime: { durationMillis: 86400000 },
      startTimeMillis: timeRange.startTimeMillis,
      endTimeMillis: timeRange.endTimeMillis,
    };

    try {
      const response = await this.makeFitRequest(
        userId,
        '/users/me/dataset:aggregate',
        {},
        'POST',
        requestBody,
      );

      // Debug: Log the response to see structure
      console.log('Heart rate API response:', JSON.stringify(response, null, 2));

      if (response?.bucket?.length > 0) {
        // Try to get heart rate from all buckets and points
        let latestHeartRate: number | null = null;
        let latestTimestamp = 0;
        const allHeartRates: number[] = [];

        response.bucket.forEach((bucket: any) => {
          if (bucket.dataset) {
            bucket.dataset.forEach((dataset: any) => {
              if (dataset.point && dataset.point.length > 0) {
                dataset.point.forEach((point: any) => {
                  // Heart rate can be in fpVal (float) or intVal (integer) format
                  let heartRate: number | null = null;
                  
                  if (point.value?.[0]?.fpVal !== undefined) {
                    heartRate = point.value[0].fpVal;
                  } else if (point.value?.[0]?.intVal !== undefined) {
                    heartRate = point.value[0].intVal;
                  }
                  
                  if (heartRate !== null) {
                    allHeartRates.push(heartRate);
                    const timestamp = parseInt(point.startTimeNanos) || 0;
                    
                    // Get the latest measurement
                    if (timestamp > latestTimestamp) {
                      latestTimestamp = timestamp;
                      latestHeartRate = Math.round(heartRate);
                    }
                  }
                });
              }
            });
          }
        });

        // If we found heart rates, return the latest one
        if (latestHeartRate !== null) {
          console.log('Heart rate found (latest):', latestHeartRate);
          return latestHeartRate;
        }

        // If we have multiple measurements, return average
        if (allHeartRates.length > 0) {
          const avgHeartRate = Math.round(
            allHeartRates.reduce((sum, hr) => sum + hr, 0) / allHeartRates.length
          );
          console.log('Heart rate found (average):', avgHeartRate, 'from', allHeartRates.length, 'measurements');
          return avgHeartRate;
        }

        console.log('Heart rate data structure (empty points):', JSON.stringify(response.bucket[0], null, 2));
      }
      
      // Method 2: Try fetching from raw data sources if aggregated is empty
      console.log('Trying to fetch heart rate from raw data sources...');
      try {
        // Get data sources for heart rate
        const dataSourcesResponse = await this.makeFitRequest(
          userId,
          '/users/me/dataSources',
          { dataTypeName: 'com.google.heart_rate.bpm' },
          'GET',
        );

        console.log('Data sources response:', JSON.stringify(dataSourcesResponse, null, 2));

        if (dataSourcesResponse?.dataSource && dataSourcesResponse.dataSource.length > 0) {
          console.log(`Found ${dataSourcesResponse.dataSource.length} heart rate data sources`);
          
          // Try to fetch from each available data source
          for (const dataSource of dataSourcesResponse.dataSource) {
            try {
              console.log(`Trying data source: ${dataSource.dataStreamId}, type: ${dataSource.type}`);
              
              // Convert milliseconds to nanoseconds for dataset endpoint
              const startTimeNanos = (timeRange.startTimeMillis * 1000000).toString();
              const endTimeNanos = (timeRange.endTimeMillis * 1000000).toString();
              const datasetUrl = `/users/me/dataSources/${encodeURIComponent(dataSource.dataStreamId)}/datasets/${startTimeNanos}-${endTimeNanos}`;
              
              console.log(`Fetching dataset from: ${datasetUrl}`);
              
              const datasetResponse = await this.makeFitRequest(
                userId,
                datasetUrl,
                {},
                'GET',
              );

              console.log(`Dataset response for ${dataSource.dataStreamId}:`, JSON.stringify(datasetResponse, null, 2));

              if (datasetResponse?.point && datasetResponse.point.length > 0) {
                console.log(`Found ${datasetResponse.point.length} heart rate points in data source ${dataSource.dataStreamId}`);
                
                // Get the latest heart rate measurement
                let latestHR: number | null = null;
                let latestTS = 0;

                datasetResponse.point.forEach((point: any) => {
                  let hr: number | null = null;
                  if (point.value?.[0]?.fpVal !== undefined) {
                    hr = point.value[0].fpVal;
                  } else if (point.value?.[0]?.intVal !== undefined) {
                    hr = point.value[0].intVal;
                  }

                  if (hr !== null) {
                    const ts = parseInt(point.startTimeNanos) || 0;
                    if (ts > latestTS) {
                      latestTS = ts;
                      latestHR = Math.round(hr);
                    }
                  }
                });

                if (latestHR !== null) {
                  console.log('Heart rate found from raw data source:', latestHR);
                  return latestHR;
                } else {
                  console.log('No valid heart rate values found in points');
                }
              } else {
                console.log(`No points found in dataset for ${dataSource.dataStreamId}`);
              }
            } catch (dsError: any) {
              // Continue to next data source
              console.log(`Error fetching from data source ${dataSource.dataStreamId}:`, dsError.message);
              console.log('Error details:', dsError.response?.data || dsError.stack);
            }
          }
        } else {
          console.log('No heart rate data sources found in response');
        }
      } catch (rawError: any) {
        console.log('Could not fetch from raw data sources:', rawError.message);
        console.log('Raw error details:', rawError.response?.data || rawError.stack);
      }
      
      console.log('No heart rate data found in any source');
      return null;
    } catch (error: any) {
      // Handle 403 errors gracefully
      if (error.status === 403 || error.response?.status === 403) {
        console.log('Heart rate data not available or permission denied. Skipping heart rate.');
        return null;
      }
      console.error('Error fetching heart rate:', error);
      console.error('Error details:', error.response?.data);
      return null;
    }
  }

  async fetchCalories(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number | null> {
    const timeRange = this.getTimeRange(startDate, endDate);
    const requestBody = {
      aggregateBy: [
        {
          dataTypeName: 'com.google.calories.expended',
        },
      ],
      bucketByTime: { durationMillis: 86400000 },
      startTimeMillis: timeRange.startTimeMillis,
      endTimeMillis: timeRange.endTimeMillis,
    };

    try {
      const response = await this.makeFitRequest(
        userId,
        '/users/me/dataset:aggregate',
        {},
        'POST',
        requestBody,
      );

      let totalCalories = 0;
      if (response?.bucket) {
        response.bucket.forEach((bucket: any) => {
          if (bucket.dataset?.[0]?.point?.[0]?.value?.[0]?.fpVal) {
            totalCalories += bucket.dataset[0].point[0].value[0].fpVal;
          }
        });
      }

      return Math.round(totalCalories);
    } catch (error: any) {
      // Handle 403 errors gracefully
      if (error.status === 403 || error.response?.status === 403) {
        console.log('Calories data not available or permission denied. Skipping calories.');
        return null;
      }
      console.error('Error fetching calories:', error);
      return null;
    }
  }

  async fetchDistance(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number | null> {
    const timeRange = this.getTimeRange(startDate, endDate);
    const requestBody = {
      aggregateBy: [
        {
          dataTypeName: 'com.google.distance.delta',
        },
      ],
      bucketByTime: { durationMillis: 86400000 },
      startTimeMillis: timeRange.startTimeMillis,
      endTimeMillis: timeRange.endTimeMillis,
    };

    try {
      const response = await this.makeFitRequest(
        userId,
        '/users/me/dataset:aggregate',
        {},
        'POST',
        requestBody,
      );

      let totalDistance = 0;
      if (response?.bucket) {
        response.bucket.forEach((bucket: any) => {
          if (bucket.dataset?.[0]?.point?.[0]?.value?.[0]?.fpVal) {
            totalDistance += bucket.dataset[0].point[0].value[0].fpVal;
          }
        });
      }

      return totalDistance / 1000; // Convert meters to kilometers
    } catch (error: any) {
      // Handle 403 errors gracefully (data type not available or no permission)
      if (error.status === 403 || error.response?.status === 403) {
        console.log('Distance data not available or permission denied. Skipping distance.');
        return null;
      }
      console.error('Error fetching distance:', error);
      return null;
    }
  }

  async fetchWeight(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number | null> {
    const timeRange = this.getTimeRange(startDate, endDate);
    const requestBody = {
      aggregateBy: [
        {
          dataTypeName: 'com.google.weight',
        },
      ],
      bucketByTime: { durationMillis: 86400000 },
      startTimeMillis: timeRange.startTimeMillis,
      endTimeMillis: timeRange.endTimeMillis,
    };

    try {
      const response = await this.makeFitRequest(
        userId,
        '/users/me/dataset:aggregate',
        {},
        'POST',
        requestBody,
      );

      if (response?.bucket?.length > 0) {
        // Get the most recent weight measurement
        const latestBucket = response.bucket[response.bucket.length - 1];
        if (latestBucket.dataset?.[0]?.point?.[0]?.value?.[0]?.fpVal) {
          return latestBucket.dataset[0].point[0].value[0].fpVal; // Weight in kg
        }
      }
      return null;
    } catch (error: any) {
      if (error.status === 403 || error.response?.status === 403) {
        console.log('Weight data not available or permission denied. Skipping weight.');
        return null;
      }
      console.error('Error fetching weight:', error);
      return null;
    }
  }

  async fetchHeight(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number | null> {
    const timeRange = this.getTimeRange(startDate, endDate);
    const requestBody = {
      aggregateBy: [
        {
          dataTypeName: 'com.google.height',
        },
      ],
      bucketByTime: { durationMillis: 86400000 },
      startTimeMillis: timeRange.startTimeMillis,
      endTimeMillis: timeRange.endTimeMillis,
    };

    try {
      const response = await this.makeFitRequest(
        userId,
        '/users/me/dataset:aggregate',
        {},
        'POST',
        requestBody,
      );

      if (response?.bucket?.length > 0) {
        // Get the most recent height measurement
        const latestBucket = response.bucket[response.bucket.length - 1];
        if (latestBucket.dataset?.[0]?.point?.[0]?.value?.[0]?.fpVal) {
          return latestBucket.dataset[0].point[0].value[0].fpVal; // Height in meters
        }
      }
      return null;
    } catch (error: any) {
      // Handle 401 errors (token expired) gracefully
      if (error.status === 401 || error.response?.status === 401) {
        console.log('Height data fetch failed: Token expired. Please re-authenticate.');
        return null; // Return null instead of throwing, so other data types can still be fetched
      }
      // Handle 403 errors (permission/data type not available) gracefully
      if (error.status === 403 || error.response?.status === 403) {
        console.log('Height data not available or permission denied. Skipping height.');
        return null;
      }
      console.error('Error fetching height:', error);
      return null;
    }
  }

  async fetchSleepDuration(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number | null> {
    const timeRange = this.getTimeRange(startDate, endDate);
    const requestBody = {
      aggregateBy: [
        {
          dataTypeName: 'com.google.sleep.segment',
        },
      ],
      bucketByTime: { durationMillis: 86400000 },
      startTimeMillis: timeRange.startTimeMillis,
      endTimeMillis: timeRange.endTimeMillis,
    };

    try {
      const response = await this.makeFitRequest(
        userId,
        '/users/me/dataset:aggregate',
        {},
        'POST',
        requestBody,
      );

      if (response?.bucket?.length > 0) {
        // Calculate total sleep duration from segments
        // Sleep segments have startTimeNanos and endTimeNanos
        let totalSleepMs = 0;
        response.bucket.forEach((bucket: any) => {
          if (bucket.dataset?.[0]?.point) {
            bucket.dataset[0].point.forEach((point: any) => {
              // Sleep segment duration is the difference between end and start time
              if (point.startTimeNanos && point.endTimeNanos) {
                const segmentDurationNanos = BigInt(point.endTimeNanos) - BigInt(point.startTimeNanos);
                const segmentDurationMs = Number(segmentDurationNanos) / 1000000; // Convert nanoseconds to milliseconds
                totalSleepMs += segmentDurationMs;
              }
            });
          }
        });
        
        if (totalSleepMs > 0) {
          return totalSleepMs / (1000 * 60 * 60); // Convert to hours
        }
      }
      return null;
    } catch (error: any) {
      if (error.status === 403 || error.response?.status === 403) {
        console.log('Sleep data not available or permission denied. Skipping sleep.');
        return null;
      }
      console.error('Error fetching sleep:', error);
      return null;
    }
  }

  async fetchActiveMinutes(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number | null> {
    const timeRange = this.getTimeRange(startDate, endDate);
    const requestBody = {
      aggregateBy: [
        {
          dataTypeName: 'com.google.active_minutes',
        },
      ],
      bucketByTime: { durationMillis: 86400000 },
      startTimeMillis: timeRange.startTimeMillis,
      endTimeMillis: timeRange.endTimeMillis,
    };

    try {
      const response = await this.makeFitRequest(
        userId,
        '/users/me/dataset:aggregate',
        {},
        'POST',
        requestBody,
      );

      let totalActiveMinutes = 0;
      if (response?.bucket) {
        response.bucket.forEach((bucket: any) => {
          if (bucket.dataset?.[0]?.point?.[0]?.value?.[0]?.intVal) {
            totalActiveMinutes += bucket.dataset[0].point[0].value[0].intVal;
          }
        });
      }

      return totalActiveMinutes > 0 ? totalActiveMinutes : null;
    } catch (error: any) {
      if (error.status === 403 || error.response?.status === 403) {
        console.log('Active minutes data not available or permission denied. Skipping active minutes.');
        return null;
      }
      console.error('Error fetching active minutes:', error);
      return null;
    }
  }

  async fetchSpeed(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number | null> {
    const timeRange = this.getTimeRange(startDate, endDate);
    const requestBody = {
      aggregateBy: [
        {
          dataTypeName: 'com.google.speed',
        },
      ],
      bucketByTime: { durationMillis: 86400000 },
      startTimeMillis: timeRange.startTimeMillis,
      endTimeMillis: timeRange.endTimeMillis,
    };

    try {
      const response = await this.makeFitRequest(
        userId,
        '/users/me/dataset:aggregate',
        {},
        'POST',
        requestBody,
      );

      if (response?.bucket?.length > 0) {
        // Get average speed from the latest bucket
        const latestBucket = response.bucket[response.bucket.length - 1];
        if (latestBucket.dataset?.[0]?.point?.[0]?.value?.[0]?.fpVal) {
          // Speed is in m/s, convert to km/h
          return (latestBucket.dataset[0].point[0].value[0].fpVal * 3.6);
        }
      }
      return null;
    } catch (error: any) {
      if (error.status === 403 || error.response?.status === 403) {
        console.log('Speed data not available or permission denied. Skipping speed.');
        return null;
      }
      console.error('Error fetching speed:', error);
      return null;
    }
  }

  /**
   * Insert heart rate data into Google Fit
   * This creates a data source and inserts heart rate measurement
   */
  async insertHeartRateData(
    userId: string,
    heartRate: number,
    timestamp: Date,
  ): Promise<boolean> {
    try {
      const accessToken = await this.getAccessToken(userId);
      const timeNanos = (timestamp.getTime() * 1000000).toString();

      // Step 1: Create or get data source
      const dataSourceId = `raw:com.google.heart_rate.bpm:${this.configService.get('GOOGLE_CLIENT_ID')}:heart_rate_tracker:heart_rate`;
      
      // Try to create data source first
      const dataSource = {
        dataStreamId: dataSourceId,
        name: 'Heart Rate Tracker',
        type: 'raw',
        dataType: {
          name: 'com.google.heart_rate.bpm',
          field: [
            {
              name: 'bpm',
              format: 'floatPoint',
            },
          ],
        },
        application: {
          name: 'Health App',
          version: '1.0',
        },
        device: {
          manufacturer: 'Health App',
          model: 'Web App',
          type: 'unknown',
          uid: userId,
          version: '1.0',
        },
      };

      try {
        // Try to create data source
        await axios.post(
          `${this.fitApiUrl}/users/me/dataSources`,
          dataSource,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          },
        );
        console.log('Data source created successfully');
      } catch (createError: any) {
        // Data source might already exist, that's okay
        if (createError.response?.status !== 409) {
          console.log('Error creating data source (might already exist):', createError.message);
        }
      }

      // Step 2: Insert heart rate data point
      const dataset = {
        dataSourceId: dataSourceId,
        maxEndTimeNs: timeNanos,
        minStartTimeNs: timeNanos,
        point: [
          {
            startTimeNanos: timeNanos,
            endTimeNanos: timeNanos,
            dataTypeName: 'com.google.heart_rate.bpm',
            value: [
              {
                fpVal: heartRate,
              },
            ],
          },
        ],
      };

      const datasetUrl = `/users/me/dataSources/${encodeURIComponent(dataSourceId)}/datasets/${timeNanos}-${timeNanos}`;
      
      await axios.patch(
        `${this.fitApiUrl}${datasetUrl}`,
        dataset,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      console.log(`Heart rate data inserted: ${heartRate} bpm at ${timestamp.toISOString()}`);
      return true;
    } catch (error: any) {
      console.error('Error inserting heart rate data:', error.response?.data || error.message);
      return false;
    }
  }
}

