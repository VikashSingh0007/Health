# .env File Checklist

Please verify your `.env` file has all these variables configured:

## Required Variables

### Database Configuration
```env
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=your_actual_postgres_password
DATABASE_NAME=health_app_db
```

**Check:**
- [ ] `DATABASE_PASSWORD` matches your PostgreSQL password
- [ ] `DATABASE_NAME` is `health_app_db` (or matches your database name)

### JWT Secret
```env
JWT_SECRET=your_super_secret_jwt_key_min_32_characters_long
```

**Check:**
- [ ] `JWT_SECRET` is at least 32 characters long
- [ ] It's a random, secure string (not a simple word)

**Generate if needed:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Google OAuth Configuration
```env
GOOGLE_CLIENT_ID=your_actual_client_id_from_google_cloud
GOOGLE_CLIENT_SECRET=your_actual_client_secret_from_google_cloud
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
```

**Check:**
- [ ] `GOOGLE_CLIENT_ID` is from Google Cloud Console → Credentials → OAuth 2.0 Client ID (Web Application)
- [ ] `GOOGLE_CLIENT_SECRET` matches the client ID
- [ ] `GOOGLE_CALLBACK_URL` is exactly: `http://localhost:3000/auth/google/callback` (no trailing slash)

### Server Configuration
```env
PORT=3000
NODE_ENV=development
```

**Check:**
- [ ] `PORT` is 3000 (or your preferred port)
- [ ] `NODE_ENV` is `development` for local development

## Common Issues

### Issue: Database connection fails
**Solution:** Verify PostgreSQL is running and password is correct
```bash
psql -h localhost -U postgres -d health_app_db
```

### Issue: Google OAuth redirect_uri_mismatch
**Solution:** 
- Check redirect URI in Google Cloud Console matches exactly: `http://localhost:3000/auth/google/callback`
- No `https://` for localhost
- No trailing slash

### Issue: JWT_SECRET too short
**Solution:** Generate a new one (minimum 32 characters)

## Quick Verification

Run this to check if all required variables are set:
```bash
cd health-backend
node -e "
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const required = ['DATABASE_HOST', 'DATABASE_PORT', 'DATABASE_USER', 'DATABASE_PASSWORD', 'DATABASE_NAME', 'JWT_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CALLBACK_URL', 'PORT'];
const missing = required.filter(key => !env.includes(key + '='));
if (missing.length === 0) {
  console.log('✅ All required variables found');
} else {
  console.log('❌ Missing variables:', missing.join(', '));
}
"
```

