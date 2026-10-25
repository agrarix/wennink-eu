// db.js - IndexedDB storage and database management

const DB_NAME = 'WenninkFamilyDB';
const DB_VERSION = 3;

let dbInstance = null;

// Default Family Crest SVG (represented as base64 or inline string)
const DEFAULT_CREST_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120" width="100" height="120">
  <path d="M 50 10 C 20 10 15 50 15 70 C 15 100 50 115 50 115 C 50 115 85 100 85 70 C 85 50 80 10 50 10 Z" fill="#6C8EBF" stroke="#3A5F8F" stroke-width="3"/>
  <path d="M 50 15 C 25 15 20 52 20 70 C 20 95 50 108 50 108 C 50 108 80 95 80 70 C 80 52 75 15 50 15 Z" fill="#E6F0FA" stroke="#3A5F8F" stroke-width="1"/>
  <!-- Shield elements: stylized family tree -->
  <path d="M 50 90 L 50 50 M 50 70 L 35 55 M 50 65 L 65 50 M 50 58 L 40 45 M 50 52 L 60 38" stroke="#3A5F8F" stroke-width="4" stroke-linecap="round"/>
  <!-- Crest Crown -->
  <rect x="35" y="5" width="30" height="8" rx="2" fill="#D6E4F0" stroke="#3A5F8F" stroke-width="2"/>
  <circle cx="38" cy="3" r="2" fill="#3A5F8F"/>
  <circle cx="50" cy="3" r="2" fill="#3A5F8F"/>
  <circle cx="62" cy="3" r="2" fill="#3A5F8F"/>
</svg>`;

// Default Mock Reunion Photos (Base64 placeholder designs)
const PHOTO_1 = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="100%" height="100%" fill="%23D6E4F0"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="24" fill="%233A5F8F">Wennink Reunion 2022 - Utrecht</text></svg>';
const PHOTO_2 = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="100%" height="100%" fill="%23E6F0FA"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="24" fill="%233A5F8F">Wennink Family Photo 2024</text></svg>';

export function initDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('Database error:', event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const oldVersion = event.oldVersion;

      // 1. Settings store: key-value storage for config parameters
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings');
      }

      // 2. Members store: stores family members details
      if (!db.objectStoreNames.contains('members')) {
        db.createObjectStore('members', { keyPath: 'id', autoIncrement: true });
      }

      // 3. Reunions store: stores reunions data and photos
      if (!db.objectStoreNames.contains('reunions')) {
        db.createObjectStore('reunions', { keyPath: 'id', autoIncrement: true });
      }

      // 4. Tree store: stores hierarchical family tree nodes
      if (!db.objectStoreNames.contains('tree')) {
        db.createObjectStore('tree', { keyPath: 'id', autoIncrement: true });
      }

      // 5. Albums store: stores custom photo albums
      if (!db.objectStoreNames.contains('albums')) {
        db.createObjectStore('albums', { keyPath: 'id', autoIncrement: true });
      }

      // Pre-seed tables inside the transaction if fresh install
      if (oldVersion === 0) {
        const transaction = event.target.transaction;
        seedDatabase(transaction);
      }
    };
  });
}

function seedDatabase(transaction) {
  console.log('Seeding database with default Wennink Family data...');

  const settingsStore = transaction.objectStore('settings');
  const membersStore = transaction.objectStore('members');
  const reunionsStore = transaction.objectStore('reunions');
  const treeStore = transaction.objectStore('tree');

  // Seed settings
  settingsStore.put('#B2C9E4', 'primaryColor'); // Pastel light blue
  settingsStore.put('#E8F1FC', 'secondaryColor'); // Extremely light blue for contentbg
  settingsStore.put('#7597C3', 'headerColor'); // Darker pastel blue for header
  settingsStore.put('#2B3A4F', 'textColor'); // Deep navy for readability
  settingsStore.put('Aptos, sans-serif', 'bodyFont');
  settingsStore.put('Playfair Display, serif', 'headerFont');
  settingsStore.put('16px', 'bodyFontSize');
  settingsStore.put(DEFAULT_CREST_SVG, 'familyCrest');
  
  settingsStore.put('18-05-2024', 'lastReunionDate');
  settingsStore.put('Utrecht, Nederland', 'lastReunionPlace');
  settingsStore.put('27-06-2026', 'nextReunionDate');
  settingsStore.put('Apeldoorn, Nederland', 'nextReunionPlace');
  settingsStore.put('21-06-2026 22:00', 'lastUpdated');

  // Seed default SMTP settings
  settingsStore.put('', 'smtpHost');
  settingsStore.put('587', 'smtpPort');
  settingsStore.put('false', 'smtpSecure');
  settingsStore.put('', 'smtpUser');
  settingsStore.put('', 'smtpPass');
  settingsStore.put('', 'smtpFrom');

  settingsStore.put(PHOTO_2, 'familyPhoto');

  // Seed default bilingual user guides and history
  settingsStore.put('Welkom op de website van de familie Wennink!\n\n- Stamboom: Bekijk de interactieve stamboom van de familie. Als beheerder kunt u hier ook personen toevoegen, bewerken of verwijderen.\n- Familieleden: Hier vindt u de contactgegevens van alle familieleden.\n- Reünies: Bekijk foto\'s en details van eerdere reünies en informatie over de volgende reünie.', 'userGuideNl');
  settingsStore.put('Welcome to the Wennink family website!\n\n- Family Tree: View the interactive family tree. As an administrator, you can also add, edit, or remove family members.\n- Family Members: Here you can find the contact details of all family members.\n- Reunions: View photos and details of past reunions and information about the next reunion.', 'userGuideEn');
  settingsStore.put('De geschiedenis van de familie Wennink kent een rijke historie die generaties teruggaat. Met deze website houden we de verbindingen tussen de verschillende takken van de familie levend en documenteren we onze gezamenlijke geschiedenis en reünies voor toekomstige generaties.', 'historyNl');
  settingsStore.put('The history of the Wennink family has a rich heritage spanning generations. With this website, we keep the connections between different branches of the family alive and document our shared history and reunions for future generations.', 'historyEn');

  // Seed Members
  const defaultMembers = [
    { id: 1, firstname: 'Jan', insertion: '', lastname: 'Wennink', email: 'jan.wennink@gmail.com', mobile: '+31 6 12345678', landline: '+31 30 2345678', address1: 'Biltstraat 45', address2: '', zip: '3572 AA', city: 'Utrecht', state: 'Utrecht', country: 'Nederland' },
    { id: 2, firstname: 'Maria', insertion: 'de', lastname: 'Vries', email: 'maria.vries@gmail.com', mobile: '+31 6 87654321', landline: '+31 30 2345678', address1: 'Biltstraat 45', address2: '', zip: '3572 AA', city: 'Utrecht', state: 'Utrecht', country: 'Nederland' },
    { id: 3, firstname: 'Pieter', insertion: '', lastname: 'Wennink', email: 'pieter.wennink@gmail.com', mobile: '+31 6 11223344', landline: '', address1: 'Keizersgracht 102', address2: 'Appartement 3B', zip: '1015 CV', city: 'Amsterdam', state: 'Noord-Holland', country: 'Nederland' },
    { id: 4, firstname: 'Sarah', insertion: '', lastname: 'Smith', email: 'sarah.smith@gmail.com', mobile: '+44 7911 123456', landline: '', address1: '12 Baker Street', address2: '', zip: 'NW1 6XE', city: 'Londen', state: 'Greater London', country: 'Verenigd Koninkrijk' },
    { id: 5, firstname: 'Thomas', insertion: '', lastname: 'Wennink', email: 'thomas.wenn@gmail.com', mobile: '+31 6 99887766', landline: '', address1: 'Keizersgracht 102', address2: 'Appartement 3B', zip: '1015 CV', city: 'Amsterdam', state: 'Noord-Holland', country: 'Nederland' },
    { id: 6, firstname: 'Sophie', insertion: '', lastname: 'Wennink', email: 'sophie.w@gmail.com', mobile: '+31 6 22334455', landline: '', address1: 'Keizersgracht 102', address2: 'Appartement 3B', zip: '1015 CV', city: 'Amsterdam', state: 'Noord-Holland', country: 'Nederland' },
    { id: 7, firstname: 'Annelies', insertion: '', lastname: 'Wennink', email: 'annelies.w@gmail.com', mobile: '+31 6 55667788', landline: '', address1: 'Riouwstraat 12', address2: '', zip: '2585 HA', city: 'Den Haag', state: 'Zuid-Holland', country: 'Nederland' },
    { id: 8, firstname: 'Mark', insertion: 'de', lastname: 'Jong', email: 'mark.jong@gmail.com', mobile: '+31 6 44556677', landline: '', address1: 'Riouwstraat 12', address2: '', zip: '2585 HA', city: 'Den Haag', state: 'Zuid-Holland', country: 'Nederland' },
    { id: 9, firstname: 'Hendrik', insertion: 'de', lastname: 'Jong', email: 'hendrik.j@gmail.com', mobile: '+31 6 66778899', landline: '', address1: 'Riouwstraat 12', address2: '', zip: '2585 HA', city: 'Den Haag', state: 'Zuid-Holland', country: 'Nederland' },
    { id: 10, firstname: 'Charlotte', insertion: 'de', lastname: 'Jong', email: 'charlotte.j@gmail.com', mobile: '+31 6 77889900', landline: '', address1: 'Riouwstraat 12', address2: '', zip: '2585 HA', city: 'Den Haag', state: 'Zuid-Holland', country: 'Nederland' }
  ];

  defaultMembers.forEach(member => membersStore.put(member));

  // Seed Reunions
  const defaultReunions = [
    {
      id: 1,
      date: '25-05-2018',
      place: 'Rotterdam, Nederland',
      photos: [
        { id: 101, filename: 'reunie_2018_1.jpg', dataUrl: PHOTO_1 },
        { id: 102, filename: 'reunie_2018_2.jpg', dataUrl: PHOTO_2 }
      ]
    },
    {
      id: 2,
      date: '10-07-2021',
      place: 'Londen, Verenigd Koninkrijk',
      photos: [
        { id: 201, filename: 'reunie_2021_1.jpg', dataUrl: PHOTO_1 }
      ]
    },
    {
      id: 3,
      date: '18-05-2024',
      place: 'Utrecht, Nederland',
      photos: [
        { id: 301, filename: 'reunie_2024_1.jpg', dataUrl: PHOTO_1 },
        { id: 302, filename: 'reunie_2024_2.jpg', dataUrl: PHOTO_2 }
      ]
    }
  ];

  defaultReunions.forEach(reunion => reunionsStore.put(reunion));

  // Seed Family Tree (D3 Hierarchical Nodes)
  const defaultTreeNodes = [
    { id: 1, name: 'Jan Wennink', birthYear: '1945', deathYear: '', spouse: 'Maria de Vries', partnerId: 2 },
    { id: 2, name: 'Maria de Vries', birthYear: '1948', deathYear: '', spouse: 'Jan Wennink', partnerId: 1, isPartner: true },
    
    // Children of Jan & Maria
    { id: 3, name: 'Pieter Wennink', birthYear: '1972', deathYear: '', parentId: 1, spouse: 'Sarah Smith', partnerId: 4 },
    { id: 4, name: 'Sarah Smith', birthYear: '1975', deathYear: '', spouse: 'Pieter Wennink', partnerId: 3, isPartner: true },
    
    { id: 7, name: 'Annelies Wennink', birthYear: '1975', deathYear: '', parentId: 1, spouse: 'Mark de Jong', partnerId: 8 },
    { id: 8, name: 'Mark de Jong', birthYear: '1973', deathYear: '', spouse: 'Annelies Wennink', partnerId: 7, isPartner: true },

    // Kids of Pieter & Sarah
    { id: 5, name: 'Thomas Wennink', birthYear: '2001', deathYear: '', parentId: 3 },
    { id: 6, name: 'Sophie Wennink', birthYear: '2004', deathYear: '', parentId: 3 },

    // Kids of Annelies & Mark
    { id: 9, name: 'Hendrik de Jong', birthYear: '2008', deathYear: '', parentId: 7 },
    { id: 10, name: 'Charlotte de Jong', birthYear: '2011', deathYear: '', parentId: 7 }
  ];

  defaultTreeNodes.forEach(node => treeStore.put(node));
}

// Database Helper CRUD Operations

export function getSetting(key) {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('settings', 'readonly');
      const store = transaction.objectStore('settings');
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

export function setSetting(key, value) {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('settings', 'readwrite');
      const store = transaction.objectStore('settings');
      const request = store.put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
}

export function getAllSettings() {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('settings', 'readonly');
      const store = transaction.objectStore('settings');
      const request = store.openCursor();
      const settings = {};
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          settings[cursor.key] = cursor.value;
          cursor.continue();
        } else {
          resolve(settings);
        }
      };
      request.onerror = () => reject(request.error);
    });
  });
}

export function getMembers() {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('members', 'readonly');
      const store = transaction.objectStore('members');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

export function saveMember(member) {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('members', 'readwrite');
      const store = transaction.objectStore('members');
      const request = store.put(member);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

export function deleteMember(id) {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('members', 'readwrite');
      const store = transaction.objectStore('members');
      const request = store.delete(Number(id));
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
}

export function getReunions() {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('reunions', 'readonly');
      const store = transaction.objectStore('reunions');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

export function saveReunion(reunion) {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('reunions', 'readwrite');
      const store = transaction.objectStore('reunions');
      const request = store.put(reunion);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

export function getTreeNodes() {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('tree', 'readonly');
      const store = transaction.objectStore('tree');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

export function saveTreeNode(node) {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('tree', 'readwrite');
      const store = transaction.objectStore('tree');
      const request = store.put(node);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

export function deleteTreeNode(id) {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('tree', 'readwrite');
      const store = transaction.objectStore('tree');
      const request = store.delete(Number(id));
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
}

export function getAlbums() {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('albums', 'readonly');
      const store = transaction.objectStore('albums');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

export function saveAlbum(album) {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('albums', 'readwrite');
      const store = transaction.objectStore('albums');
      const request = store.put(album);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

export function deleteAlbum(id) {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('albums', 'readwrite');
      const store = transaction.objectStore('albums');
      const request = store.delete(Number(id));
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
}

// Full database backup export
export function exportDatabase() {
  return Promise.all([
    getAllSettings(),
    getMembers(),
    getReunions(),
    getTreeNodes(),
    getAlbums()
  ]).then(([settings, members, reunions, tree, albums]) => {
    return JSON.stringify({ settings, members, reunions, tree, albums }, null, 2);
  });
}

// Full database restore import
export function importDatabase(jsonData) {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      try {
        const data = JSON.parse(jsonData);
        const transaction = db.transaction(['settings', 'members', 'reunions', 'tree', 'albums'], 'readwrite');
        
        // Clear old stores
        transaction.objectStore('settings').clear();
        transaction.objectStore('members').clear();
        transaction.objectStore('reunions').clear();
        transaction.objectStore('tree').clear();
        transaction.objectStore('albums').clear();

        // Restore Settings
        const settingsStore = transaction.objectStore('settings');
        for (const [key, value] of Object.entries(data.settings || {})) {
          settingsStore.put(value, key);
        }

        // Restore Members
        const membersStore = transaction.objectStore('members');
        (data.members || []).forEach(m => membersStore.put(m));

        // Restore Reunions
        const reunionsStore = transaction.objectStore('reunions');
        (data.reunions || []).forEach(r => reunionsStore.put(r));

        // Restore Tree
        const treeStore = transaction.objectStore('tree');
        (data.tree || []).forEach(t => treeStore.put(t));

        // Restore Albums
        const albumsStore = transaction.objectStore('albums');
        (data.albums || []).forEach(a => albumsStore.put(a));

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      } catch (err) {
        reject(err);
      }
    });
  });
}
