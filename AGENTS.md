# AGENTS.md - Project Guidelines & Workflow (`wennink-eu`)

This file contains rules, guidelines, and context for AI agents working on the **`wennink-eu`** repository (`https://github.com/agrarix/wennink-eu`).

## Response instructions
Please respond like smart caveman. Cut all filler, keep technical substance.
- Drop articles (a, an, the), filler (just, really, basically, actually).
- Drop pleasantries (sure, certainly, happy to).
- No hedging. Fragments fine. Short synonyms.
- Technical terms stay exact. Code blocks unchanged.
- Pattern: [thing] [action] [reason]. [next step].

---

## Target Environment (`www.wennink.eu` & `agrarix.it`)
- **Production Host (`agrarix.it`)**:
  - **IP**: `85.214.248.88` (`agrarix.it` / `www.wennink.eu` / `wennink.eu`)
  - **OS**: Ubuntu 16.04.7 LTS (Xenial Xerus), OpenVZ container (`4.4.0-1160.119.1.vz7.224.4`)
  - **Webserver**: Apache 2.4 (`/usr/sbin/apache2`), Let's Encrypt SSL (`/etc/letsencrypt/live/www.wennink.eu/`)
  - **VHost Configs**: `/etc/apache2/sites-available/wennink.conf` (HTTP -> HTTPS redirect) & `wennink-le-ssl.conf` (HTTPS)
  - **DocumentRoot**: `/var/www/vhosts/www.wennink.eu/html` (eigenaar `pjheise:wennink`)
    - `/var/www/vhosts/www.wennink.eu/html/index.html`: Huidige statische landingspagina op `https://www.wennink.eu/`
    - `/var/www/vhosts/www.wennink.eu/html/DEV260626/`: Familie Wennink Single Page Application (SPA, live onder `https://www.wennink.eu/DEV260626/`)
    - `/var/www/vhosts/www.wennink.eu/html_00/`: Eerdere backup/staging kopie (26-06-2026 17:44)
- **SSH Authentication & Routing**:
  - Werkstation / AGY verbindt ALTIJD eerst met **`automation@fabrix` (`192.168.178.40`)** via ED25519 SSH-sleutel (`antigravity@agrarix.net` / `maarten@techlab-automation`).
  - SSH-connecties naar **`agrarix.it`** verlopen ALTIJD via `automation@fabrix` op **poort `2223`**:
    `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -o BatchMode=yes -J automation@192.168.178.40 -p 2223 automation@ssh.agrarix.it "<cmd>"`
  - Rechtstreekse SSH-verbindingen naar interne Proxmox-nodes (`nuc6`, `nuc8`, `nuc5`) of `agrarix.it` zonder `fabrix` zijn niet toegestaan.
- **Gerelateerde Proxmox VE Omgeving**:
  - **Automation Control Node (`fabrix`)**: `192.168.178.40` (VM 100 op `nuc6`)
  - **Edge Reverse Proxy (`presentix`)**: `192.168.178.44` (VM 104 op `nuc8`, bevat ook externe VPS `agrarix.it` vhost-integratie)
  - **PHP/LEMP Backend (`verbix`)**: `192.168.178.46` (VM 106 op `nuc8`)
  - **Mail Gateway (`nuntix`)**: `192.168.178.25` (VM 102 op `nuc8`)

---

## 🏛️ Applicatie Architectuur (`html/DEV260626`)
- **Stack**: Vanilla ES6 JavaScript SPA zonder build-stap (`index.html`, `style.css`, `app.js`, `db.js`, `auth.js`, `tree.js`, `translations.js`).
- **Frontend Libraries (CDN)**:
  - **D3.js v7**: Interactieve SVG familiestamboom (`tree.js`).
  - **Mammoth.js v1.11.0**: Client-side `.docx` naar HTML conversie voor geschiedenisdocumenten.
  - **heic2any v0.0.4**: Client-side `.heic` naar JPEG fotoconversie.
- **Data-opslag**:
  - **Browser IndexedDB (`WenninkDB` v3)**: 5 object stores (`settings`, `members`, `reunions`, `tree`, `albums`).
  - **Database Export (`wennink_family_database_1782248268214.json`)**: 97,9 MB JSON-export met echte familiedata (40 leden, 39 stamboom-nodes, 4 reünies met 119 foto's, 3 albums met 62 foto's, 4 `.docx` geschiedenisdocumenten).
  - **Privacy & `.gitignore`**: De `wennink_family_database_*.json` bestanden (98 MB + AVG/PII persoonsgegevens) staan in `.gitignore` en blijven uitsluitend lokaal bewaard op `G:\Mijn Drive\AI-tomation\wennink-eu\html\DEV260626\`.
- **Backend / Mail Endpoint**:
  - **Apache/PHP**: `api/send-tfa.php` (raw socket SMTP mailer voor 2FA-, uitnodigings- en wachtwoord-resetmails).
  - **Node.js (optioneel/lokaal)**: `server.js` + `nodemailer` op poort `3000`.

---

## 📋 Communication & Progress Reporting Standards

1. **Step-by-Step Granular Progress**:
   - Always provide clear, step-by-step progress updates to the user (e.g. `[1/4] Analyse`, `[2/4] Configuratie`, etc.).
   - Ensure deployment scripts output clear step markers (`echo "==> [1/4] ..."`).
2. **Strict Sequential Execution (EÉN voor EÉN)**:
   - Always execute operations strictly one by one.
   - Never launch multiple background tasks or parallel steps simultaneously. Wait for the current step/task to finish completely before starting the next one.
   - Always include a step counter in progress updates (e.g. `[1/4] Bezig...`, `[2/4] Voltooid ✅`).
3. **Concise & Transparent Communication**:
   - Keep responses clear, professional, and well-structured.
   - Avoid background polling loops; report status upon completion.

---

## ⚡ Command Execution & Time Limit Procedure (2-3 Sec Target)

1. **Fast Non-Blocking SSH Execution**:
   - Simple shell commands must execute within 2 to 3 seconds.
   - Always include explicit non-blocking flags for SSH remote execution:
     `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -o BatchMode=yes ...`
2. **Avoid Stdin Redirection Hangs**:
   - Do not use interactive input prompts or un-flagged stdin piping.
3. **Immediate Background Task Cleanup**:
   - Never leave stale or duplicate background tasks running. Verify with `manage_task list` and terminate completed or stuck tasks immediately.

---

## 🛠️ Scripting & Git Workflow

- **Strikt Python (.py), Bash (.sh) en JS (.js) — GEEN PowerShell (.ps1)**:
  - Maak NOOIT `.ps1` (PowerShell) scriptbestanden aan in de repository of als tijdelijke scripts.
  - De lokale Windows shell dient uitsluitend voor Git transport (`git add`, `git commit`, `git push`) en non-blocking remote `ssh` aanroepen.
- **Git Repository**:
  - **Lokale Workspace**: `G:\Mijn Drive\AI-tomation\wennink-eu`
  - **GitHub Remote (`origin`)**: `https://github.com/agrarix/wennink-eu.git`
  - **Automation Mirror (`fabrix`)**: `automation@192.168.178.40:/home/automation/wennink-eu`

### ✅ Verplichte afsluitstap na ELKE wijziging (bestanden, scripts, docs)
Na elke wijziging in dit project — inclusief documentatie-updates — altijd afsluiten met:
```powershell
cd "g:\Mijn Drive\AI-tomation\wennink-eu"
git add -A
git commit -m "<korte omschrijving van de wijziging>"
git push origin main
git push fabrix main
```
- `git add -A` pakt alle gewijzigde én hernoemde bestanden mee (met inachtneming van `.gitignore`).
- `git push fabrix main` houdt de repository op automation (`192.168.178.40:/home/automation/wennink-eu`) synchroon.
