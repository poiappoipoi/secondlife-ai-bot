# Cloudflare Tunnel Setup Guide

This guide explains how to expose your Second Life AI Bot server to the internet using Cloudflare Tunnel (cloudflared). This allows your LSL script to connect to your server without needing to open ports on your firewall or configure port forwarding.

## Prerequisites

1. A Cloudflare account (free tier works)
2. A domain added to Cloudflare (optional for quick tunnels)
3. `cloudflared` installed on your system

## Installation

### Install cloudflared

**Windows (PowerShell):**
```powershell
# Download from: https://github.com/cloudflare/cloudflared/releases
# Or use Chocolatey:
choco install cloudflared
```

**macOS:**
```bash
brew install cloudflared
```

**Linux:**
```bash
# Debian/Ubuntu
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb

# Or use package manager
sudo snap install cloudflared
```

**Verify installation:**
```bash
cloudflared --version
```

## Method 1: Quick Tunnel (Testing/Development)

This is the fastest way to get started. The URL changes each time you restart the tunnel.

### Steps

1. Start your server:
```bash
cd server
npm run dev
# or
npm start
```

2. In a separate terminal, run cloudflared:
```bash
cloudflared tunnel --url http://localhost:3000
```

3. Copy the HTTPS URL shown (e.g., `https://random-name.trycloudflare.com`)

4. Update your LSL script (`lsl/brain.lsl`):
```lsl
string url_base = "https://random-name.trycloudflare.com";
```

**Note:** Quick tunnel URLs expire after a period of inactivity. Use Method 2 for a permanent solution.

## Method 2: Named Tunnel (Production)

This creates a persistent tunnel with a stable URL.

### Step 1: Login to Cloudflare

```bash
cloudflared tunnel login
```

This will open your browser. Select the domain you want to use.

### Step 2: Create a Named Tunnel

```bash
cloudflared tunnel create ai-bot-tunnel
```

This creates a tunnel named `ai-bot-tunnel` and saves credentials to `~/.cloudflared/<tunnel-id>.json`

### Step 3: Create DNS Record

**Option A: Using CLI (recommended):**
```bash
cloudflared tunnel route dns ai-bot-tunnel ai-bot.yourdomain.com
```

**Option B: Manual DNS Setup:**
1. Go to Cloudflare Dashboard → DNS → Records
2. Add a CNAME record:
   - Name: `ai-bot` (or subdomain of your choice)
   - Target: `<tunnel-id>.cfargotunnel.com`
   - Proxy: Enabled (orange cloud)

### Step 4: Configure Tunnel

Create or edit `cloudflared-config.yml` in your project root:

```yaml
tunnel: ai-bot-tunnel
credentials-file: .cloudflared/<tunnel-id>.json

ingress:
  - hostname: ai-bot.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

**Important:** Replace `<tunnel-id>` with your actual tunnel ID from Step 2.

### Step 5: Test the Configuration

```bash
cloudflared tunnel --config cloudflared-config.yml run ai-bot-tunnel
```

### Step 6: Run as a Service (Windows)

Create a service using NSSM (Non-Sucking Service Manager):

1. Download NSSM: https://nssm.cc/download
2. Install the service:
```powershell
# Navigate to NSSM install directory
cd C:\path\to\nssm\win64

# Install cloudflared as a service
.\nssm.exe install CloudflareTunnel "C:\path\to\cloudflared.exe" "tunnel --config C:\path\to\ai-bot\cloudflared-config.yml run ai-bot-tunnel"

# Set working directory
.\nssm.exe set CloudflareTunnel AppDirectory "C:\path\to\ai-bot"

# Start the service
.\nssm.exe start CloudflareTunnel
```

**Or use Task Scheduler:**
1. Open Task Scheduler
2. Create Basic Task
3. Name: "Cloudflare Tunnel"
4. Trigger: "When the computer starts"
5. Action: "Start a program"
6. Program: `C:\path\to\cloudflared.exe`
7. Arguments: `tunnel --config C:\path\to\ai-bot\cloudflared-config.yml run ai-bot-tunnel`
8. Start in: `C:\path\to\ai-bot`

### Step 7: Run as a Service (Linux/macOS)

**Linux (systemd):**

Create `/etc/systemd/system/cloudflared-tunnel.service`:

```ini
[Unit]
Description=Cloudflare Tunnel
After=network.target

[Service]
Type=simple
User=your-username
ExecStart=/usr/local/bin/cloudflared tunnel --config /path/to/ai-bot/cloudflared-config.yml run ai-bot-tunnel
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable cloudflared-tunnel
sudo systemctl start cloudflared-tunnel
sudo systemctl status cloudflared-tunnel
```

**macOS (launchd):**

Create `~/Library/LaunchAgents/com.cloudflare.tunnel.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.cloudflare.tunnel</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/cloudflared</string>
        <string>tunnel</string>
        <string>--config</string>
        <string>/path/to/ai-bot/cloudflared-config.yml</string>
        <string>run</string>
        <string>ai-bot-tunnel</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
```

Load the service:
```bash
launchctl load ~/Library/LaunchAgents/com.cloudflare.tunnel.plist
launchctl start com.cloudflare.tunnel
```

### Step 8: Update LSL Script

Update `lsl/brain.lsl` with your domain:

```lsl
string url_base = "https://ai-bot.yourdomain.com";
```

## Troubleshooting

### Tunnel won't start
- Verify credentials file exists and path is correct
- Check tunnel name matches in config
- Ensure you're logged in: `cloudflared tunnel list`

### Connection refused
- Verify server is running on port 3000 (or configured PORT)
- Check firewall isn't blocking localhost connections
- Test local access: `curl http://localhost:3000/chat`

### DNS not resolving
- Wait 1-2 minutes for DNS propagation
- Verify CNAME record in Cloudflare dashboard
- Check proxy status is enabled (orange cloud)

### SSL/TLS errors in LSL
- Cloudflare Tunnel automatically provides HTTPS
- Ensure you use `https://` in `url_base`
- Verify domain certificate in Cloudflare dashboard

### View tunnel logs
```bash
# Quick tunnel
cloudflared tunnel --url http://localhost:3000 --loglevel debug

# Named tunnel
cloudflared tunnel --config cloudflared-config.yml run ai-bot-tunnel --loglevel debug
```

## Security Considerations

1. **Rate Limiting:** Your server already has rate limiting (40 req/hour). Cloudflare also provides DDoS protection.

2. **Access Control:** Consider adding Cloudflare Access rules if you want to restrict access to specific IPs or users.

3. **API Keys:** Never commit `.cloudflared/credentials.json` or `key.env` to git. These files are already in `.gitignore`.

4. **HTTPS:** Cloudflare Tunnel automatically provides HTTPS encryption, so your LSL script should use `https://` URLs.

## Updating Your Server

When deploying updates:

1. Restart your Node.js server (tunnel continues running)
2. If you change the port, update `cloudflared-config.yml`
3. If you change the domain, update DNS records and config

## Additional Resources

- [Cloudflare Tunnel Documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- [cloudflared CLI Reference](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/tunnel-guide/)
- [Cloudflare Dashboard](https://dash.cloudflare.com/)
