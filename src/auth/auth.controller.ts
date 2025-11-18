import { Controller, Get, Post, Put, Req, UseGuards, Res, Body, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UsersService } from '../users/users.service';
import { GoogleTokenRefreshService } from './google-token-refresh.service';

// Simple in-memory store for redirect URLs (keyed by session ID or user agent)
const redirectUrlStore = new Map<string, string>();

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
    private googleTokenRefreshService: GoogleTokenRefreshService,
  ) {}

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  async googleAuth(@Req() req: Request) {
    // Guard handles cookie storage and redirects to Google
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleAuthRedirect(@Req() req: Request, @Res() res: Response) {
    const user = req.user as any;
    const result = await this.authService.login(user);

    // Try to get redirect URL from cookie first
    let redirectUrl: string | null = null;
    
    if (req.cookies && req.cookies.oauth_redirect_url) {
      redirectUrl = req.cookies.oauth_redirect_url;
      // Clear the cookie
      res.clearCookie('oauth_redirect_url');
    }

    // If not in cookie, try memory store
    if (!redirectUrl) {
      // Get the most recent entry (last one added)
      const entries = Array.from(redirectUrlStore.entries());
      if (entries.length > 0) {
        const [key, url] = entries[entries.length - 1];
        redirectUrl = url;
        redirectUrlStore.delete(key);
      }
    }

    // If we have a redirect URL, use it
    if (redirectUrl) {
      try {
        // Clean up the URL - remove any trailing slashes and ensure proper format
        const cleanUrl = redirectUrl.replace(/\/+$/, ''); // Remove trailing slashes
        console.log('Redirecting to Flutter app:', cleanUrl);
        res.redirect(`${cleanUrl}/?token=${result.access_token}`);
        return;
      } catch (e) {
        console.error('Error redirecting to Flutter app:', e);
      }
    }

    // Check referer header as fallback
    const referer = req.headers.referer || '';
    if (referer && (referer.includes('localhost:') || referer.includes('127.0.0.1:'))) {
      try {
        // Extract base URL from referer
        const refererMatch = referer.match(/https?:\/\/[^\/]+/);
        if (refererMatch) {
          const webAppUrl = refererMatch[0];
          console.log('Redirecting to Flutter app (from referer):', webAppUrl);
          res.redirect(`${webAppUrl}/?token=${result.access_token}`);
          return;
        }
      } catch (e) {
        console.error('Error parsing referer:', e);
      }
    }

    // Default: redirect to success page with instructions
    console.log('No redirect URL found, using default success page');
    res.redirect(
      `http://localhost:3000/auth/success?token=${result.access_token}`,
    );
  }

  @Get('success')
  async authSuccess(@Req() req: Request) {
    const token = req.query.token as string;
    return {
      message: 'Authentication successful',
      token,
      instructions:
        'Copy this token and use it in Authorization header as: Bearer <token>',
    };
  }

  @Get('error')
  async authError(@Req() req: Request) {
    const message = (req.query.message as string) || 'Authentication failed';
    return {
      error: 'Authentication failed',
      message,
      instructions: 'Please try signing in again',
    };
  }

  @Post('google/mobile')
  async googleMobileAuth(@Body() body: { idToken: string; accessToken: string }) {
    const { idToken, accessToken } = body;
    
    if (!idToken || !accessToken) {
      return {
        error: 'Missing idToken or accessToken',
      };
    }

    // Verify Google token and get user info
    // For now, we'll use a simplified approach
    // In production, verify the token with Google
    try {
      // Create or find user using Google token
      // This is a simplified version - in production, verify the token
      const user = await this.authService.handleMobileAuth(
        idToken,
        accessToken,
      );
      
      const loginResult = await this.authService.login({ userId: user.id, email: user.email, name: user.name });
      
      return {
        access_token: loginResult.access_token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          picture: user.picture,
        },
      };
    } catch (error) {
      return {
        error: 'Authentication failed',
      };
    }
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Req() req: Request) {
    const user = req.user as any;
    const userData = await this.authService.validateUser(user.userId);
    return userData;
  }

  @Put('profile')
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @Req() req: Request,
    @Body() body: { location?: string },
  ) {
    const user = req.user as any;
    if (body.location) {
      const updatedUser = await this.usersService.updateLocation(
        user.userId,
        body.location,
      );
      return {
        message: 'Profile updated successfully',
        user: updatedUser,
      };
    }
    return {
      message: 'No updates provided',
    };
  }

  /**
   * Refresh JWT token endpoint
   * Uses Google refresh token to get new Google access token, then issues new JWT
   * This allows users to stay logged in without re-authenticating
   */
  @Post('refresh')
  async refreshToken(@Req() req: Request) {
    // Get token from Authorization header (even if expired, we can decode it)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        error: 'No token provided',
      };
    }

    try {
      const oldToken = authHeader.substring(7);
      // Decode JWT to get user ID (even if expired)
      const payload = this.authService.decodeJWT(oldToken);
      
      if (!payload || !payload.sub) {
        return {
          error: 'Invalid token',
        };
      }

      const userId = payload.sub;
      const user = await this.usersService.findById(userId);

      if (!user || !user.refresh_token) {
        return {
          error: 'No refresh token available. Please login again.',
        };
      }

      // Try to refresh Google access token using refresh token
      try {
        await this.googleTokenRefreshService.refreshAccessToken(userId);
      } catch (e) {
        // If Google token refresh fails, still issue new JWT
        // User can still use the app, just Google Fit might not work
        console.log('Google token refresh failed, but issuing new JWT:', e);
      }

      // Issue new JWT token
      const loginResult = await this.authService.login({
        userId: user.id,
        email: user.email,
        name: user.name,
      });

      return {
        access_token: loginResult.access_token,
      };
    } catch (e) {
      console.error('Error refreshing token:', e);
      return {
        error: 'Failed to refresh token',
      };
    }
  }
}

