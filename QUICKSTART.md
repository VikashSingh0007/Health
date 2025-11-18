# Quick Start Guide

Get the backend running in 5 minutes!

## Prerequisites

- PostgreSQL installed and running
- Node.js v16+ installed
- Google Cloud credentials ready

## 1. Setup Environment

```bash
# Copy environment file
cp .env.example .env

# Generate JWT secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Edit `.env` and fill in:
- `DATABASE_PASSWORD` - Your PostgreSQL password
- `JWT_SECRET` - Paste the generated secret
- `GOOGLE_CLIENT_ID` - From Google Cloud Console
- `GOOGLE_CLIENT_SECRET` - From Google Cloud Console

## 2. Create Database

```bash
createdb health_app_db
```

## 3. Install & Start

```bash
npm install
npm run start:dev
```

## 4. Test Authentication

1. Open: `http://localhost:3000/auth/google`
2. Login with Google
3. Copy JWT token from success page

## 5. Test API

```bash
# Replace YOUR_JWT_TOKEN with actual token
curl -X POST http://localhost:3000/health/fetch \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Done! 🎉

For detailed instructions, see:
- `README.md` - Full documentation
- `TESTING_GUIDE.md` - Step-by-step testing

