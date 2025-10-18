#!/bin/bash

# TRS Tickets Bot - Premium System Installation Script
# This script installs all required dependencies for the Premium system

echo "🚀 TRS Tickets Bot - Premium System Installation"
echo "=================================================="
echo ""

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ Error: npm is not installed"
    echo "Please install Node.js and npm first"
    exit 1
fi

echo "📦 Installing Stripe dependency..."
npm install stripe

if [ $? -eq 0 ]; then
    echo "✅ Stripe installed successfully"
else
    echo "❌ Failed to install Stripe"
    exit 1
fi

echo ""
echo "📝 Checking .env file..."

if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found"
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo "✅ .env file created"
    echo ""
    echo "⚠️  IMPORTANT: You need to configure your .env file with:"
    echo "   - STRIPE_SECRET_KEY"
    echo "   - STRIPE_WEBHOOK_SECRET"
    echo "   - STRIPE_PRICE_BASIC"
    echo "   - STRIPE_PRICE_PRO"
    echo ""
    echo "See STRIPE_QUICK_START.md for details"
else
    echo "✅ .env file exists"

    # Check if Stripe keys are configured
    if grep -q "STRIPE_SECRET_KEY=sk_" .env; then
        echo "✅ Stripe keys appear to be configured"
    else
        echo "⚠️  Stripe keys not configured in .env"
        echo "Please add your Stripe keys to .env"
        echo "See STRIPE_QUICK_START.md for details"
    fi
fi

echo ""
echo "📚 Documentation files:"
echo "   - STRIPE_QUICK_START.md - Quick 5-minute setup guide"
echo "   - STRIPE_SETUP_COMPLETE.md - Detailed setup instructions"
echo "   - PREMIUM_SETUP.md - Premium system overview"
echo ""

echo "✅ Installation complete!"
echo ""
echo "Next steps:"
echo "1. Configure your .env file with Stripe keys"
echo "2. Restart the bot: sudo systemctl restart trs-bot"
echo "3. Test at: https://tickets.quantix-bot.de/premium"
echo ""
echo "Need help? Check STRIPE_QUICK_START.md"
