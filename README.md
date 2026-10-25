# www.wennink.eu — Reverse Engineering & Documentatie

Dit repository bevat de volledige lokale kopie, serverconfiguratie en technische reverse-engineering analyse van **`www.wennink.eu`** zoals gehost op **`agrarix.it`** (`85.214.248.88`).

---

## 1. Server- & Hostingomgeving (`agrarix.it`)

| Eigenschap | Waarde |
| :--- | :--- |
| **Domeinnaam** | `www.wennink.eu` / `wennink.eu` |
| **IP-adres** | `85.214.248.88` (`agrarix.it`) |
| **OS & Kernel** | Ubuntu 16.04.7 LTS (Xenial Xerus) — OpenVZ `4.4.0-1160.119.1.vz7.224.4` |
| **SSH Route** | Via `automation@fabrix` (`192.168.178.40`) $\rightarrow$ `ssh.agrarix.it` (poort `2223`, user `automation`) |
| **Webserver** | Apache 2.4 (`/usr/sbin/apache2`) — **geen** actieve Node.js / PM2 proces-daemon |
| **Apache Configs** | `/etc/apache2/sites-available/wennink.conf` (HTTP $\rightarrow$ HTTPS redirect)<br>`/etc/apache2/sites-available/wennink-le-ssl.conf` (HTTPS Let's Encrypt SSL) |
| **DocumentRoot** | `/var/www/vhosts/www.wennink.eu/html` |
| **Logbestand** | `/var/log/apache2/wennink.log` (zowel `ErrorLog` als `CustomLog combined`) |
| **Eigenaar op server** | `pjheise:wennink` |

---

## 2. Lokale Mappenstructuur (`G:\Mijn Drive\AI-tomation\wennink-eu`)

Alle relevante bestanden van `agrarix.it` zijn lokaal opgeslagen in deze workspace:

```text
wennink-eu/
├── AGENTS.md                                      # Projectrichtlijnen & Proxmox/SSH context
├── README.md                                      # Deze reverse-engineering documentatie
├── apache/                                        # Apache 2.4 VirtualHost configuraties van agrarix.it
│   ├── wennink.conf                               # Poort 80 vhost (permanente redirect naar HTTPS)
│   └── wennink-le-ssl.conf                        # Poort 443 vhost (Let's Encrypt SSL)
├── html/                                          # Volledige kopie van /var/www/vhosts/www.wennink.eu/html
│   ├── index.html                                 # Huidige landingspagina op https://www.wennink.eu/ (271 B)
│   ├── index.html_org                             # Backup van de originele landingspagina (identiek)
│   └── DEV260626/                                 # Familie Wennink Webapplicatie (SPA, 26-06-2026 17:53)
│       ├── index.html                             # Hoofd-HTML (7 tabs + 11 modals, 41 KB)
│       ├── style.css                              # Stylesheet met CSS Custom Properties / pastel thema (26 KB)
│       ├── app.js                                 # Centrale SPA-controller & UI-logica (100 KB)
│       ├── db.js                                  # IndexedDB ('WenninkDB' v3) laag + seed/import/export (19 KB)
│       ├── auth.js                                # Authenticatie, 2FA, brute-force lockout & wachtwoord-reset (5,5 KB)
│       ├── tree.js                                # D3.js v7 interactieve stamboom-renderer (9,2 KB)
│       ├── translations.js                        # Tweetalige i18n-matrix (NL / EN, 18,5 KB)
│       ├── server.js                              # Optionele Node.js server (lokaal/VPS, draait niet op agrarix.it)
│       ├── package.json                           # Node.js manifest (enige dependency: nodemailer ^9.0.1)
│       ├── package-lock.json                      # NPM lockfile
│       ├── technical_documentation.md             # Oorspronkelijke technische documentatie van de ontwikkelaar
│       ├── Wapen Familie Wennink.jpg              # Hoge-resolutie familiewapen (3,95 MB)
│       ├── Familie Wennink reunie 2026 JPG.jpg    # Hoge-resolutie groepsfoto reünie 2026 (5,61 MB)
│       ├── wennink_family_database_1782248268214.json # Volledige geëxporteerde familiedatabase (97,9 MB)
│       ├── api/
│       │   └── send-tfa.php                       # PHP raw-socket SMTP mailer voor Apache shared hosting (3,8 KB)
│       └── node_modules/
│           └── nodemailer/                        # Geïnstalleerde Nodemailer module voor server.js
└── html_00/                                       # Afwijkende bestanden uit /var/www/vhosts/www.wennink.eu/html_00
    ├── server.js                                  # 9 min oudere versie (hardcoded PORT = 3000)
    └── technical_documentation.md                 # 9 min oudere versie (zonder Option A PHP/FTP sectie)
```

> **Toelichting op `html_00/` op de server**:
> Op `agrarix.it` staat naast `html/DEV260626` ook een map `/var/www/vhosts/www.wennink.eu/html_00` van `26-06-2026 17:44` (9 minuten ouder dan `DEV260626`). Uit een MD5- en diff-vergelijking blijkt dat de 97,9 MB JSON-database (`md5: 7921d238c9106f9885f9b1851290686c`) en alle frontend-bestanden 100% identiek zijn; alleen `api/send-tfa.php` en de PHP-deploymentdocumentatie zijn in `DEV260626` (`17:53`) toegevoegd.

---

## 3. Functionele & Technische Architectuur

### 3.1. Wat staat er live op `https://www.wennink.eu/`?
1. **Root (`https://www.wennink.eu/`)**:
   Serveert [html/index.html](file:///g:/Mijn%20Drive/AI-tomation/wennink-eu/html/index.html) — een klassieke placeholder van 271 bytes:
   > *"De naamgroep Wenning/Wennink is oud en gaat terug tot middeleeuwse erven in Twente. (c) Maarten de Boer"*
2. **Submap (`https://www.wennink.eu/DEV260626/`)**:
   Serveert de nieuwe **Familie Wennink** webapplicatie (gebouwd door Paul Heise, juni 2026).

### 3.2. Frontend Stack ([html/DEV260626/](file:///g:/Mijn%20Drive/AI-tomation/wennink-eu/html/DEV260626/index.html))
De applicatie is een **Single Page Application (SPA)** geschreven in standaard ES6 JavaScript-modules zonder bundler/build-stap:
- **7 Navigatie-tabs**:
  1. `Home` (`#tab-home`): Geschiedenis-samenvatting, familiefoto, datum/locatie laatste en volgende reünie, knop *Gebruiksaanwijzing*.
  2. `Reünies` (`#tab-reunions`): Chronologische tijdlijn van familiereünies met per reünie een fotogalerij, lightbox, multiselect-download en foto-upload (met automatische client-side canvas-compressie en `.heic` $\rightarrow$ `.jpg` conversie via `heic2any`).
  3. `Albums` (`#tab-albums`): Losse fotoalbums met coverfoto, upload en bulk-download.
  4. `Familieleden` (`#tab-members`): Alfabetische ledenlijst met zoekbalk, NAW-/contactformulier en Admin-uitnodigingsknop (*Uitnodigen*).
  5. `Stamboom` (`#tab-tree`): Interactieve SVG-stamboom op basis van **D3.js v7** ([tree.js](file:///g:/Mijn%20Drive/AI-tomation/wennink-eu/html/DEV260626/tree.js)) met zoom/pan, automatische koppeling van bloedlijnen (`parentId`) en aangetrouwde partners (`partnerId` / `isPartner`), en een detailpaneel rechts.
  6. `Geschiedenis` (`#tab-historyDoc`): Documentviewer met automatische inhoudsopgave (TOC) voor geüploade `.docx` (via **Mammoth.js**) en `.pdf` bestanden.
  7. `Admin` (`#tab-admin`, alleen zichtbaar voor rol `admin`): Aanpassen van homepage-teksten, kleuren/lettertypes, SMTP-instellingen, familiewapen/homepage-foto en **Database Export/Import (`.json`)**.
- **Tweetalig (NL/EN)** via [translations.js](file:///g:/Mijn%20Drive/AI-tomation/wennink-eu/html/DEV260626/translations.js) en lettergrootte-schakelaar (`A-` / `A+`).

### 3.3. Opslagarchitectuur: Browser IndexedDB (`WenninkDB` v3)
De applicatie gebruikt **géén server-side database** (zoals MySQL/PostgreSQL/SQLite). Alle data leeft in de **IndexedDB** van de individuele browser ([db.js](file:///g:/Mijn%20Drive/AI-tomation/wennink-eu/html/DEV260626/db.js)) verdeeld over 5 object stores:
1. `settings` (key-value store voor thema, teksten, SMTP, Base64 familiewapen, Base64 groepsfoto en geüploade geschiedenisdocumenten)
2. `members` (`keyPath: 'id'`, autoIncrement)
3. `reunions` (`keyPath: 'id'`, autoIncrement)
4. `tree` (`keyPath: 'id'`, autoIncrement)
5. `albums` (`keyPath: 'id'`, autoIncrement)

---

## 4. Analyse van de 97,9 MB Familie Database Export

In [html/DEV260626/wennink_family_database_1782248268214.json](file:///g:/Mijn%20Drive/AI-tomation/wennink-eu/html/DEV260626/wennink_family_database_1782248268214.json) (`97.902.926` bytes, laatst bijgewerkt op `23-06-2026 22:46`) staat de daadwerkelijke productie-dataset van de familie Wennink:

| Onderdeel | Omvang | Inhoud |
| :--- | :--- | :--- |
| **`settings`** | **51,05 MB** | • `familyCrest`: 12,87 MB Base64 PNG<br>• `familyPhoto`: 7,48 MB Base64 JPEG<br>• `historyDocHtml`: 6,93 MB HTML (*The Family Wennink*, 22-06-2025)<br>• `historyDocuments`: 26,25 MB JSON-string met 4 `.docx` documenten:<br>  1. `Wennink Geschiedenis.docx` (`legacy-history`)<br>  2. `1.1 The Family Wennink in Pictures.docx`<br>  3. `1.2 The Family Wennink.docx`<br>  4. `2.2 From Charlemagne to Liesbeth Wennink.docx`<br>• Laatste reünie: `07-06-2026` (`Beesd, Nederland`)<br>• Volgende reünie: `2029` (`Nederland`)<br>• SMTP-configuratie: leeg (`smtpHost: ""`, `smtpPort: "587"`, `smtpSecure: true`) |
| **`reunions`** | **30,81 MB** | **4 reünies** met in totaal **119 Base64-foto's**:<br>• ID 1 (`01-01-1980` — *Oude foto's familie Wennink*): 0 foto's<br>• ID 2 (`27-06-1998` — *Kasteel Heeswijk, Nederland*): 1 foto<br>• ID 3 (`07-06-2026` — *Mariënwaerdt, Nederland*): 86 foto's<br>• ID 4 (`06-06-2015` — *Utrecht*): 32 foto's |
| **`albums`** | **11,47 MB** | **3 fotoalbums** met in totaal **62 Base64-foto's**:<br>• ID 2 (*Wennink Historie*): 54 foto's<br>• ID 3 (*Algemeen*): 3 foto's<br>• ID 4 (*Paul&Yolande en kinderen*): 5 foto's |
| **`members`** | **0,01 MB** | **40 familieleden** (volledige naam, adres, postcode, woonplaats, land, e-mail, telefoon, geboorte-/sterftejaar) |
| **`tree`** | **< 0,01 MB** | **39 stamboom-nodes** (gekoppeld aan `members` met `parentId` en `partnerId`) |

---

## 5. Geïdentificeerde Architectuur- & Beveiligingsbevindingen

Uit de reverse engineering komen **5 belangrijke bevindingen** naar voren:

### 1. Nieuwe bezoekers zien nep-data (Seed Data) i.p.v. de echte familiedata
Omdat `IndexedDB` lokaal in de browser van de bezoeker draait en [db.js](file:///g:/Mijn%20Drive/AI-tomation/wennink-eu/html/DEV260626/db.js) niet automatisch de JSON-database vanaf de server ophaalt, krijgt elke nieuwe bezoeker bij het eerste bezoek de hardcoded dummy-data uit `seedDatabase()` te zien (10 fictieve personen zoals *Jan Wennink*, *Maria de Vries* en *Sarah Smith* op *12 Baker Street*). Pas wanneer iemand handmatig als Admin inlogt en het 97,9 MB `.json`-bestand importeert, wordt de echte data in die specifieke browser zichtbaar. Wijzigingen die een Admin doet, blijven bovendien lokaal in diens eigen browser totdat de database opnieuw geëxporteerd en op de server gezet wordt.

### 2. Publiek toegankelijk JSON-bestand met persoonsgegevens (AVG / Privacy)
Het bestand `https://www.wennink.eu/DEV260626/wennink_family_database_1782248268214.json` staat onbeschermd in de publieke webroot en bevat de volledige NAW-gegevens, telefoonnummers, e-mailadressen en geboortedata van 40 familieleden.

### 3. Client-side Authenticatie & Hardcoded Credentials
In [auth.js](file:///g:/Mijn%20Drive/AI-tomation/wennink-eu/html/DEV260626/auth.js) en [index.html](file:///g:/Mijn%20Drive/AI-tomation/wennink-eu/html/DEV260626/index.html) gebeurt alle authenticatie volledig client-side:
- Het inlogformulier in `index.html` heeft standaard `value="user@wennink.nl"` en `value="user123"` vooringevuld.
- In `auth.js` staan de standaard inloggegevens hardcoded in de broncode:
  - **Admin**: `pjheise@gmail.com` / `admin123`
  - **User**: `user@wennink.nl` / `user123`
- De brute-force blokkade (`failedAttemptsMap`, max 3 pogingen) staat in een JavaScript-variabele in het geheugen en wordt gewist bij het herladen van de pagina (`F5`).

### 4. Ontbrekende `.htaccess` en foutief relatief pad voor `/api/send-tfa`
- [app.js](file:///g:/Mijn%20Drive/AI-tomation/wennink-eu/html/DEV260626/app.js) roept `fetch('/api/send-tfa', ...)` aan met een leidende slash (`/`). Wanneer de site onder `/DEV260626/` draait, zoekt de browser op `https://www.wennink.eu/api/send-tfa` i.p.v. `/DEV260626/api/send-tfa.php`.
- Daarnaast ontbreekt het `.htaccess`-bestand dat `/api/send-tfa` herschrijft naar `api/send-tfa.php`.
- Omdat in de database ook geen `smtpHost` is ingevuld, vangt de frontend de fout op door de 5-cijferige 2FA-code én wachtwoord-resetlinks direct bovenin het scherm te tonen in `#tfaSimulationBanner` / `#linkSimulationBanner`.

### 5. Verouderd OS op `agrarix.it`
`agrarix.it` draait op **Ubuntu 16.04.7 LTS (Xenial)** met een OpenVZ 4.4 kernel (End-of-Life sinds april 2021). Voor verdere doorontwikkeling of migratie naar de eigen Proxmox-omgeving (`presentix` / `verbix`) is dit goed om mee te nemen.

---

## 6. Lokaal Starten (Ontwikkelomgeving)

Je kunt de applicatie direct lokaal draaien vanuit `html/DEV260626`:

```bash
cd "html/DEV260626"
node server.js
```
Open vervolgens `http://localhost:3000` in de browser.
Om de echte familiedata te laden:
1. Log in als Admin (`pjheise@gmail.com` / `admin123`) en voer de 5-cijferige TFA-code in die bovenaan in de groene/rode banner verschijnt.
2. Ga naar het tabblad **Admin** $\rightarrow$ **Importeer Database**.
3. Selecteer `wennink_family_database_1782248268214.json`.
