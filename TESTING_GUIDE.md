# Backend Testing Guide

This guide will help you test the entire backend step by step.

## Prerequisites Checklist

- [ ] PostgreSQL installed and running
- [ ] Database `health_app_db` created
- [ ] Node.js v16+ installed
- [ ] Google Cloud Project created
- [ ] Google OAuth2 API enabled
- [ ] Google Fit API enabled
- [ ] OAuth 2.0 credentials created (Web Application)
- [ ] OAuth consent screen configured with required scopes

## Step 1: Environment Setup

1. **Copy environment file:**
   ```bash
   cp .env.example .env
   ```

2. **Generate JWT Secret:**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Copy the output to `JWT_SECRET` in `.env`

3. **Fill in `.env` file:**
   ```env
   DATABASE_HOST=localhost
   DATABASE_PORT=5432
   DATABASE_USER=postgres
   DATABASE_PASSWORD=your_actual_password
   DATABASE_NAME=health_app_db
   
   JWT_SECRET=<paste_generated_secret_here>
   
   GOOGLE_CLIENT_ID=<from_google_cloud_console>
   GOOGLE_CLIENT_SECRET=<from_google_cloud_console>
   GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
   
   PORT=3000
   NODE_ENV=development
   ```

## Step 2: Install Dependencies

```bash
npm install
```

## Step 3: Verify Database Connection

```bash
# Test PostgreSQL connection
psql -h localhost -U postgres -d health_app_db

# If connection works, type \q to exit
```

## Step 4: Start the Server

```bash
npm run start:dev
```

**Expected output:**
```
[Nest] Starting Nest application...
[Nest] Application successfully started
Application is running on: http://localhost:3000
```

If you see errors:
- **Database connection error**: Check PostgreSQL is running and credentials in `.env`
- **Module not found**: Run `npm install` again
- **Port already in use**: Change `PORT` in `.env` or stop the process using port 3000

## Step 5: Test Authentication Flow

### 5.1 Test Google OAuth Login

1. **Open browser and go to:**
   ```
   http://localhost:3000/auth/google
   ```

2. **Expected behavior:**
   - Redirects to Google login page
   - After login, shows consent screen with requested permissions
   - After consent, redirects to: `http://localhost:3000/auth/success?token=YOUR_JWT_TOKEN`

3. **Copy the JWT token** from the URL or success page

### 5.2 Test User Profile Endpoint

**Using cURL:**
```bash
curl -X GET http://localhost:3000/auth/profile \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6InNpbmdodmlrYXNoNzA3N0BnbWFpbC5jb20iLCJzdWIiOiI0MzEyOTRjYS04YTFkLTQ0N2YtOGU0ZS0xYzFjZDk5ZWMxY2EiLCJpYXQiOjE3NjMxMzAyNzUsImV4cCI6MTc2MzczNTA3NX0.cEU8l9usUx7pKe91oLSAA40GbL-R6OOMJoL9ZNMDugY
"
```

**Expected response:**
```json
{
  "id": "uuid",
  "google_id": "123456789",
  "email": "your@email.com",
  "name": "Your Name",
  "picture": "https://...",
  "created_at": "2024-01-15T10:00:00.000Z",
  "updated_at": "2024-01-15T10:00:00.000Z"
}
```

**Using Postman:**
1. Create GET request: `http://localhost:3000/auth/profile`
2. Go to **Headers** tab
3. Add: `Authorization: Bearer YOUR_JWT_TOKEN`
4. Send request

## Step 6: Test Health Data Endpoints

### 6.1 Fetch Health Data from Google Fit

**Using cURL:**
```bash
curl -X POST http://localhost:3000/health/fetch \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected response:**
```json
{
  "message": "Health data fetched and saved successfully",
  "data": {
    "id": "uuid",
    "user_id": "uuid",
    "steps": 8500,
    "heart_rate": 72,
    "calories": 2100,
    "distance": 6.5,
    "fetched_at": "2024-01-15T10:30:00.000Z",
    "date": "2024-01-15"
  }
}
```

**Note:** If you get an error about no data, make sure:
- Your Google account has Google Fit data
- You've granted all required permissions
- You have some activity recorded in Google Fit

### 6.2 Get Latest Health Data

```bash
curl -X GET http://localhost:3000/health/latest \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 6.3 Get Dashboard Summary

```bash
curl -X GET http://localhost:3000/health/dashboard \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 6.4 Get Historical Data

```bash
curl -X GET "http://localhost:3000/health/history?startDate=2024-01-01&endDate=2024-01-15" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Step 7: Test Token Refresh

### 7.1 Verify Refresh Token is Stored

```bash
# Connect to database
psql health_app_db

# Check user has refresh token
SELECT id, email, access_token IS NOT NULL as has_access_token, 
       refresh_token IS NOT NULL as has_refresh_token 
FROM users;
```

You should see `has_refresh_token = true`

### 7.2 Test Automatic Token Refresh

1. **Manually expire the access token:**
   ```sql
   UPDATE users SET access_token = 'expired_token_test' WHERE email = 'your@email.com';
   ```

2. **Make a health data request:**
   ```bash
   curl -X POST http://localhost:3000/health/fetch \
     -H "Authorization: Bearer YOUR_JWT_TOKEN"
   ```

3. **Check server logs** - you should see:
   ```
   Token expired, attempting refresh...
   Token refreshed successfully
   ```

4. **Verify token was updated:**
   ```sql
   SELECT access_token FROM users WHERE email = 'your@email.com';
   ```
   The token should be different from 'expired_token_test'

5. **Request should succeed** with health data

## Step 8: Verify Database Tables

```sql
-- Connect to database
psql health_app_db

-- Check users table
SELECT * FROM users;

-- Check health data table
SELECT * FROM user_health_data;

-- Check table structure
\d users
\d user_health_data
```

## Common Issues & Solutions

### Issue: "redirect_uri_mismatch"

**Solution:**
- Check redirect URI in Google Cloud Console matches exactly: `http://localhost:3000/auth/google/callback`
- No trailing slashes
- Must be `http://` not `https://` for localhost

### Issue: "No refresh token available"

**Solution:**
- Re-authenticate via `/auth/google`
- Make sure to grant all permissions on consent screen
- Check OAuth strategy has `accessType: 'offline'` (already configured)

### Issue: Google Fit returns no data

**Solution:**
- Ensure Google Fit app has data synced
- Check date range - try today's date
- Verify all scopes are granted in consent screen

### Issue: Database connection refused

**Solution:**
```bash
# Check PostgreSQL is running
# macOS
brew services list

# Linux
sudo systemctl status postgresql

# Start if not running
brew services start postgresql@14  # macOS
sudo systemctl start postgresql    # Linux
```

### Issue: Port 3000 already in use

**Solution:**
```bash
# Find process using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>

# Or change PORT in .env
```

## Testing Checklist

- [ ] Server starts without errors
- [ ] Database connection successful
- [ ] Google OAuth login works
- [ ] JWT token received after login
- [ ] `/auth/profile` returns user data
- [ ] `/health/fetch` successfully fetches data
- [ ] Health data saved to database
- [ ] `/health/latest` returns latest data
- [ ] `/health/dashboard` returns summary
- [ ] `/health/history` returns historical data
- [ ] Token refresh works automatically
- [ ] Database tables created correctly

## Next Steps

Once all tests pass:
1. Backend is ready for Flutter app integration
2. You can use the JWT token in Flutter app
3. All endpoints are working and secured

## API Testing Tools

- **Postman**: [Download](https://www.postman.com/downloads/)
- **Thunder Client**: VS Code extension
- **cURL**: Command line (already installed on macOS/Linux)
- **Insomnia**: [Download](https://insomnia.rest/download)

