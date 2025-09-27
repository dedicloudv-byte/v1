#!/usr/bin/env bash
# ==========================================================
# Auto-install VLESS + WS + TLS + Nginx (Ubuntu 20.04)
# Usage (root):
#   bash <(curl -Ls https://raw.githubusercontent.com/v1/vless.sh)
# ==========================================================

set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

# ---------- warna ----------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; NC='\033[0m'

# ---------- cek root ----------
[[ $EUID -ne 0 ]] && { echo -e "${RED}❌  Run as root${NC}"; exit 1; }

# ---------- variabel ----------
UUID=$(cat /proc/sys/kernel/random/uuid)
DOMAIN=${DOMAIN:-""}               # bisa di-export manual
PORT=${PORT:-443}
WS_PATH=$(tr -dc 'a-z0-9' </dev/urandom | head -c8)
EMAIL="admin@${DOMAIN:-localhost}"

# ---------- fungsi ----------
log()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERR]${NC} $*"; exit 1; }

# ---------- update & deps ----------
sys_update() {
  log "Update sistem & install deps"
  apt-get update -qq
  apt-get install -y curl wget gnupg2 lsb-release nginx uuid-runtime jq socat
}

# ---------- domain ----------
get_domain() {
  if [[ -z "$DOMAIN" ]]; then
    read -rp "Masukkan domain (sudah pointing ke IP ini): " DOMAIN
  fi
  [[ -z "$DOMAIN" ]] && err "Domain tidak boleh kosong"
  echo "${DOMAIN}" > /usr/local/etc/vless-domain
}

# ---------- cert ----------
get_cert() {
  log "Mengambil cert via acme.sh (ZeroSSL)"
  curl -fsSL https://get.acme.sh | sh -s email=$EMAIL
  ~/.acme.sh/acme.sh --set-default-ca --server zerossl
  ~/.acme.sh/acme.sh --issue -d "$DOMAIN" --webroot /var/www/html \
     --keypath /usr/local/etc/xray/xray.key \
     --fullchainpath /usr/local/etc/xray/xray.crt \
     --reloadcmd "systemctl restart xray"
}

# ---------- xray ----------
install_xray() {
  log "Install Xray-core"
  bash <(curl -Ls https://github.com/XTLS/Xray-install/raw/main/install-release.sh) install
  mkdir -p /usr/local/etc/xray
}

# ---------- config xray ----------
cfg_xray() {
  log "Generate config Xray"
  cat >/usr/local/etc/xray/config.json <<EOF
{
  "log": { "loglevel": "warning" },
  "inbounds": [{
    "port": $PORT,
    "protocol": "vless",
    "settings": {
      "clients": [{ "id": "$UUID", "flow": "xtls-rprx-vision" }],
      "decryption": "none"
    },
    "streamSettings": {
      "network": "ws",
      "wsSettings": { "path": "/$WS_PATH" },
      "security": "tls",
      "tlsSettings": {
        "certificates": [{
          "certificateFile": "/usr/local/etc/xray/xray.crt",
          "keyFile": "/usr/local/etc/xray/xray.key"
        }]
      }
    }
  }],
  "outbounds": [{ "protocol": "freedom", "tag": "direct" }]
}
EOF
  systemctl enable xray && systemctl restart xray
}

# ---------- nginx ----------
cfg_nginx() {
  log "Setting Nginx reverse-proxy"
  rm -f /etc/nginx/sites-enabled/default
  cat >/etc/nginx/sites-available/vless <<EOF
server {
    listen 80;
    server_name $DOMAIN;
    root /var/www/html;
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl http2;
    server_name $DOMAIN;
    ssl_certificate /usr/local/etc/xray/xray.crt;
    ssl_certificate_key /usr/local/etc/xray/xray.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    location /$WS_PATH {
        proxy_redirect off;
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
    }
    location / {
       root /var/www/html;
       index index.html;
    }
}
EOF
  ln -sf /etc/nginx/sites-available/vless /etc/nginx/sites-enabled/
  nginx -t && systemctl restart nginx
}

# ---------- firewall ----------
open_port() {
  log "Buka port $PORT"
  ufw allow "$PORT/tcp" >/dev/null 2>&1 || true
}

# ---------- uninstall ----------
make_uninstall() {
  cat >/usr/local/bin/vless-uninstall <<'UNINSTALL'
#!/usr/bin/env bash
systemctl stop xray nginx
systemctl disable xray
bash <(curl -Ls https://github.com/XTLS/Xray-install/raw/main/install-release.sh) remove
apt-get autoremove -y nginx
rm -rf /usr/local/etc/xray /etc/nginx/sites-*vless* /usr/local/bin/vless-uninstall
echo "VLESS dihapus."
UNINSTALL
  chmod +x /usr/local/bin/vless-uninstall
}

# ---------- show info ----------
show_info() {
  cat <<EOF

========================================
✅  Instalasi selesai!
----------------------------------------
Domain      : $DOMAIN
Port        : $PORT
UUID        : $UUID
Path WS     : /$WS_PATH
----------------------------------------
Link VLESS  :
vless://${UUID}@${DOMAIN}:${PORT}?type=ws&security=tls&path=/${WS_PATH}#VLESS-${DOMAIN}

Uninstall   : vless-uninstall
========================================
EOF
}

# ---------- main ----------
main() {
  sys_update
  get_domain
  install_xray
  get_cert
  cfg_xray
  cfg_nginx
  open_port
  make_uninstall
  show_info
}

main
