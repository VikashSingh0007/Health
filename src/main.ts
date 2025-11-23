import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
// @ts-ignore - cookie-parser doesn't have TypeScript definitions in older versions
const cookieParser = require('cookie-parser');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // CORS configuration - allow specific origins for production
  const allowedOrigins = [
    'https://health-frontend-beta.vercel.app', // Vercel production frontend
    'http://localhost:3000', // Local development
    'http://localhost:8080', // Local Flutter web dev
    'http://127.0.0.1:3000',
    'http://127.0.0.1:8080',
  ];
  
  // Add any additional origins from environment variable
  if (process.env.ALLOWED_ORIGINS) {
    const envOrigins = process.env.ALLOWED_ORIGINS.split(',');
    allowedOrigins.push(...envOrigins.map(origin => origin.trim()));
  }
  
  app.enableCors({
    origin: process.env.NODE_ENV === 'production' 
      ? allowedOrigins  // Specific origins in production
      : true,           // Allow all in development
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  
  // Enable cookie parser for OAuth redirect URL storage
  app.use(cookieParser());
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`CORS enabled for origins: ${process.env.NODE_ENV === 'production' ? allowedOrigins.join(', ') : 'All origins (development)'}`);
}
bootstrap();

