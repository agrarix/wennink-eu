# AGENTS.md - Proxmox VE Project Guidelines & Workflow

This file contains rules, guidelines, and context for AI agents working on this Proxmox VE repository.

## Response instructions
Please respond like smart caveman. Cut all filler, keep technical substance.
- Drop articles (a, an, the), filler (just, really, basically, actually).
- Drop pleasantries (sure, certainly, happy to).
- No hedging. Fragments fine. Short synonyms.
- Technical terms stay exact. Code blocks unchanged.
- Pattern: [thing] [action] [reason]. [next step].

---

## Target Environment
- **Proxmox VE Cluster**: `pve` (3 fysieke nodes: `nuc6`, `nuc8`, `nuc5`)
  - **Node 1 (`nuc6`)**: `192.168.178.6` (Intel NUC6CAYH, 16 GB RAM, 500 GB SSD, PVE 9.2.0 / pve-manager 9.2.11, Linux 7.0.14-12-pve, Debian 13 Trixie)
  - **Node 2 (`nuc8`)**: `192.168.178.8` (Intel NUC8i3BEH, 32 GB RAM, 512 GB NVMe + 250 GB SSD, PVE 9.2.0 / pve-manager 9.2.2, Linux 7.0.2-6-pve, Debian 13 Trixie)
  - **Node 3 (`nuc5`)**: `192.168.178.5` (Intel NUC5, Core i3-5010U @ 2.10GHz, 16 GB RAM, 120 GB SSD, PVE 9.2.0 / pve-manager 9.2.2, Linux 7.0.2-6-pve, Debian 13 Trixie)
- **SSH Authentication**:
  - Werkstation / AGY verbindt ALTIJD eerst met **`automation@fabrix` (`192.168.178.40`)** via ED25519 SSH-sleutel (`antigravity@agrarix.net` / `maarten@techlab-automation`).
  - SSH-connecties naar de PVE-nodes (`nuc6`, `nuc8`, `nuc5`) verlopen **ALTIJD** via `automation@fabrix` (ProxyJump `ssh -J automation@192.168.178.40 ...` of genest vanuit `fabrix`), met `sudo` voor root-uitvoering (`ssh automation@192.168.178.X "sudo <cmd>"`).
  - Rechtstreekse SSH-verbindingen vanaf het werkstation naar de NUC PVE-nodes zijn **niet toegestaan**; ALTIJD routeren via `automation@fabrix`.
- **PVE Host Prerequisite**: `sudo` package installed (`apt-get install -y sudo`) + passwordless sudo configured (`/etc/sudoers.d/automation`). Provisioned via `scripts/pve-user-automation-create.sh`.
- **Default Storage**:
  - `local`: ISOs, LXC Templates, Backups (`/var/lib/vz`)
  - `local-lvm`: Thin pool for LVM-thin VM disks & LXC rootfs volumes
- **NAS Storage**: `192.168.178.10` (QNAP)
  - `/DATA` -> `/mnt/nas/DATA` (NFS RW on `fabrix`)
  - `/Web` -> `/mnt/nas/WWW` (NFS RW on `fabrix`, NFS RO on `presentix`)
- **Intel e1000e NIC Tuning**: `nuc8` uses Intel I219-V NIC. Requires TSO/GSO/GRO & EEE disabled (`scripts/pve-host-nic-fix.sh` / `/etc/network/interfaces`) to prevent DMA hangs and HA fencing.
- **Physical Standalone Nodes**:
  - `reservix` (`192.168.178.7`): Raspberry Pi bare-metal, OpenVPN server on TCP 1194 / WAN 49110 (Solarix CA, gemigreerd vanaf solarix `.20`).

---

## 📋 Communication & Progress Reporting Standards

1. **Step-by-Step Granular Progress**:
   - Always provide clear, step-by-step progress updates to the user (e.g. `[1/6] Download`, `[2/6] VM creation`, etc.).
   - Ensure deployment scripts output clear step markers (`echo "==> [1/6] ..."`), allowing the user to follow execution in real-time.
2. **Strict Sequential Execution (EÉN voor EÉN)**:
   - Always execute operations strictly one by one.
   - Never launch multiple background tasks or parallel steps simultaneously. Wait for the current step/task to finish completely before starting the next one.
   - Always include a step counter in progress updates (e.g. `[1/5] Bezig...`, `[2/5] Voltooid ✅`).
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
   - Run remote scripts via direct HTTP/cURL invocation or pre-staged executable scripts on target node via automation control node (`automation@192.168.178.40`). SSH-verbindingen naar de PVE-nodes lopen ALTIJD via `automation@fabrix`.
3. **Immediate Background Task Cleanup**:
   - Never leave stale or duplicate background tasks running. Verify with `manage_task list` and terminate completed or stuck tasks immediately.

---

## 🛠️ Deployment Standards & Best Practices

### Shell & Scripting
- **Strikt Python (.py) en Bash (.sh) — GEEN PowerShell (.ps1)**:
  - Gebruik ALTIJD Python 3 (`.py`) of Bash (`.sh`) voor alle scripts, data-manipulatie, automatisering en tooling.
  - Maak NOOIT `.ps1` (PowerShell) scriptbestanden aan in de repository of als tijdelijke scripts.
  - Script-uitvoering vindt ALTIJD plaats op de Linux automation node (`fabrix` `192.168.178.40`) of doelnodes waar Python 3 en Bash standaard beschikbaar zijn.
  - De lokale Windows shell dient uitsluitend voor Git transport (`git add`, `git commit`, `git push`) en non-blocking remote `ssh` aanroepen.
- **PowerShell limitation**: The local shell is PowerShell (Windows). Bash stdin redirection (`bash -s < script.sh`) does NOT work in PowerShell. Use `Get-Content script.sh | ssh automation@192.168.178.40 'bash -s'` or direct cURL execution.
- **Git-First Transport Workflow**:
  - Transport: **PC → git push → automation `git pull`**. Never use direct SCP to deploy files.
  - After every file change: `git add`, `git commit`, `git push origin main`, then SSH `cd ~/proxmox-pve && git pull origin main` on automation (`fabrix` `192.168.178.40`).
  - Test and validate script execution on the automation server after the git pull.
- **Remote execution**: Always run deployment scripts directly on the automation node (`fabrix` `192.168.178.40`) or via `automation@fabrix` to PVE hosts via SSH. Never run directly from PC to PVE nodes, and never via QEMU guest exec for long-running apt operations (timeouts).

### DietPi Virtual Machines & Workloads
1. **VM vs LXC for DietPi**: DietPi officially distributes pre-configured QCOW2 images for Proxmox VE (x86_64 Bookworm). VM deployment is preferred for DietPi because of full kernel compatibility, systemd support, and automated `dietpi-firstboot` initialization.
2. **OpenSSH Server**: All DietPi VMs use **OpenSSH Server** (`openssh-server`). Dropbear (DietPi default) must always be disabled and replaced during provisioning.
3. **Proxmox QEMU Guest Agent**:
   - Always enable `--agent enabled=1` during VM creation.
   - Pre-install and enable `qemu-guest-agent` so that the assigned IP address is immediately visible in the Proxmox VE Web UI (**VM -> Summary**).
4. **KVM VirtIO Memory Ballooning**:
   - Every VM MUST have dynamic memory ballooning configured (`--balloon <min_MB>`).
   - Never disable ballooning (never set `balloon: 0` without documented architectural reason).
   - Linux/DietPi VMs utilize built-in kernel `virtio_balloon`. Windows 11 uses `balloon.sys` + `BalloonService` (`BLNSVR`).
5. **User & SSH Key Provisioning**:
   - Every new VM/CT MUST have users `automation` and `maarten` provisioned with passwordless `sudo` rights (`NOPASSWD: ALL`).
   - Automatically inject authorized SSH keys into `root`, `automation`, and `maarten` accounts.
6. **Current Deployed Workloads**:
   - **Automation Node (`fabrix`)**: ID `100`, 2 CPU Cores, 6144 MB RAM (min 2048 MB), 18 GB disk on `local-lvm`, Static IP `192.168.178.40` on `nuc6`.
   - **Access Server (`portix`)**: ID `101`, 2 CPU Cores, 1024 MB RAM (min 512 MB), 20 GB disk on `QNAP-PVE` (NFS HA), Static IP `192.168.178.22` on `nuc8` (OpenVPN Server on TCP 1194 / WAN 49112 + client generator).
   - **Mail Gateway (`nuntix`)**: ID `102`, 2 CPU Cores, 1024 MB RAM (min 512 MB), 22 GB disk on `QNAP-PVE` (NFS HA), Static IP `192.168.178.25` on `nuc8`.
   - **Windows 11 Desktop (`win11pro`)**: ID `103`, 4 CPU Cores, 8192 MB RAM (min 4096 MB), 72 GB disk on `local-lvm`, DHCP IP `192.168.178.99` on `nuc6`.
   - **Nginx Webserver (`presentix`)**: ID `104`, 4 CPU Cores, 6144 MB RAM (min 2048 MB), 24 GB disk on `QNAP-PVE` (NFS HA), Static IP `192.168.178.44` on `nuc8` (Dynamic Multi-Domain hosting under `/mnt/nas/WWW/domains/$host/pages` + Edge Reverse Proxy for `www.mariskawennink.nl`, `mariskawennink.nl`, `balcony.agrarix.net`, `qnap.agrarix.net`, `pve.agrarix.net`, `kasm.agrarix.net`, `graf.agrarix.net`, `proxmox.agrarix.net`, `maartendeboer.agrarix.net`, redirects `huis.agrarix.net`, `tuin.agrarix.net` en `showcase.agrarix.net` + Let's Encrypt SSL + Multi-Domain Dashboard op `/domains/` met bezoekersstatistieken, 2-staps log-archivering naar NAS en externe VPS `agrarix.it` vhost integratie).
   - **Home Assistant (`domotix`)**: ID `105`, 2 CPU Cores, 6144 MB RAM (min 3072 MB), 26 GB disk on `QNAP-PVE` (NFS HA), Static IP `192.168.178.29` on `nuc8` (DietPi VM with Docker HA).
   - **PHP Webapps & WordPress (`verbix`)**: ID `106`, 2 CPU Cores, 8192 MB RAM (min 2048 MB), 24 GB disk on `QNAP-PVE` (NFS HA), Static IP `192.168.178.46` on `nuc8` (DietPi LEMP WordPress + WP-CLI + DokuWiki backend `wiki.maartendeboer.nl` op PHP 8.4-FPM + vhosts onder `/var/www/vhosts/` (`www.mariskawennink.nl`, `www.pa4mdb.nl`)).
   - **Kasm Workspaces (`kasmix`)**: ID `107`, 4 CPU Cores, 8192 MB RAM (min 4096 MB), 32 GB disk on `QNAP-PVE` (NFS HA), Static IP `192.168.178.45` on `nuc5`.
   - **Solar Node (`solarix`)**: ID `108`, 2 CPU Cores, 2048 MB RAM (min 1024 MB), 16 GB disk on `QNAP-PVE`, Static IP `192.168.178.20` on `nuc5` (DietPi VM with SMA SunnyBEAM USB passthrough + HP Deskjet 3050A USB passthrough for CUPS print server & SANE/scanservjs web-scanner + Postfix satellite relaying via `nuntix` `192.168.178.25` + Nginx webserver).
   - **Metrics & Performance (`grafix`)**: ID `109`, 2 CPU Cores, 4096 MB RAM (min 2048 MB), 24 GB disk on `QNAP-PVE` (NFS HA), Static IP `192.168.178.47` on `nuc8` (DietPi VM with Graphite Carbon port 2003, Whisper, Graphite Web port 8080, Grafana OSS port 3000, public reverse proxy https://graf.agrarix.net + PVE Cluster Metric Server koppeling).
   - **Syslog & Log Analytics (`registrix`)**: ID `110`, 4 CPU Cores, 6144 MB RAM (min 3072 MB), 32 GB disk on `QNAP-PVE` (NFS HA), Static IP `192.168.178.48` on `nuc8` (DietPi VM with Rsyslog server on UDP/TCP port 514, per-host remote logging, Grafana Loki port 3100 + Promtail collector, daily logrotate with 14-day retention, NFS mount to QNAP `/DATA` under `/mnt/nas/DATA`, dedicated dashboard op https://graf.agrarix.net/d/pve-cluster-syslog/proxmox-cluster-syslog, voorbereid voor ELK/OpenSearch).
   - **AI & PyCharm Server (`engenix`)**: ID `111`, 4 CPU Cores, 8192 MB RAM (min 4096 MB), 40 GB disk on `QNAP-PVE` (NFS HA), Static IP `192.168.178.49` on `nuc8` (DietPi VM with XFCE4 desktop, XRDP port 3389, JetBrains PyCharm Community Edition, Python 3 AI venv `/opt/ai-env`, Kasm Workspaces RDP koppeling).
7. **Monitor Standaard & Architectuur (`/pve/` & `/qnap/`)**:
   - **Gedeelde Header CSS (`etc/monitor-shared.css`)**:
     - Vaste binnencontainer `.monitor-topbar-inner` en `.monitor-subbar-inner` op `max-width: 1280px; margin: 0 auto; padding: 8px 20px;`.
     - Sticky positionering (`.monitor-sticky-header` met `position: sticky; top: 0; z-index: 500;`).
     - Menu dropdown links, Themakiezer (`Dark` / `White`) + witte `↻ Refresh` knop rechts.
     - Thema-persistentie via centrale `localStorage` key `monitor_theme`.
     - Subbars hebben een scherpe rand (`border-top: 2px solid #000; border-bottom: 2px solid #000;`) en merkkleuren: PVE amber `#ffc000`, QNAP blauw gradient.
     - Scheidingstekens in statusregels & metadata: Gebruik altijd pipe (` | `) als scheidingsteken (géén bullets/punten `•` of `&bull;`).
     - **Standaard Footer Formaat**: `<ENV>:<actie> | v<yy><mm><dd>-<HH><MM><SS>` (bijv. `ProxmoxVE:status | v261019-125034`), waarbij het versienummer automatisch gegenereerd wordt op basis van de `mtime` van het script.
     - **Strikte CSS `@import` Regel**: In `pve-cluster-status.css` en `qnap-status.css` MOET `@import 'status-shared.css';` altijd strikt op regel 1 (vóór álle stijlen en `:root`) staan conform de CSS-specificatie, anders wordt de import door de browser genegeerd en verdwijnen de bovenbalken.
   - **PVE Status (`system-status/pve-status/`)**:
     - Titel: `ProxmoxVE status` met Proxmox X-icon (`/pve/favicon.ico`).
     - Favicon: `/var/www/html/pve/favicon.ico` (gesynchroniseerd vanuit `system-status/pve-status/favicon.ico`).
     - Node headers tonen: `Model: <model> | CPU: <cpu>` (boven Uptime), `Uptime: <tijd> | Power: <W> W` (Intel RAPL) en `Cores (CPU %) | RAM (gebruikt/totaal met %)`, optioneel voorafgegaan door node management IP (`show_node_ip = yes | no`). Model en CPU worden automatisch gedetecteerd via DMI en `/proc/cpuinfo` (overridable via `[nodes]` in config).
     - VM/CT cellen tonen statusdot, VMID, naam, vCPU & CPU %, RAM (GB & %), Disk met locatie `(NAS)`/`(Local)`/`(USB)` en HA-status (IP-adres in detailtabel onderaan).
     - Mobiel (`<= 820px`): Automatisch gestapelde node-cards met 4-koloms VM-tabel zonder horizontale scroll.
     - Detailtabel "Virtuele Machines & HA Placement" onderaan met sticky VMID-kolom.
     - Klassieke status blijft ongewijzigd bereikbaar op `/pve/old/`.
   - **QNAP Status (`qnap-status/qnap-status.py` in repo [`system-status`](https://github.com/agrarix/system-status))**:
     - Webroot: `/var/www/html/qnap/` on `fabrix` (`192.168.178.40`).
     - Python script: `qnap-status/qnap-status.py` (gesymlinkt als `/home/automation/bin/qnap-status.py`).
     - CSS styling: strikt gescheiden in `qnap-status.css` met `@import 'status-shared.css';` op regel 1.
     - Kleurconventies: `<60%` groen, `60-80%` geel, `80-90%` oranje, `>90%` rood.
8. **Showcase Standaard & Architectuur (`/showcase/` -> `https://proxmox.agrarix.net`)**:
   - Webroot: `/var/www/html/showcase` on `fabrix` (`192.168.178.40`), gesymlinkt naar `docs/showcase`.
   - Focus: Zuivere configuratie & hardware/workload-architectuur (geen live CPU/uptime monitoring, dat hoort op `/pve/`).
   - Dagelijkse synchronisatie: Via symlink `docs/showcase/status.json` -> `/var/www/html/pve/status.json` en handmatige `↻ Refresh` knop.
   - Tweetalig (i18n): Nederlands [NL] en Engels [EN] met inline SVG-vlaggen en Dark/Light mode via `localStorage`.
   - Gallische identiteit: Verklaring "-ix" (Asterix & Obelix / Linux) en Agrarix (De Boer uit Gallië). Gallisch helm-icoon als favicon (`favicon.ico`), sitelogo (`gallic-helmet.svg` / `.png`).
   - RAM berekening: Fysieke DIMM mapping (32/16/16 GB, totaal 64 GB) gecorrigeerd voor iGPU VRAM.
   - Hardware-notatie op NUC cards:
     - RAM: `<capaciteit>GB <DDR-type>` (bijv. `32GB DDR4`, `16GB DDR3L`), zonder toevoeging "Werkgeheugen" of "Memory".
     - Opslag: `<capaciteit>GB <type> + QNAP-NAS` (bijv. `512GB NVMe + 250GB SATA SSD + QNAP-NAS`), `GB` aaneen, NFS-storage verkort tot `QNAP-NAS`.
     - LVM-Thin: niet separaat benoemen op cards (alle 3 nodes hebben `local-lvm` thin pool).
9. **Standaard Webserver & VHost Architectuur**:
   - **Verplichte Standaard**: ELKE (web)server VM/CT in deze Proxmox-omgeving MOET ALTIJD volgens deze standaard worden ingericht (via `ansible/playbook_standard_webserver.yml` of post-provisioning). Geen uitzonderingen behalve expliciet gedocumenteerde portaal-/applicatieroutes (`fabrix`, `verbix`).
   - **Default Document Roots**:
     - DEFAULT: `/var/www/html/index.html` bevat `<H1>Default:<hostname></H1>` (behalve `verbix`).
     - fritz.box vhost: `/var/www/vhosts/<hostname>.fritz.box/html/index.html` bevat `<H1><hostname></H1>`.
     - IP vhost: `/var/www/vhosts/<IP>/html/index.html` bevat `<H1><IP></H1>`.
     - FQDN vhost: `/var/www/vhosts/<hostname>.agrarix.net/html/index.html` bevat `<H1><hostname></H1>`.
     - **FABRIX Uitzondering**: `fabrix.fritz.box` en `192.168.178.40` serveren de centrale FABRIX netwerkportal vanuit `/var/www/portal/index.html`.
   - **Ongerouteerde `*.agrarix.net` Fallback**:
     - Vhost: `server_name *.agrarix.net agrarix.net;` in `vhost-wildcard-agrarix.net.conf`.
     - Root: `/var/www/vhosts/default.agrarix.net/html` (symlink `/var/www/vhosts/agrarix.net`).
     - Content: Responsieve HTML met gecentreerde Agrarix Tux mascotte (`agrarix.jpg`).
     - Edge proxy `presentix` luistert op poort 80 én 443 (SSL via Let's Encrypt).
     - Exacte vhosts (`pve`, `qnap`, `showcase`, `graf`, etc.) hebben altijd prioriteit boven de wildcard.
   - **Uitrol & Verificatie**: `ansible/playbook_standard_webserver.yml` en `scripts/deploy-standard-webservers.sh`.
10. **Credentials**:
   - **`automation` & `maarten`** users: Passwordless `sudo` (`NOPASSWD: ALL`), SSH key injected
   - **`root`** (DietPi default): `dietpi`

---

## 📁 Git & Documentation Guidelines
- Maintain a comprehensive `README.md` documenting all deployed workloads, scripts, and Proxmox configurations.
- Stage and test on `automation` server FIRST, then commit and push changes to official Git repository: `https://github.com/agrarix/proxmox-env`.

### ✅ Verplichte afsluitstap na ELKE wijziging (bestanden, scripts, docs)
Na elke wijziging in dit project — inclusief documentatie-updates — altijd afsluiten met:
```powershell
cd "g:\Mijn Drive\AI-tomation\Proxmox-env"
git add -A
git commit -m "<korte omschrijving van de wijziging>"
git push origin main
git push fabrix main
```
- `git add -A` pakt alle gewijzigde én hernoemde bestanden mee.
- `git push fabrix main` update automatisch de working tree op automation (`192.168.178.40`).
