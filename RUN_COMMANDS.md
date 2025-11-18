# Commands to Run the Project

## Quick Start Commands

### 1. Navigate to project directory
```bash
cd /Users/vikash.singh/Desktop/Project/health-backend
```

### 2. Verify .env file is configured
```bash
node verify-env.js
```

### 3. Install dependencies (if not already installed)
```bash
npm install
```

### 4. Start the development server
```bash
npm run start:dev
```

## All Available Commands

### Development
```bash
# Start development server with hot reload
npm run start:dev

# Start in debug mode
npm run start:debug

# Start production build
npm run start:prod
```

### Building
```bash
# Build for production
npm run build
```

### Testing
```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run e2e tests
npm run test:e2e
```

### Code Quality
```bash
# Run linter
npm run lint

# Format code
npm run format
```

## Complete Setup & Run (First Time)

```bash
# 1. Go to project directory
cd /Users/vikash.singh/Desktop/Project/health-backend

# 2. Verify environment variables
node verify-env.js

# 3. Install dependencies
npm install

# 4. Start the server
npm run start:dev
```

## After Server Starts

You should see:
```
[Nest] Starting Nest application...
[Nest] Application successfully started
Application is running on: http://localhost:3000
```

Then test in browser:
- Open: `http://localhost:3000/auth/google`

## Stop the Server

Press `Ctrl + C` in the terminal where server is running.

