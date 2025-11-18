# Token Refresh Implementation

## Overview

The backend now automatically refreshes expired Google OAuth access tokens when making Google Fit API calls.

## How It Works

1. **Initial Authentication**: When a user logs in via Google OAuth, both `access_token` and `refresh_token` are stored in the database.

2. **Token Refresh Service**: The `GoogleTokenRefreshService` handles refreshing expired tokens:
   - Uses the stored `refresh_token` to request a new `access_token` from Google
   - Updates the database with the new tokens
   - Handles errors gracefully

3. **Automatic Refresh in API Calls**: The `GoogleFitService` automatically detects 401 (Unauthorized) errors and:
   - Attempts to refresh the access token
   - Retries the original request with the new token
   - If refresh fails, returns an error asking user to re-authenticate

## Flow Diagram

```
User makes API request
    ↓
Google Fit API call with access_token
    ↓
401 Unauthorized? 
    ↓ Yes
Call refreshAccessToken()
    ↓
Get new access_token using refresh_token
    ↓
Update database with new tokens
    ↓
Retry original request with new token
    ↓
Return response to user
```

## Testing Token Refresh

To test the token refresh functionality:

1. **Manually expire a token** (for testing):
   ```sql
   UPDATE users SET access_token = 'expired_token' WHERE id = 'user_id';
   ```

2. **Make a health data request**:
   ```bash
   POST /health/fetch
   Authorization: Bearer <jwt_token>
   ```

3. **Expected behavior**:
   - First request fails with 401
   - System automatically refreshes token
   - Request is retried and succeeds
   - Response contains health data

## Important Notes

- Refresh tokens are long-lived but can expire if:
  - User revokes access
  - Token hasn't been used for 6 months
  - User changes password (in some cases)

- The OAuth strategy is configured with:
  - `accessType: 'offline'` - Required to get refresh token
  - `prompt: 'consent'` - Forces consent screen to ensure refresh token is provided

- If refresh fails, users must re-authenticate via `/auth/google`

