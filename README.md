# WorkFuel

Telegram bot + Mini App for tracking equipment work time and fuel consumption (Uzbek / Russian).

## Flow
1. User presses **/start** in the bot → bot asks for the phone number (contact button).
2. Bot asks for the language (O'zbekcha / Русский).
3. Bot sends the **"Open app"** button and sets the chat menu button to the Mini App.
4. On first open the Mini App asks to **add equipment**: type, name/model, plate, tank capacity, fuel consumption per hour, current fuel in tank, low-fuel warning %.
5. Then: start/stop work timer or manual entry, history, tank level & refuels, monthly stats, multiple machines.

## Stack
- `src/server.js`: zero-dependency Node 20 server: Telegram long polling bot + static Mini App + JSON API.
- `public/index.html`: the Mini App (vanilla JS).
- Data: one JSON file per Telegram user in `data/users/` (Docker volume `workfuel_data`).
- API requests are authenticated by validating Telegram `initData` (HMAC-SHA256 with the bot token).

## Run locally
```bash
cp .env.example .env   # set BOT_TOKEN, WEBAPP_URL
DEV_USER_ID=1 BOT_POLLING=0 npm start   # open http://localhost:3000 without Telegram
```

## Deploy (UzCloud server)
```bash
./deploy.sh
```
The container joins the `edu-crm_edu-crm-network` Docker network; the existing Caddy (`edu-crm-caddy`)
serves `https://workfuel.109-94-173-160.sslip.io` → `workfuel:3000`.
