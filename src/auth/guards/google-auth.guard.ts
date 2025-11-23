import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { redirectUrlStore } from '../redirect-url.store';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    
    // Store state parameter in cookie before redirect
    const state = request.query.state as string;
    console.log('🔐 GoogleAuthGuard - State parameter:', state);
    
    if (state) {
      try {
        const decodedState = decodeURIComponent(state);
        console.log('🔐 Decoded state:', decodedState);
        
        // Validate URL format
        try {
          new URL(decodedState);
          // Store in cookie
          response.cookie('oauth_redirect_url', decodedState, {
            httpOnly: false,
            maxAge: 5 * 60 * 1000, // 5 minutes
            sameSite: 'lax',
            path: '/',
          });
          console.log('✅ Stored redirect URL in cookie:', decodedState);
          
          // Also store in memory as backup
          const sessionId = request.headers['user-agent'] || 'default';
          redirectUrlStore.set(sessionId, decodedState);
          console.log('✅ Stored redirect URL in memory store');
        } catch (urlError) {
          console.error('❌ Invalid redirect URL format:', decodedState, urlError);
        }
      } catch (e) {
        console.error('❌ Error storing redirect URL in guard:', e);
      }
    } else {
      console.log('⚠️ No state parameter found in request');
    }
    
    return super.canActivate(context);
  }
  
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    // Handle OAuth errors gracefully
    if (err) {
      console.error('OAuth error:', err);
      const response = context.switchToHttp().getResponse<Response>();
      response.redirect('/auth/error?message=' + encodeURIComponent(err.message || 'Authentication failed'));
      return null;
    }
    return super.handleRequest(err, user, info, context);
  }
}

