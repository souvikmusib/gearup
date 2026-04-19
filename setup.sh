#!/bin/bash
set -e

echo "🔧 GearUp Servicing — First Time Setup"
echo "========================================"
echo ""

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "❌ Node.js is required. Install from https://nodejs.org"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "❌ pnpm is required. Run: npm install -g pnpm"; exit 1; }

echo "✅ Prerequisites: node $(node -v), pnpm $(pnpm -v)"
echo ""

# Check .env
if [ ! -f apps/web/.env ]; then
  if [ -f .env.example ]; then
    cp .env.example apps/web/.env
    echo "📄 Created apps/web/.env from .env.example"
    echo "⚠️  Please fill in your Supabase credentials in apps/web/.env"
    echo "   Required: DATABASE_URL, DIRECT_URL, JWT_SECRET"
    echo ""
    read -p "Press Enter after updating .env (or Ctrl+C to exit)..."
  else
    echo "❌ No .env.example found. Create apps/web/.env with:"
    echo "   DATABASE_URL=postgresql://..."
    echo "   DIRECT_URL=postgresql://..."
    echo "   JWT_SECRET=$(openssl rand -base64 32)"
    exit 1
  fi
fi

echo ""
echo "📦 Installing dependencies..."
pnpm install

echo ""
echo "🗄️  Generating Prisma Client..."
cd apps/web
npx prisma generate

echo ""
echo "🗄️  Pushing schema to database..."
npx prisma db push

echo ""
echo "🌱 Seeding admin user..."
npx tsx prisma/seed.ts

echo ""
echo "========================================"
echo "✅ Setup complete!"
echo ""
echo "🚀 Run the app:  pnpm dev"
echo "🌐 Open:         http://localhost:3000"
echo "🔑 Admin login:  admin / admin123"
echo "========================================"
