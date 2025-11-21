# Azure VM Deployment Guide

This guide covers deploying the Cheating Daddy WebSocket application to an Azure VM and accessing it remotely.

## Prerequisites

- Azure account with an active subscription
- Basic knowledge of SSH and Linux commands
- Local machine with SSH client

## Step 1: Create Azure VM

### 1.1 Create VM via Azure Portal

1. Go to [Azure Portal](https://portal.azure.com)
2. Click **"Create a resource"** → **"Virtual Machine"**
3. Configure the VM:
   - **Subscription**: Select your subscription
   - **Resource Group**: Create new or use existing
   - **VM Name**: `cheating-daddy-vm`
   - **Region**: Choose closest to your users
   - **Image**: Ubuntu Server 22.04 LTS
   - **Size**: Standard_B2s (2 vCPUs, 4 GB RAM) - minimum recommended
   - **Authentication**: SSH public key (recommended) or password
   - **Username**: `azureuser` (or your choice)

### 1.2 Configure Networking

In the **Networking** tab:
- Create new Virtual Network or use existing
- **Public IP**: Enable
- **NIC security group**: Advanced
- **Configure network security group**: Create new with these inbound rules:
  - SSH (22) - Your IP only
  - Custom TCP (8080) - Allow from all (WebSocket server)
  - Custom TCP (3000) - Allow from all (if exposing web interface)

### 1.3 Review and Create

- Review settings
- Click **"Create"**
- Download the SSH private key if using key authentication
- Wait for deployment to complete (2-5 minutes)

## Step 2: Connect to VM

```bash
# Get the public IP from Azure Portal
# Connect via SSH
ssh azureuser@<YOUR_VM_PUBLIC_IP>

# If using key file
chmod 600 ~/Downloads/cheating-daddy-vm_key.pem
ssh -i ~/Downloads/cheating-daddy-vm_key.pem azureuser@<YOUR_VM_PUBLIC_IP>
```

## Step 3: Install Dependencies on VM

### 3.1 Update System

```bash
sudo apt update
sudo apt upgrade -y
```

### 3.2 Install Node.js and npm

```bash
# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x
```

### 3.3 Install Bun (Optional but recommended)

```bash
curl -fsSL https://bun.sh/install | bash

# Add to PATH
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Verify
bun --version
```

### 3.4 Install Git

```bash
sudo apt install -y git
```

## Step 4: Deploy Application

### 4.1 Clone Repository

```bash
# Clone your repository
git clone https://github.com/yourusername/cheating-daddy.git
cd cheating-daddy

# Or upload files via SCP from local machine
# scp -r /home/trishank/Desktop/cheating-daddy azureuser@<VM_IP>:~/
```

### 4.2 Install Dependencies

```bash
# Using npm
npm install

# Or using bun
bun install
```

## Step 5: Configure Application for Azure

### 5.1 Update WebSocket Configuration

Create `.env` file in project root:

```bash
cat > .env << 'EOF'
# WebSocket Server Configuration
WS_HOST=0.0.0.0
WS_PORT=8080

# Node Environment
NODE_ENV=production
EOF
```

### 5.2 Modify WebSocket Server

Update `src/utils/websocket.js`:

```javascript
function initializeWebSocketServer(port = process.env.WS_PORT || 8080) {
    if (wss) {
        console.log('WebSocket server already running');
        return wss;
    }

    wss = new WebSocketServer({ 
        port,
        host: process.env.WS_HOST || '0.0.0.0'  // Listen on all interfaces
    });

    console.log(`WebSocket server started on ${process.env.WS_HOST || '0.0.0.0'}:${port}`);
    // ... rest of the code
}
```

### 5.3 Update Client Connection

Update `src/index.js` to use environment variable for WebSocket URL:

```javascript
// In setupWebSocketIpcHandlers function
ipcMain.handle('ws-connect', async (event, role, pairWithUID) => {
    try {
        if (wsClient && wsClient.readyState === WebSocket.OPEN) {
            return { success: false, error: 'Already connected' };
        }

        // Use environment variable or default to localhost
        const wsUrl = process.env.WS_SERVER_URL || 'ws://localhost:8080';
        wsClient = new WebSocket(wsUrl);
        
        // ... rest of the code
    }
});
```

## Step 6: Run WebSocket Server

**Important:** On the Azure VM, you only need to run the WebSocket server (not the full Electron app).

### 6.1 Quick Test (Foreground)

```bash
# Test the server
npm run server
```

You should see:
```
==========================================
Cheating Daddy - WebSocket Server
==========================================
Starting WebSocket server on 0.0.0.0:8080
✓ WebSocket server is running on 0.0.0.0:8080
✓ Server is ready to accept connections
==========================================
```

Press `Ctrl+C` to stop. Now let's set it up for production.

### 6.2 Production Run with PM2 (Recommended)

Install PM2 for process management:

```bash
# Install PM2 globally
sudo npm install -g pm2

# Create PM2 ecosystem file
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'cheating-daddy',
    script: 'npm',
    args: 'start',
    cwd: '/home/azureuser/cheating-daddy',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      WS_HOST: '0.0.0.0',
      WS_PORT: 8080
    }
  }]
};
EOF

# Start application with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Follow the command it outputs (run with sudo)

# Monitor application
pm2 status
pm2 logs cheating-daddy
```

## Step 7: Configure Firewall (Azure NSG)

### 7.1 Via Azure Portal

1. Go to your VM → **Networking** → **Network settings**
2. Click **"Add inbound port rule"**
3. Add rules:
   - **Port**: 8080
   - **Protocol**: TCP
   - **Source**: Any (or specific IPs)
   - **Action**: Allow
   - **Priority**: 1000
   - **Name**: WebSocket-8080

### 7.2 Via Azure CLI

```bash
# From your local machine
az vm open-port --resource-group <YOUR_RESOURCE_GROUP> \
  --name cheating-daddy-vm \
  --port 8080 \
  --priority 1000
```

### 7.3 Ubuntu Firewall (on VM)

```bash
# Allow WebSocket port
sudo ufw allow 8080/tcp

# Allow SSH (if not already allowed)
sudo ufw allow 22/tcp

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

## Step 8: Access Application

### 8.1 For Asker (Person Taking Exam)

On the **local machine** where the exam is being taken:

1. Install the application locally:
```bash
git clone https://github.com/yourusername/cheating-daddy.git
cd cheating-daddy
npm install  # or bun install
```

2. Start the application:
```bash
npm start  # or bun start
```

3. **Configure WebSocket Server** at startup:
   - Protocol: Select `ws://` (or `wss://` if using SSL)
   - Host: Enter `<YOUR_AZURE_VM_PUBLIC_IP>` (e.g., `20.123.45.67`)
   - Port: Enter `8080` (or your custom port)
   - The app will show the full URL: `ws://20.123.45.67:8080`

4. Select **"Asker"** role
5. Click "Start Session"
6. Your UID will be displayed in the header - share it with the helper

### 8.2 For Helper (Remote Person Sending Answers)

The helper can access from anywhere:

1. Install the application on their machine:
```bash
git clone https://github.com/yourusername/cheating-daddy.git
cd cheating-daddy
npm install  # or bun install
```

2. Start the application:
```bash
npm start  # or bun start
```

3. **Configure WebSocket Server** (same as asker):
   - Protocol: `ws://` (or `wss://` if using SSL)
   - Host: `<YOUR_AZURE_VM_PUBLIC_IP>`
   - Port: `8080`

4. Select **"Helper"** role
5. Enter the Asker's UID (received from them)
6. Click "Start Session"
7. Send answers in real-time

**No code changes or .env files needed!** All configuration is done through the UI.

## Step 9: Optional Enhancements

### 9.1 Use Domain Name

```bash
# Instead of IP, use a domain name
# 1. Register domain (e.g., from Namecheap, GoDaddy)
# 2. Add A record pointing to your Azure VM public IP
# 3. Update connection URL:
WS_SERVER_URL=ws://your-domain.com:8080
```

### 9.2 Add SSL/TLS (Secure WebSocket)

```bash
# Install Nginx
sudo apt install -y nginx

# Install Certbot for Let's Encrypt
sudo apt install -y certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com

# Configure Nginx as reverse proxy
sudo nano /etc/nginx/sites-available/default
```

Add this configuration:
```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
# Test Nginx config
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

# Update connection URL to use wss://
WS_SERVER_URL=wss://your-domain.com
```

### 9.3 Monitoring and Logging

```bash
# View PM2 logs
pm2 logs cheating-daddy

# View system logs
sudo journalctl -u nginx -f

# Monitor server resources
htop
```

## Step 10: Maintenance

### 10.1 Update Application

```bash
# SSH into VM
cd ~/cheating-daddy

# Pull latest changes
git pull origin master

# Install new dependencies
npm install
# or
bun install

# Restart application
pm2 restart cheating-daddy
```

### 10.2 Backup Configuration

```bash
# Create backup script
cat > ~/backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
tar -czf ~/backups/cheating-daddy-$DATE.tar.gz ~/cheating-daddy
find ~/backups -name "*.tar.gz" -mtime +7 -delete
EOF

chmod +x ~/backup.sh

# Add to crontab (daily at 2 AM)
crontab -e
# Add: 0 2 * * * /home/azureuser/backup.sh
```

## Troubleshooting

### Connection Issues

```bash
# Check if WebSocket server is running
pm2 status
pm2 logs cheating-daddy

# Check if port is listening
sudo netstat -tlnp | grep 8080

# Test WebSocket connection
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
  http://<VM_IP>:8080
```

### Firewall Issues

```bash
# Check Azure NSG rules
az network nsg rule list --resource-group <RG> --nsg-name <NSG> --output table

# Check Ubuntu firewall
sudo ufw status verbose

# Temporarily disable firewall for testing
sudo ufw disable
# Test connection
# Re-enable
sudo ufw enable
```

### Performance Issues

```bash
# Check system resources
htop
free -h
df -h

# Increase VM size in Azure Portal if needed
# Scale up to Standard_B2ms (8 GB RAM) or higher
```

## Cost Optimization

- **B-Series VMs**: Best for this workload (burstable, cost-effective)
- **Auto-shutdown**: Configure in Azure Portal to stop VM during non-use hours
- **Reserved Instances**: Save up to 72% if running 24/7
- **Estimated Monthly Cost**: 
  - Standard_B2s: ~$30-40/month
  - Standard_B2ms: ~$60-80/month

## Security Best Practices

1. **SSH**: Use key-based authentication only, disable password auth
2. **Firewall**: Only open required ports (22, 8080)
3. **Updates**: Regularly update OS and dependencies
4. **Monitoring**: Set up Azure Monitor alerts
5. **Access Control**: Use Azure RBAC for VM management
6. **Secrets**: Never commit `.env` files to git
7. **Rate Limiting**: Add to WebSocket server to prevent abuse

## Summary

Your application is now:
- ✅ Running on Azure VM
- ✅ Accessible from anywhere via `ws://<VM_IP>:8080`
- ✅ Auto-restarting on crashes via PM2
- ✅ Persistent across VM reboots
- ✅ Ready for asker/helper connections

**Quick Start Commands:**
```bash
# On Azure VM
pm2 status              # Check app status
pm2 logs                # View logs
pm2 restart all         # Restart app

# On Local Machine (Asker/Helper)
# Update .env.local with: WS_SERVER_URL=ws://<VM_IP>:8080
npm start
```
