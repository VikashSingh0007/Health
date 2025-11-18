# Health Backend - NestJS

Backend API for health tracking application with Google Fit integration, Google OAuth authentication, and automatic token refresh.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v16 or higher) - [Download](https://nodejs.org/)
- **PostgreSQL** (local installation) - [Download](https://www.postgresql.org/download/)
- **npm** (comes with Node.js)
- **Google Cloud Project** with:
  - Google OAuth2 API enabled
  - Google Fit API enabled
  - OAuth 2.0 credentials created

## Quick Start

### 1. Install Dependencies

```bash
cd health-backend
npm install
```

### 2. Setup PostgreSQL Database

**macOS (using Homebrew):**
```bash
# Install PostgreSQL (if not installed)
brew install postgresql@14

# Start PostgreSQL
brew services start postgresql@14

# Create database
createdb health_app_db
```

**Linux:**
```bash
# Install PostgreSQL
sudo apt-get install postgresql postgresql-contrib

# Start PostgreSQL
sudo systemctl start postgresql

# Create database
sudo -u postgres createdb health_app_db
```

**Windows:**
```bash
# Download and install from postgresql.org
# Then create database using pgAdmin or command line:
createdb -U postgres health_app_db
```

### 3. Configure Environment Variables

Copy the example environment file:
```bash
cp .env.example .env
```

Edit `.env` and fill in your values:

```env
# Database Configuration
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=your_actual_postgres_password
DATABASE_NAME=health_app_db

# JWT Secret (generate a strong random string)
JWT_SECRET=your_super_secret_jwt_key_min_32_characters_long

# Google OAuth (from Google Cloud Console)
GOOGLE_CLIENT_ID=your_actual_client_id
GOOGLE_CLIENT_SECRET=your_actual_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Server Configuration
PORT=3000
NODE_ENV=development
```

**To generate a JWT secret:**
```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Or use any random string generator (minimum 32 characters)
```

### 4. Google Cloud Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project named `health-app`
3. Enable APIs:
   - Google OAuth2 API
   - Google Fit API
4. Create OAuth 2.0 Credentials:
   - Type: **Web Application**
   - Authorized redirect URIs: `http://localhost:3000/auth/google/callback`
   - Copy `Client ID` and `Client Secret` to `.env`
5. Configure OAuth Consent Screen:
   - Add scopes:
     - `https://www.googleapis.com/auth/userinfo.profile`
     - `https://www.googleapis.com/auth/userinfo.email`
     - `https://www.googleapis.com/auth/fitness.activity.read`
     - `https://www.googleapis.com/auth/fitness.heart_rate.read`
     - `https://www.googleapis.com/auth/fitness.body.read`

### 5. Start the Server

```bash
npm run start:dev
```

The server will start on `http://localhost:3000`

You should see:
```
Application is running on: http://localhost:3000
```

## API Endpoints

### Authentication

#### `GET /auth/google`
Initiates Google OAuth login flow. Redirects to Google login page.

**Usage:**
- Open in browser: `http://localhost:3000/auth/google`
- Complete Google login
- You'll be redirected to callback URL

#### `GET /auth/google/callback`
OAuth callback endpoint (handled automatically).

#### `GET /auth/success`
Shows success page with JWT token after authentication.

#### `GET /auth/profile`
Get authenticated user profile.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "id": "user-uuid",
  "email": "user@example.com",
  "name": "User Name",
  "picture": "https://...",
  "created_at": "2024-01-01T00:00:00.000Z"
}
```

### Health Data

#### `POST /health/fetch`
Fetch latest health data from Google Fit and save to database.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
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
    "date": "2024-01-15",
    "fetched_at": "2024-01-15T10:30:00.000Z"
  }
}
```

#### `GET /health/latest`
Get the latest health record for the authenticated user.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "data": {
    "id": "uuid",
    "steps": 8500,
    "heart_rate": 72,
    "calories": 2100,
    "distance": 6.5,
    "date": "2024-01-15"
  }
}
```

#### `GET /health/dashboard`
Get dashboard summary (steps, calories, heart rate).

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "steps": 8500,
  "calories": 2100,
  "heartRate": 72,
  "distance": 6.5,
  "date": "2024-01-15"
}
```

#### `GET /health/history?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
Get historical health data for a date range.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Query Parameters:**
- `startDate` (optional): Start date (default: 7 days ago)
- `endDate` (optional): End date (default: today)

**Example:**
```
GET /health/history?startDate=2024-01-01&endDate=2024-01-15
```

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "steps": 8500,
      "heart_rate": 72,
      "calories": 2100,
      "date": "2024-01-15"
    }
  ],
  "startDate": "2024-01-01",
  "endDate": "2024-01-15"
}
```

## Testing the Backend

### Step 1: Start the Server

```bash
npm run start:dev
```

### Step 2: Authenticate with Google

1. Open browser and go to: `http://localhost:3000/auth/google`
2. Sign in with your Google account
3. Grant permissions for Google Fit data
4. You'll be redirected to a success page with your JWT token
5. **Copy the JWT token** from the success page

### Step 3: Test API Endpoints

#### Using cURL:

**Get User Profile:**
```bash
curl -X GET http://localhost:3000/auth/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Fetch Health Data:**
```bash
curl -X POST http://localhost:3000/health/fetch \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Get Dashboard Data:**
```bash
curl -X GET http://localhost:3000/health/dashboard \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Get Latest Health Data:**
```bash
curl -X GET http://localhost:3000/health/latest \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Get History:**
```bash
curl -X GET "http://localhost:3000/health/history?startDate=2024-01-01&endDate=2024-01-15" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### Using Postman:

1. Create a new request
2. Set method (GET/POST)
3. Enter URL: `http://localhost:3000/health/fetch`
4. Go to **Headers** tab
5. Add header:
   - Key: `Authorization`
   - Value: `Bearer YOUR_JWT_TOKEN`
6. Send request

### Step 4: Test Token Refresh

To test automatic token refresh:

1. **Manually expire a token** (for testing):
   ```sql
   -- Connect to PostgreSQL
   psql health_app_db
   
   -- Update access token to an invalid value
   UPDATE users SET access_token = 'expired_token' WHERE email = 'your@email.com';
   ```

2. **Make a health data request:**
   ```bash
   curl -X POST http://localhost:3000/health/fetch \
     -H "Authorization: Bearer YOUR_JWT_TOKEN"
   ```

3. **Expected behavior:**
   - Check server logs - you should see: "Token expired, attempting refresh..."
   - Then: "Token refreshed successfully"
   - Request should succeed with health data

4. **Verify token was updated:**
   ```sql
   SELECT access_token FROM users WHERE email = 'your@email.com';
   ```
   The token should be updated to a new value.

## Database Schema

### Users Table
- `id` (uuid, PK)
- `google_id` (string, unique)
- `email` (string, unique)
- `name` (string)
- `picture` (string, nullable)
- `access_token` (text) - Google OAuth access token
- `refresh_token` (text, nullable) - Google OAuth refresh token
- `created_at` (timestamp)
- `updated_at` (timestamp)

### UserHealthData Table
- `id` (uuid, PK)
- `user_id` (uuid, FK → users)
- `steps` (integer)
- `heart_rate` (integer, nullable)
- `calories` (integer, nullable)
- `distance` (decimal, nullable)
- `fetched_at` (timestamp)
- `date` (date)

## Troubleshooting

### Database Connection Error

**Error:** `ECONNREFUSED` or `password authentication failed`

**Solution:**
1. Verify PostgreSQL is running:
   ```bash
   # macOS
   brew services list
   
   # Linux
   sudo systemctl status postgresql
   ```

2. Check database credentials in `.env`
3. Test connection:
   ```bash
   psql -h localhost -U postgres -d health_app_db
   ```

### Google OAuth Error

**Error:** `redirect_uri_mismatch`

**Solution:**
1. Check redirect URI in Google Cloud Console matches exactly: `http://localhost:3000/auth/google/callback`
2. Ensure no trailing slashes

### Token Refresh Not Working

**Error:** `No refresh token available`

**Solution:**
1. Re-authenticate via `/auth/google`
2. Ensure OAuth consent screen shows all required scopes
3. Check that `accessType: 'offline'` is set in Google Strategy (already configured)

### Google Fit API Returns No Data

**Possible reasons:**
1. User hasn't granted Google Fit permissions
2. No health data in Google Fit account
3. Date range has no data

**Solution:**
1. Check Google Fit app on phone has data
2. Try a different date range
3. Verify scopes are granted in OAuth consent

## Development

### Project Structure

```
health-backend/
├── src/
│   ├── auth/              # Authentication module
│   │   ├── google.strategy.ts
│   │   ├── jwt.strategy.ts
│   │   ├── google-token-refresh.service.ts
│   │   └── guards/
│   ├── users/             # User management
│   │   └── entities/
│   ├── health/            # Health data & Google Fit
│   │   ├── google-fit.service.ts
│   │   └── health-data.service.ts
│   ├── database/          # Database entities
│   │   └── entities/
│   └── app.module.ts
├── .env                   # Environment variables (not in git)
├── .env.example           # Example env file
└── package.json
```

### Available Scripts

- `npm run start:dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run start:prod` - Start production server
- `npm run lint` - Run linter
- `npm test` - Run tests

## Production Deployment

Before deploying to production:

1. Set `NODE_ENV=production` in `.env`
2. Use a strong, random `JWT_SECRET`
3. Update `GOOGLE_CALLBACK_URL` to production URL
4. Set up proper database (not localhost)
5. Enable HTTPS
6. Set `synchronize: false` in TypeORM config (use migrations)

## License

Private - UNLICENSED

