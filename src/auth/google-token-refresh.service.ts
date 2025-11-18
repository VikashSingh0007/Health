import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import axios from 'axios';

@Injectable()
export class GoogleTokenRefreshService {
  private readonly tokenUrl = 'https://oauth2.googleapis.com/token';

  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {}

  async refreshAccessToken(userId: string): Promise<string> {
    const user = await this.usersService.findById(userId);
    
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    if (!user.refresh_token) {
      throw new HttpException(
        'No refresh token available. Please re-authenticate.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    try {
      const params = new URLSearchParams();
      params.append('client_id', this.configService.get('GOOGLE_CLIENT_ID'));
      params.append('client_secret', this.configService.get('GOOGLE_CLIENT_SECRET'));
      params.append('refresh_token', user.refresh_token);
      params.append('grant_type', 'refresh_token');

      const response = await axios.post(
        this.tokenUrl,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      const { access_token, refresh_token } = response.data;

      // Update tokens in database
      await this.usersService.updateTokens(
        userId,
        access_token,
        refresh_token || user.refresh_token, // Keep old refresh token if new one not provided
      );

      return access_token;
    } catch (error: any) {
      console.error('Token refresh error:', error.response?.data || error.message);
      
      if (error.response?.status === 400) {
        // Refresh token is invalid or expired
        throw new HttpException(
          'Refresh token expired. Please re-authenticate.',
          HttpStatus.UNAUTHORIZED,
        );
      }

      throw new HttpException(
        'Failed to refresh access token',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getValidAccessToken(userId: string): Promise<string> {
    const user = await this.usersService.findById(userId);
    
    if (!user || !user.access_token) {
      throw new HttpException(
        'User not authenticated with Google',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Try to use current token first
    // In a real scenario, you might want to check token expiration
    // For now, we'll refresh on 401 errors
    return user.access_token;
  }
}

