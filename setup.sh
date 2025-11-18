#!/bin/bash

echo "🚀 Health Backend Setup Script"
echo "================================"
echo ""

# Check if .env exists
if [ -f .env ]; then
    echo "⚠️  .env file already exists. Skipping creation."
    echo ""
else
    echo "📝 Creating .env file from .env.example..."
    cp .env.example .env
    echo "✅ .env file created!"
    echo ""
    echo "⚠️  IMPORTANT: Please edit .env and fill in your values:"
    echo "   - DATABASE_PASSWORD"
    echo "   - JWT_SECRET (generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\")"
    echo "   - GOOGLE_CLIENT_ID"
    echo "   - GOOGLE_CLIENT_SECRET"
    echo ""
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo "✅ Dependencies installed!"
    echo ""
else
    echo "✅ Dependencies already installed"
    echo ""
fi

# Check PostgreSQL connection
echo "🔍 Checking PostgreSQL connection..."
if command -v psql &> /dev/null; then
    echo "✅ PostgreSQL client found"
    echo ""
    echo "📋 Next steps:"
    echo "   1. Make sure PostgreSQL is running"
    echo "   2. Create database: createdb health_app_db"
    echo "   3. Update .env with your database credentials"
    echo "   4. Update .env with Google OAuth credentials"
    echo "   5. Run: npm run start:dev"
else
    echo "⚠️  PostgreSQL client not found. Please install PostgreSQL."
    echo ""
fi

echo ""
echo "✨ Setup complete! Read README.md for detailed instructions."

