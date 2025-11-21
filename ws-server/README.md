# Cheating Daddy - WebSocket Server

This is the standalone WebSocket server for Cheating Daddy. It runs independently from the Electron client and can be deployed on any VM or server.

## Quick Start

### Installation

```bash
# Clone only this directory to your VM
cd ws-server
npm install
```

### Running the Server

```bash
# Default (listens on all interfaces at port 8080)
npm start

# Custom host and port
WS_HOST=0.0.0.0 WS_PORT=8080 npm start
```

### Environment Variables

- `WS_HOST` - Host to bind to (default: `0.0.0.0` for all interfaces)
- `WS_PORT` - Port to bind to (default: `8080`)

## Deployment

### VM Deployment (Ubuntu/Debian)

1. **SSH into your VM:**
   ```bash
   ssh user@your-vm-ip
   ```

2. **Install Node.js (if not already installed):**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

3. **Clone or copy the server directory:**
   ```bash
   git clone <your-repo-url>
   cd cheating-daddy/ws-server
   # Or just copy the ws-server directory to your VM
   ```

4. **Install dependencies:**
   ```bash
   npm install
   ```

5. **Run the server:**
   ```bash
   # For testing
   npm start

   # For production (with PM2 or systemd)
   ```

### Production Deployment

#### Using PM2 (Recommended)

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start the server
pm2 start server.js --name cheating-daddy-ws

# Make it start on system boot
pm2 startup
pm2 save

# View logs
pm2 logs cheating-daddy-ws

# Monitor
pm2 monit
```

#### Using systemd

Create a service file `/etc/systemd/system/cheating-daddy-ws.service`:

```ini
[Unit]
Description=Cheating Daddy WebSocket Server
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/ws-server
Environment="WS_HOST=0.0.0.0"
Environment="WS_PORT=8080"
ExecStart=/usr/bin/node server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable cheating-daddy-ws
sudo systemctl start cheating-daddy-ws
sudo systemctl status cheating-daddy-ws
```

### Firewall Configuration

Make sure to open the WebSocket port:

```bash
# Ubuntu/Debian with ufw
sudo ufw allow 8080/tcp

# CentOS/RHEL with firewalld
sudo firewall-cmd --permanent --add-port=8080/tcp
sudo firewall-cmd --reload
```

### Azure VM Deployment

1. Create an Ubuntu VM in Azure
2. Add inbound security rule for port 8080
3. Follow the VM deployment steps above
4. Note your VM's public IP address

### AWS EC2 Deployment

1. Launch an Ubuntu EC2 instance
2. Configure security group to allow inbound TCP on port 8080
3. Follow the VM deployment steps above
4. Use the EC2 public DNS or IP address

## Client Configuration

After deploying the server, configure your Cheating Daddy clients to connect:

1. Open the Cheating Daddy app
2. Go to Helper View or Main View
3. Enter the WebSocket server URL: `ws://your-vm-ip:8080`
4. Connect and use normally

## Server Features

- **Session Persistence**: Sessions are preserved for 30 minutes after disconnect, allowing reconnection
- **Auto Reconnection**: Clients automatically attempt to reconnect if connection is lost
- **Pairing Management**: Handles asker-helper pairing and message routing
- **Graceful Shutdown**: Handles SIGTERM and SIGINT properly
- **Session Cleanup**: Automatically cleans up expired sessions every 5 minutes
- **Status Logging**: Periodic status updates every 5 minutes

## Monitoring

### Check Server Status

The server logs connection events, pairings, and message forwarding. Monitor the logs:

```bash
# If using PM2
pm2 logs cheating-daddy-ws

# If using systemd
sudo journalctl -u cheating-daddy-ws -f

# If running directly
# Check the terminal output
```

### Server Output Example

```
==========================================
Cheating Daddy - WebSocket Server
==========================================
Starting WebSocket server on 0.0.0.0:8080
✓ WebSocket server is running on 0.0.0.0:8080
✓ Server is ready to accept connections
==========================================

[2025-11-21T10:30:45.123Z] New client connected: abc123...

--- Server Status ---
Total connections: 2
  Askers: 1
  Helpers: 1
  Unassigned: 0

Askers:
  - ABCD1234 (paired with EFGH5678)

Helpers:
  - EFGH5678 (paired with ABCD1234)
--------------------
```

## Security Considerations

- **No Authentication**: The current implementation doesn't include authentication. For production use, consider:
  - Adding token-based authentication
  - Using WSS (WebSocket Secure) with TLS/SSL
  - Implementing rate limiting
  - Adding IP whitelisting

- **Network Security**: 
  - Use a firewall to restrict access
  - Consider using a VPN for additional security
  - Monitor for unusual connection patterns

## Troubleshooting

### Port Already in Use

```bash
# Find process using port 8080
sudo lsof -i :8080
# or
sudo netstat -tulpn | grep :8080

# Kill the process if needed
sudo kill -9 <PID>
```

### Connection Refused

- Check if server is running: `ps aux | grep node`
- Check firewall rules
- Verify VM security groups/firewall settings
- Test locally: `curl http://localhost:8080`

### High Memory Usage

If the server accumulates many sessions:
- Sessions expire after 30 minutes
- Restart the server to clear all sessions
- Consider reducing `SESSION_EXPIRY` in `server.js`

## API Reference

### Message Types

**Client → Server:**
- `new-connection` - Request new UID
- `reconnect` - Reconnect with existing UID
- `set-role` - Set role (asker/helper)
- `send-question` - Send question (asker only)
- `send-answer` - Send answer (helper only)
- `ping` - Health check

**Server → Client:**
- `connection-ready` - Server ready
- `connected` - New UID assigned
- `reconnected` - Reconnection successful
- `role-set` - Role confirmed
- `paired` - Pairing successful
- `question-received` - Question from asker
- `answer-received` - Answer from helper
- `partner-disconnected` - Partner disconnected
- `partner-reconnected` - Partner reconnected
- `error` - Error message
- `pong` - Ping response

## License

GPL-3.0 - Same as the main Cheating Daddy project
