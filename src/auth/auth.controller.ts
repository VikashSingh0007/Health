import { Controller, Get, Post, Put, Req, UseGuards, Res, Body, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UsersService } from '../users/users.service';
import { GoogleTokenRefreshService } from './google-token-refresh.service';
import { redirectUrlStore } from './redirect-url.store';

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

    console.log('=== OAuth Callback Debug ===');
    console.log('Cookies:', req.cookies);
    console.log('Query params:', req.query);
    console.log('Headers referer:', req.headers.referer);

    // Try to get redirect URL from cookie first
    let redirectUrl: string | null = null;
    
    if (req.cookies && req.cookies.oauth_redirect_url) {
      redirectUrl = req.cookies.oauth_redirect_url;
      console.log('Found redirect URL in cookie:', redirectUrl);
      // Clear the cookie
      res.clearCookie('oauth_redirect_url');
    }

    // If not in cookie, check state parameter (Google might preserve it)
    if (!redirectUrl) {
      const stateParam = req.query.state as string;
      if (stateParam) {
        try {
          const decodedState = decodeURIComponent(stateParam);
          // Check if it's a valid URL
          try {
            const stateUrl = new URL(decodedState);
            redirectUrl = stateUrl.origin;
            console.log('Found redirect URL in state parameter:', redirectUrl);
          } catch (urlError) {
            // State might not be a URL, try to use it as-is if it looks like localhost
            if (decodedState.includes('localhost:') || decodedState.includes('127.0.0.1:')) {
              redirectUrl = decodedState;
              console.log('Using state as redirect URL:', redirectUrl);
            }
          }
        } catch (e) {
          console.error('Error parsing state parameter:', e);
        }
      }
    }

    // If not in cookie, try memory store
    if (!redirectUrl) {
      // Get the most recent entry (last one added)
      const entries = Array.from(redirectUrlStore.entries());
      if (entries.length > 0) {
        const [key, url] = entries[entries.length - 1];
        redirectUrl = url;
        redirectUrlStore.delete(key);
        console.log('Found redirect URL in memory store:', redirectUrl);
      }
    }

    // If we have a redirect URL, use it
    if (redirectUrl) {
      try {
        // Clean up the URL - remove any trailing slashes and ensure proper format
        const cleanUrl = redirectUrl.replace(/\/+$/, ''); // Remove trailing slashes
        console.log('✅ Redirecting to Flutter app:', cleanUrl);
        return res.redirect(`${cleanUrl}/?token=${result.access_token}`);
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
          console.log('✅ Redirecting to Flutter app (from referer):', webAppUrl);
          return res.redirect(`${webAppUrl}/?token=${result.access_token}`);
        }
      } catch (e) {
        console.error('Error parsing referer:', e);
      }
    }

    // Last resort: redirect to success page which will try to read from localStorage
    console.log('⚠️ No redirect URL found, redirecting to success page');
    console.log('Token:', result.access_token.substring(0, 20) + '...');
    res.redirect(
      `http://localhost:3000/auth/success?token=${result.access_token}`,
    );
  }

  @Get('success')
  async authSuccess(@Req() req: Request, @Res() res: Response) {
    const token = req.query.token as string;
    const redirectUrl = req.query.redirect as string;
    
    // If redirect URL is provided, redirect there with token
    if (redirectUrl && token) {
      try {
        const cleanUrl = redirectUrl.replace(/\/+$/, '');
        return res.redirect(`${cleanUrl}/?token=${token}`);
      } catch (e) {
        console.error('Error redirecting from success page:', e);
      }
    }
    
    // Otherwise, show HTML page with token and auto-redirect script
    if (token) {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Authentication Successful</title>
          <meta charset="UTF-8">
          <script>
            // Try to get redirect URL from localStorage
            let redirectUrl = localStorage.getItem('oauth_redirect_url');
            console.log('Redirect URL from localStorage:', redirectUrl);
            
            // If not found, try common Flutter web ports
            if (!redirectUrl || redirectUrl === '') {
              // Try to detect Flutter app URL from common ports
              const commonPorts = [54321, 54322, 54323, 8080, 8081, 8082];
              for (const port of commonPorts) {
                const testUrl = 'http://localhost:' + port;
                // Try to ping it (this won't work due to CORS, but we can try)
                redirectUrl = testUrl;
                break; // Use first port as default
              }
            }
            
            if (redirectUrl && redirectUrl !== '') {
              // Clean up URL
              redirectUrl = redirectUrl.replace(/\\/+$/, '');
              const redirectWithToken = redirectUrl + '/?token=${token}';
              console.log('Redirecting to:', redirectWithToken);
              // Try immediate redirect
              window.location.href = redirectWithToken;
              
              // Fallback: try after 1 second if still on this page
              setTimeout(() => {
                if (window.location.href.includes('/auth/success')) {
                  console.log('Still on success page, trying redirect again...');
                  window.location.href = redirectWithToken;
                }
              }, 1000);
            } else {
              // Show token for manual copy
              console.log('No redirect URL found, showing token');
              document.getElementById('token-display').style.display = 'block';
              document.getElementById('redirecting-msg').style.display = 'none';
            }
          </script>
          <style>
            body {
              font-family: Arial, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            .container {
              background: white;
              padding: 30px;
              border-radius: 10px;
              box-shadow: 0 4px 6px rgba(0,0,0,0.1);
              max-width: 500px;
              text-align: center;
            }
            .token-box {
              background: #f5f5f5;
              padding: 15px;
              border-radius: 5px;
              word-break: break-all;
              margin: 20px 0;
              font-size: 12px;
            }
            button {
              background: #667eea;
              color: white;
              border: none;
              padding: 10px 20px;
              border-radius: 5px;
              cursor: pointer;
              margin: 5px;
            }
            button:hover {
              background: #5568d3;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Authentication Successful!</h2>
            <p id="redirecting-msg">Redirecting to app...</p>
            <div id="token-display" style="display: none;">
              <p>If you're not redirected automatically:</p>
              <p>1. Check the Flutter app is running</p>
              <p>2. Copy this token and paste it in the app:</p>
              <div class="token-box">${token}</div>
              <button onclick="navigator.clipboard.writeText('${token}')">Copy Token</button>
            </div>
          </div>
        </body>
        </html>
      `;
      res.setHeader('Content-Type', 'text/html');
      return res.send(html);
    }
    
    return res.json({
      message: 'Authentication successful',
      token,
      instructions:
        'Copy this token and use it in Authorization header as: Bearer <token>',
    });
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

