#!/bin/bash

# Deployment script for Azure VM
# Run this script on your Azure VM after uploading the code

set -e  # Exit on error

echo "================================"
echo "Cheating Daddy - Azure Deployment"
echo "================================"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
   echo "Please don't run as root"
   exit 1
fi

echo -e "${YELLOW}[1/8] Updating system packages...${NC}"
sudo apt update
sudo apt upgrade -y

echo -e "${YELLOW}[2/8] Installing Node.js...${NC}"
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
    echo -e "${GREEN}Node.js installed: $(node --version)${NC}"
else
    echo -e "${GREEN}Node.js already installed: $(node --version)${NC}"
fi

echo -e "${YELLOW}[3/8] Installing Bun (optional)...${NC}"
if ! command -v bun &> /dev/null; then
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
    echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc
    echo -e "${GREEN}Bun installed: $(bun --version)${NC}"
else
    echo -e "${GREEN}Bun already installed: $(bun --version)${NC}"
fi

echo -e "${YELLOW}[4/8] Installing PM2...${NC}"
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
    echo -e "${GREEN}PM2 installed${NC}"
else
    echo -e "${GREEN}PM2 already installed${NC}"
fi

echo -e "${YELLOW}[5/8] Installing application dependencies...${NC}"
if command -v bun &> /dev/null; then
    bun install
else
    npm install
fi
echo -e "${GREEN}Dependencies installed${NC}"

echo -e "${YELLOW}[6/8] Configuring environment...${NC}"
if [ ! -f .env ]; then
    echo "Creating .env file..."
    cat > .env << 'EOF'
WS_HOST=0.0.0.0
WS_PORT=8080
NODE_ENV=production
EOF
    echo -e "${GREEN}.env file created${NC}"
else
    echo -e "${GREEN}.env file already exists${NC}"
fi

echo -e "${YELLOW}[7/8] Configuring firewall...${NC}"
if command -v ufw &> /dev/null; then
    sudo ufw allow 8080/tcp
    sudo ufw allow 22/tcp
    echo -e "${GREEN}Firewall rules added${NC}"
else
    echo -e "${YELLOW}UFW not found, skipping firewall configuration${NC}"
fi

echo -e "${YELLOW}[8/8] Starting WebSocket server with PM2...${NC}"
# Create logs directory
mkdir -p logs

# Stop existing instance if running
pm2 stop cheating-daddy-server 2>/dev/null || true
pm2 delete cheating-daddy-server 2>/dev/null || true

# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
echo -e "${YELLOW}Setting up PM2 startup script...${NC}"
PM2_STARTUP_CMD=$(pm2 startup | grep "sudo env" || pm2 startup | grep "sudo")
if [ ! -z "$PM2_STARTUP_CMD" ]; then
    echo "Please run this command to enable PM2 on system boot:"
    echo -e "${GREEN}$PM2_STARTUP_CMD${NC}"
fi

echo ""
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo "Server Status:"
pm2 status
echo ""
echo "View logs:"
echo "  pm2 logs cheating-daddy-server"
echo ""
echo "Useful commands:"
echo "  pm2 status              - Check server status"
echo "  pm2 restart all         - Restart server"
echo "  pm2 stop all            - Stop server"
echo "  pm2 logs                - View logs"
echo ""
echo "WebSocket Server is running at:"
PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || echo "YOUR_SERVER_IP")
echo "  ws://$PUBLIC_IP:8080"
echo ""
echo "Next steps:"
echo "1. Configure Azure NSG to allow port 8080 (if not done)"
echo "2. On client machines, enter this in the app:"
echo "   Protocol: ws://"
echo "   Host: $PUBLIC_IP"
echo "   Port: 8080"
echo ""
echo "Test the server:"
echo "  curl -i -N -H 'Connection: Upgrade' -H 'Upgrade: websocket' http://localhost:8080"
echo ""
