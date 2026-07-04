# BloxdTranslationLayer
A middle man to translate Bloxd packets into Minecraft 1.8.9 packets.

## Use Steps
1. Install the latest NodeJS at (https://nodejs.org/)
2. Download & extract the repository to a random folder
3. Open a terminal inside said folder
4. Run npm install & npm start
5. Install the tampermonkey script included in the files
6. Open a webbrowser and goto https://bloxd.io
7. Connect to localhost on a supported Minecraft 1.8.9 client.

## Electron UI
Run `npm run dev` to start the Electron + Fluent UI desktop app. The UI starts an internal Bloxd Chromium page and uses Chrome DevTools Protocol injection for the browser proxy, so external Chrome and Tampermonkey are only needed for the legacy CLI fallback.

## Commands
/play (gamemode type / skywars / bedwars_duo / pirates) (aliases include /queue)
/party (create, join, list) (alises include /p)
