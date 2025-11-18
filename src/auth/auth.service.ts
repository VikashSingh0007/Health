import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async login(user: any) {
    const payload = { email: user.email, sub: user.userId };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.userId,
        email: user.email,
        name: user.name,
      },
    };
  }

  async validateUser(userId: string) {
    return this.usersService.findById(userId);
  }

  /**
   * Decode JWT token without verification (for expired tokens)
   * Used to extract user ID from expired tokens for refresh
   */
  decodeJWT(token: string): any {
    try {
      // JWT format: header.payload.signature
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      // Decode payload (base64url)
      const payload = parts[1];
      const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = Buffer.from(base64, 'base64').toString('utf-8');
      return JSON.parse(decoded);
    } catch (e) {
      return null;
    }
  }

  async handleMobileAuth(idToken: string, accessToken: string) {
    // In a real implementation, verify the idToken with Google
    // For now, we'll decode it (simplified - in production use google-auth-library)
    // This is a placeholder - you should verify the token properly
    try {
      // Decode JWT token to get user info (simplified)
      const base64Url = idToken.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        Buffer.from(base64, 'base64')
          .toString()
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join(''),
      );
      const payload = JSON.parse(jsonPayload);

      // Find or create user
      const user = await this.usersService.findByGoogleId(payload.sub);
      
      if (!user) {
        // Create new user
        const newUser = await this.usersService.findOrCreate({
          id: payload.sub,
          emails: [{ value: payload.email }],
          displayName: payload.name,
          photos: payload.picture ? [{ value: payload.picture }] : [],
        });
        await this.usersService.updateTokens(newUser.id, accessToken);
        return newUser;
      }

      // Update tokens for existing user
      await this.usersService.updateTokens(user.id, accessToken);
      return user;
    } catch (error) {
      throw new Error('Failed to process mobile authentication');
    }
  }
}

