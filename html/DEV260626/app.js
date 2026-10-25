// app.js - Main Application Coordinator

import { 
  initDB, getSetting, setSetting, getAllSettings, 
  getMembers, saveMember, deleteMember, 
  getReunions, saveReunion, 
  getTreeNodes, saveTreeNode, deleteTreeNode, 
  exportDatabase, importDatabase,
  getAlbums, saveAlbum, deleteAlbum
} from './db.js';

import { 
  login, verifyTFA, logout, isAuthenticated, isAdmin, 
  getCurrentUser, getFailedAttempts, resetFailedAttempts,
  setPassword
} from './auth.js';

import { 
  renderFamilyTree, zoomIn, zoomOut, resetZoom 
} from './tree.js';

import { translations } from './translations.js';

// Global App State
let currentLang = localStorage.getItem('wennink_lang') || 'nl';
let activeTab = 'home';
let selectedReunion = null;
let selectedAlbum = null;
let selectedTreeNode = null;
let currentTfaCodeSent = null;
let currentLightboxPhotos = [];
let currentLightboxIndex = -1;

// Cookie helper functions
function setCookie(name, value, days) {
  let expires = "";
  if (days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    expires = "; expires=" + date.toUTCString();
  }
  const cookieValue = (value !== undefined && value !== null) ? value : "";
  document.cookie = name + "=" + cookieValue + expires + "; path=/; SameSite=Lax";
}

function getCookie(name) {
  const nameEQ = name + "=";
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}

let userFontSizeStep = parseInt(getCookie('wennink_font_step')) || 0;

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  initDB().then(() => {
    return ensureDefaultAlbumExists();
  }).then(() => {
    setupEventListeners();
    updateTheme();
    updateLanguageUI();
    checkAuthSession();
    checkUrlQueryParams();
  }).catch(err => {
    console.error('Failed to initialize IndexedDB:', err);
  });
});

// Setup UI Event Listeners
function setupEventListeners() {
  // Lang toggle
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      currentLang = e.target.dataset.lang;
      localStorage.setItem('wennink_lang', currentLang);
      document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      updateLanguageUI();
      renderCurrentTab();
    });
  });

  // Font Size Switcher listeners
  const decBtn = document.getElementById('fontSizeDecBtn');
  const incBtn = document.getElementById('fontSizeIncBtn');
  if (decBtn && incBtn) {
    decBtn.addEventListener('click', () => {
      adjustFontSizeStep(-1);
    });
    incBtn.addEventListener('click', () => {
      adjustFontSizeStep(1);
    });
  }

  // Tab navigation
  document.querySelectorAll('.tab-link').forEach(link => {
    link.addEventListener('click', (e) => {
      const tab = e.target.dataset.tab;
      switchTab(tab);
    });
  });

  // Logout button
  document.getElementById('logoutBtn').addEventListener('click', () => {
    const wasAdmin = logout();
    if (wasAdmin) {
      // Automatic update timestamp on admin logout
      updateLastUpdatedTimestamp().then(() => {
        checkAuthSession();
        switchTab('home');
      });
    } else {
      checkAuthSession();
      switchTab('home');
    }
  });

  // Login Form Submission
  document.getElementById('loginForm').addEventListener('submit', handleLoginSubmit);

  // Forgot Password Link Click
  document.getElementById('forgotPasswordLink').addEventListener('click', (e) => {
    e.preventDefault();
    closeModal('loginModal');
    openModal('resetModal');
    // Prefill the email from the login email input if available
    const loginEmailVal = document.getElementById('loginEmail').value.trim();
    if (loginEmailVal) {
      document.getElementById('resetEmail').value = loginEmailVal;
    }
  });

  // TFA Form Submission
  document.getElementById('tfaForm').addEventListener('submit', handleTfaSubmit);

  // Password Reset Dialog buttons (Cancel bottom-left, Send bottom-right)
  document.getElementById('resetCancelBtn').addEventListener('click', () => {
    closeModal('resetModal');
    resetFailedAttempts();
  });
  document.getElementById('resetForm').addEventListener('submit', handlePasswordResetSubmit);

  // Invite Member button
  document.getElementById('inviteMemberBtn').addEventListener('click', handleInviteMemberClick);

  // Set Password Form Submit
  document.getElementById('setPasswordForm').addEventListener('submit', handleSetPasswordSubmit);

  // Set Password Cancel button
  document.getElementById('setPasswordCancelBtn').addEventListener('click', () => {
    closeModal('setPasswordModal');
    if (!isAuthenticated()) {
      showLoginModal();
    }
  });

  // Search members
  document.getElementById('memberSearch').addEventListener('input', (e) => {
    renderMembers(e.target.value);
  });

  // Save Member profile (Contactgegevens popup)
  document.getElementById('memberForm').addEventListener('submit', handleSaveMemberSubmit);
  document.getElementById('deleteMemberBtn').addEventListener('click', handleDeleteMember);

  // Reunion Form Submission (Add reunion popup)
  document.getElementById('reunionForm').addEventListener('submit', handleAddReunionSubmit);

  // Reunion upload photo
  document.getElementById('photoUploadInput').addEventListener('change', handlePhotoUpload);

  // Back to reunions timeline button
  document.getElementById('backToTimelineBtn').addEventListener('click', () => {
    document.getElementById('reunionDetailView').style.display = 'none';
    document.getElementById('reunionTimelineView').style.display = 'block';
    selectedReunion = null;
  });

  // Reunion edit details button
  document.getElementById('editReunionDetailsBtn').addEventListener('click', () => {
    if (!selectedReunion) return;
    openModal('reunionModal');
    
    const form = document.getElementById('reunionForm');
    form.reunionId.value = selectedReunion.id;
    form.reunionPlace.value = selectedReunion.place;
    
    const parts = selectedReunion.date.split('-');
    if (parts.length === 3) {
      form.reunionDate.value = `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
  });

  // D3 Tree Control buttons
  document.getElementById('zoomInBtn').addEventListener('click', () => zoomIn());
  document.getElementById('zoomOutBtn').addEventListener('click', () => zoomOut());
  document.getElementById('zoomResetBtn').addEventListener('click', () => resetZoom('treeContainer'));

  // Tree node CRUD Form submissions
  document.getElementById('treeNodeForm').addEventListener('submit', handleSaveTreeNodeSubmit);
  document.getElementById('deleteNodeBtn').addEventListener('click', handleDeleteTreeNodeSubmit);

  // Add Child / Partner shortcuts inside tree details panel
  document.getElementById('treeAddChildBtn').addEventListener('click', () => openSelectMemberModal('child'));
  document.getElementById('treeAddSpouseBtn').addEventListener('click', () => openSelectMemberModal('spouse'));
  document.getElementById('treeEditBtn').addEventListener('click', () => openTreeNodeModal('edit'));

  // Admin settings Form
  document.getElementById('adminSettingsForm').addEventListener('submit', handleSaveAdminSettings);

  // Admin crest and photo file uploads
  document.getElementById('crestUploadInput').addEventListener('change', (e) => handleAdminImageUpload(e, 'familyCrest'));
  document.getElementById('photoUploadHomeInput').addEventListener('change', (e) => handleAdminImageUpload(e, 'familyPhoto'));

  // Backup & Restore
  document.getElementById('exportDbBtn').addEventListener('click', handleDatabaseExport);
  document.getElementById('importDbBtn').addEventListener('click', () => {
    document.getElementById('importFileInput').click();
  });
  document.getElementById('importFileInput').addEventListener('change', handleDatabaseImport);

  // Modal Closers
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modalId = e.target.closest('.modal-overlay').id;
      closeModal(modalId);
    });
  });

  // Lightbox Close
  document.getElementById('lightboxClose').addEventListener('click', () => {
    closeModal('lightboxModal');
  });

  // Create member shortcut
  document.getElementById('addMemberBtn').addEventListener('click', () => {
    openMemberModal(null);
  });

  // Create reunion shortcut
  document.getElementById('addReunionBtn').addEventListener('click', () => {
    openModal('reunionModal');
    document.getElementById('reunionForm').reset();
    document.getElementById('reunionForm').reunionId.value = '';
  });

  // Create album button
  document.getElementById('addAlbumBtn').addEventListener('click', () => {
    openModal('newAlbumModal');
    document.getElementById('newAlbumForm').reset();
  });

  // New Album Form Submit
  document.getElementById('newAlbumForm').addEventListener('submit', handleAddAlbumSubmit);

  // Back to Albums Directory button click
  document.getElementById('backToAlbumsBtn').addEventListener('click', () => {
    document.getElementById('albumDetailView').style.display = 'none';
    document.getElementById('albumsListView').style.display = 'block';
    renderAlbums();
  });

  // Album Photo Upload change handler
  document.getElementById('albumPhotoUploadInput').addEventListener('change', handleAlbumPhotoUpload);

  // Edit Album Name button click
  document.getElementById('editAlbumNameBtn').addEventListener('click', () => {
    if (!selectedAlbum) return;
    openModal('renameAlbumModal');
    const input = document.getElementById('renameAlbumName');
    input.value = selectedAlbum.name;
    input.focus();
  });

  // Rename Album Form Submit
  document.getElementById('renameAlbumForm').addEventListener('submit', handleRenameAlbumSubmit);

  // Delete Album button click
  document.getElementById('deleteAlbumBtn').addEventListener('click', handleDeleteAlbum);

  // Home User Guide button click
  document.getElementById('homeUserGuideBtn').addEventListener('click', () => {
    getAllSettings().then(settings => {
      const userGuideText = currentLang === 'en' ? (settings.userGuideEn !== undefined ? settings.userGuideEn : t('defaultUserGuideEn')) : (settings.userGuideNl !== undefined ? settings.userGuideNl : t('defaultUserGuideNl'));
      document.getElementById('popupUserGuideText').textContent = userGuideText;
      openModal('userGuideModal');
    });
  });

  // Click homepage history box to go to historyDoc tab
  const homeHistoryCard = document.getElementById('homeHistoryCard');
  if (homeHistoryCard) {
    homeHistoryCard.addEventListener('click', () => {
      switchTab('historyDoc');
    });
  }

  // History Doc Upload Input change handler
  const historyDocUploadInput = document.getElementById('historyDocUploadInput');
  if (historyDocUploadInput) {
    historyDocUploadInput.addEventListener('change', handleHistoryDocUpload);
  }

  // Close tree node details panel when clicking outside cards or panel
  document.addEventListener('click', (e) => {
    const panel = document.getElementById('treeDetailsPanel');
    if (!panel || panel.style.display !== 'block') return;

    const clickedInsidePanel = panel.contains(e.target);
    const clickedCard = e.target.closest('.tree-card');
    const clickedControl = e.target.closest('.tree-controls') || 
                           e.target.closest('.modal') || 
                           e.target.closest('.modal-overlay') || 
                           e.target.closest('.modal-content') || 
                           e.target.closest('.swal2-container') ||
                           e.target.closest('.btn');

    if (!clickedInsidePanel && !clickedCard && !clickedControl) {
      onTreeNodeClick(null);
    }
  });

  // Keyboard navigation for photos (Escape to go higher/close modal, ArrowLeft/ArrowRight to navigate)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const activeModal = document.querySelector('.modal-overlay.active');
      if (activeModal) {
        e.preventDefault();
        closeModal(activeModal.id);
        return;
      }
      
      const reunionDetailView = document.getElementById('reunionDetailView');
      const albumDetailView = document.getElementById('albumDetailView');
      
      if (reunionDetailView && reunionDetailView.style.display === 'block') {
        e.preventDefault();
        document.getElementById('backToTimelineBtn').click();
      } else if (albumDetailView && albumDetailView.style.display === 'block') {
        e.preventDefault();
        document.getElementById('backToAlbumsBtn').click();
      }
      return;
    }
    
    // Lightbox photo navigation
    const lightboxModal = document.getElementById('lightboxModal');
    if (lightboxModal && lightboxModal.classList.contains('active')) {
      if (e.key === 'ArrowRight' || e.key === 'Right') {
        e.preventDefault();
        if (currentLightboxPhotos.length > 0) {
          const nextIndex = (currentLightboxIndex + 1) % currentLightboxPhotos.length;
          showLightboxPhoto(nextIndex);
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'Left') {
        e.preventDefault();
        if (currentLightboxPhotos.length > 0) {
          const prevIndex = (currentLightboxIndex - 1 + currentLightboxPhotos.length) % currentLightboxPhotos.length;
          showLightboxPhoto(prevIndex);
        }
      }
    }
  });
}

// Route tab switches
function switchTab(tab) {
  if (tab === 'admin' && !isAdmin()) {
    alert(t('adminOnly'));
    showLoginModal();
    return;
  }

  activeTab = tab;
  document.querySelectorAll('.tab-link').forEach(link => {
    link.classList.remove('active');
    if (link.dataset.tab === tab) link.classList.add('active');
  });

  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  document.getElementById(`tab-${tab}`).classList.add('active');

  renderCurrentTab();
}

function renderCurrentTab() {
  if (activeTab === 'home') {
    renderHome();
  } else if (activeTab === 'tree') {
    renderTreeTab();
  } else if (activeTab === 'members') {
    renderMembers();
  } else if (activeTab === 'reunions') {
    renderReunions();
  } else if (activeTab === 'albums') {
    renderAlbums();
  } else if (activeTab === 'historyDoc') {
    renderHistoryDoc();
  } else if (activeTab === 'admin') {
    renderAdmin();
  }
}

// ----------------------------------------------------
// Translation Engine
// ----------------------------------------------------
function t(key, replacements = {}) {
  let val = translations[currentLang][key] || translations['nl'][key] || key;
  for (const [k, v] of Object.entries(replacements)) {
    val = val.replace(`{${k}}`, v);
  }
  return val;
}

function updateLanguageUI() {
  document.title = t('title');
  
  // Set all data-i18n attributes
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    el.textContent = t(key);
  });

  // Set placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    el.placeholder = t(key);
  });

  // Update specific dynamic labels
  document.getElementById('langBtnNl').classList.toggle('active', currentLang === 'nl');
  document.getElementById('langBtnEn').classList.toggle('active', currentLang === 'en');
}

// ----------------------------------------------------
// Authentication Handlers
// ----------------------------------------------------
function checkAuthSession() {
  const wrapper = document.getElementById('appWrapper');
  
  if (isAuthenticated()) {
    wrapper.classList.remove('logged-out');
    wrapper.classList.add('logged-in');
    
    const user = getCurrentUser();
    document.getElementById('userEmailBadge').textContent = user.email;
    document.getElementById('adminTabLink').style.display = user.role === 'admin' ? 'block' : 'none';
    
    // Hide login modal if open
    closeModal('loginModal');
    closeModal('tfaModal');
    
    // Render the active tab (e.g. 'home' on initial page refresh)
    switchTab(activeTab);
  } else {
    wrapper.classList.add('logged-out');
    wrapper.classList.remove('logged-in');
    document.getElementById('adminTabLink').style.display = 'none';
    showLoginModal();
  }
}

function showLoginModal() {
  openModal('loginModal');
  document.getElementById('loginEmail').focus();
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const pass = document.getElementById('loginPass').value;

  const result = await login(email, pass);

  if (result.status === 'success') {
    checkAuthSession();
    switchTab('home');
  } else if (result.status === 'tfa_required') {
    closeModal('loginModal');
    openModal('tfaModal');
    currentTfaCodeSent = result.code;
    
    const statusMsg = document.getElementById('tfaStatusMsg');
    const banner = document.getElementById('tfaSimulationBanner');
    
    // Clear and hide by default
    statusMsg.style.display = 'none';
    statusMsg.style.backgroundColor = '';
    statusMsg.style.color = '';
    banner.style.display = 'none';
    
    document.getElementById('tfaCodeVal').value = '';
    document.getElementById('tfaCodeVal').focus();

    // Check if SMTP is configured
    getAllSettings().then(settings => {
      if (settings.smtpHost) {
        statusMsg.style.display = 'block';
        statusMsg.style.backgroundColor = '#f3f4f6';
        statusMsg.style.color = '#4b5563';
        statusMsg.textContent = currentLang === 'nl' ? 'E-mail verzenden...' : 'Sending email...';

        // Call backend API to send the email
        fetch('/api/send-tfa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: email,
            code: result.code,
            smtpConfig: {
              host: settings.smtpHost,
              port: settings.smtpPort,
              secure: settings.smtpSecure,
              user: settings.smtpUser,
              pass: settings.smtpPass,
              from: settings.smtpFrom
            }
          })
        })
        .then(response => response.json().then(data => ({ status: response.status, body: data })))
        .then(({ status, body }) => {
          if (status === 200 && body.success) {
            statusMsg.style.backgroundColor = '#d1fae5';
            statusMsg.style.color = '#065f46';
            statusMsg.textContent = t('tfaEmailSent', { email });
          } else {
            statusMsg.style.backgroundColor = '#fee2e2';
            statusMsg.style.color = '#991b1b';
            statusMsg.innerHTML = `${t('tfaEmailFailed', { error: body.error || 'Unknown error' })}<br><strong style="font-size: 1.1rem; margin-top: 0.5rem; display: block;">Code: ${result.code}</strong>`;
            
            // Show fallback simulation banner
            banner.style.display = 'flex';
            banner.querySelector('.tfa-sim-code').textContent = result.code;
          }
        })
        .catch(err => {
          console.error(err);
          statusMsg.style.backgroundColor = '#fee2e2';
          statusMsg.style.color = '#991b1b';
          statusMsg.innerHTML = `${t('tfaEmailFailed', { error: err.message })}<br><strong style="font-size: 1.1rem; margin-top: 0.5rem; display: block;">Code: ${result.code}</strong>`;
          
          // Show fallback simulation banner
          banner.style.display = 'flex';
          banner.querySelector('.tfa-sim-code').textContent = result.code;
        });
      } else {
        // SMTP not configured
        statusMsg.style.display = 'block';
        statusMsg.style.backgroundColor = '#fef3c7';
        statusMsg.style.color = '#92400e';
        statusMsg.innerHTML = `${currentLang === 'nl' ? 'SMTP niet geconfigureerd in Admin.' : 'SMTP not configured in Admin.'}<br><strong style="font-size: 1.1rem; margin-top: 0.5rem; display: block;">Simulation Code: ${result.code}</strong>`;
        
        // Show fallback simulation banner
        banner.style.display = 'flex';
        banner.querySelector('.tfa-sim-code').textContent = result.code;
      }
    });
  } else {
    // Failed login
    if (result.maxAttemptsReached) {
      closeModal('loginModal');
      openModal('resetModal');
      document.getElementById('resetEmail').value = email;
    } else {
      alert(t('authFailed', { attempts: result.attempts }));
    }
  }
}

function handleTfaSubmit(e) {
  e.preventDefault();
  const code = document.getElementById('tfaCodeVal').value;
  const trustBrowser = document.getElementById('tfaTrustBrowser').checked;

  const result = verifyTFA(code, trustBrowser);
  if (result.success) {
    document.getElementById('tfaSimulationBanner').style.display = 'none';
    checkAuthSession();
    switchTab('home');
  } else {
    alert(t('tfaCodeInvalid'));
  }
}

async function handlePasswordResetSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('resetEmail').value.trim();
  const normEmail = email.toLowerCase();

  // Check if it's the admin or a registered member
  const adminEmail = 'pjheise@gmail.com';
  let memberExists = (normEmail === adminEmail);
  let fullName = 'Admin';

  if (!memberExists) {
    const members = await getMembers();
    const member = members.find(m => m.email && m.email.trim().toLowerCase() === normEmail);
    if (member) {
      memberExists = true;
      fullName = `${member.firstname} ${member.insertion ? member.insertion + ' ' : ''}${member.lastname}`.trim();
    }
  }

  if (!memberExists) {
    alert(t('emailNotRegisteredAlert'));
    return;
  }

  const resetLink = `${window.location.origin}${window.location.pathname}?reset=${encodeURIComponent(email)}`;

  const subject = currentLang === 'nl' 
    ? 'Wachtwoord Herstellen: Familie Wennink Website' 
    : 'Password Recovery: Wennink Family Website';
  
  const text = currentLang === 'nl'
    ? `Beste ${fullName},\n\nU heeft een aanvraag gedaan om uw wachtwoord te herstellen.\n\nKlik op de onderstaande link om direct een nieuw wachtwoord in te stellen:\n${resetLink}\n\nMet vriendelijke groet,\nFamilie Wennink`
    : `Dear ${fullName},\n\nYou requested a password recovery.\n\nClick the link below to set a new password immediately:\n${resetLink}\n\nBest regards,\nWennink Family`;

  const settings = await getAllSettings();
  
  const statusBanner = document.getElementById('linkSimulationBanner');
  const simHref = statusBanner.querySelector('.link-sim-href');
  
  // Reset banner state
  statusBanner.style.display = 'none';

  if (settings.smtpHost) {
    try {
      const response = await fetch('/api/send-tfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email,
          subject,
          text,
          smtpConfig: {
            host: settings.smtpHost,
            port: settings.smtpPort,
            secure: settings.smtpSecure,
            user: settings.smtpUser,
            pass: settings.smtpPass,
            from: settings.smtpFrom
          }
        })
      });
      const body = await response.json();
      if (response.ok && body.success) {
        alert(t('resetSentAlert', { email }));
        closeModal('resetModal');
        resetFailedAttempts();
      } else {
        throw new Error(body.error || 'Unknown server error');
      }
    } catch (err) {
      console.error('Failed to send SMTP reset:', err);
      // Fallback
      statusBanner.style.display = 'flex';
      simHref.textContent = resetLink;
      simHref.href = resetLink;
      alert(`${t('resetSentAlert', { email })} (Simulated via top banner)`);
      closeModal('resetModal');
      resetFailedAttempts();
    }
  } else {
    // Fallback
    statusBanner.style.display = 'flex';
    simHref.textContent = resetLink;
    simHref.href = resetLink;
    alert(`${t('resetSentAlert', { email })} (Simulated via top banner)`);
    closeModal('resetModal');
    resetFailedAttempts();
  }
}

// ----------------------------------------------------
// Home Tab Rendering
// ----------------------------------------------------
function renderHome() {
  getAllSettings().then(settings => {
    // Crest overwrite skipped (handled globally by updateTheme)

    // Homepage Photo
    const homePhoto = document.getElementById('homePhoto');
    if (settings.familyPhoto) {
      homePhoto.src = settings.familyPhoto;
    }

    // Last & Next Reunions
    document.getElementById('homeLastReunionDate').textContent = settings.lastReunionDate || '';
    document.getElementById('homeLastReunionPlace').textContent = settings.lastReunionPlace || '';
    
    document.getElementById('homeNextReunionDate').textContent = settings.nextReunionDate || t('notPlanned');
    document.getElementById('homeNextReunionPlace').textContent = settings.nextReunionPlace || '';

    // Wennink History Card
    const historyText = currentLang === 'en' ? (settings.historyEn !== undefined ? settings.historyEn : t('defaultHistoryEn')) : (settings.historyNl !== undefined ? settings.historyNl : t('defaultHistoryNl'));
    document.getElementById('homeHistoryText').textContent = historyText;

    // Last Updated
    document.querySelectorAll('.last-updated-val').forEach(el => {
      el.textContent = settings.lastUpdated || '';
    });
  });
}

// ----------------------------------------------------
// Family Tree (Stamboom) Tab Rendering
// ----------------------------------------------------
function renderTreeTab() {
  getTreeNodes().then(nodes => {
    const isEditMode = isAdmin();
    const container = document.getElementById('treeContainer');
    
    if (!nodes || nodes.length === 0) {
      container.innerHTML = '';
      if (isEditMode) {
        container.innerHTML = `
          <div class="empty-tree-state" style="text-align: center; padding: 3rem 1.5rem; background: rgba(255,255,255,0.45); border-radius: 12px; max-width: 400px; margin: 4rem auto; box-shadow: 0 8px 32px rgba(0,0,0,0.05); border: 1px solid rgba(255,255,255,0.7); backdrop-filter: blur(10px);">
            <h3 style="margin-bottom: 0.8rem; font-family: var(--header-font); font-size: 1.5rem; color: var(--text-color);">${t('emptyTreeTitle')}</h3>
            <p style="font-size: 0.95rem; margin-bottom: 1.5rem; color: var(--text-color); opacity: 0.85;">${t('emptyTreeDesc')}</p>
            <button id="startTreeBtn" class="btn btn-primary" style="width: 100%;">${t('selectMemberTitleRoot')}</button>
          </div>
        `;
        document.getElementById('startTreeBtn').addEventListener('click', () => openSelectMemberModal('root'));
      } else {
        container.innerHTML = `
          <div class="empty-tree-state" style="text-align: center; padding: 3rem 1.5rem; background: rgba(255,255,255,0.45); border-radius: 12px; max-width: 400px; margin: 4rem auto; box-shadow: 0 8px 32px rgba(0,0,0,0.05); border: 1px solid rgba(255,255,255,0.7); backdrop-filter: blur(10px);">
            <h3 style="margin-bottom: 0.8rem; font-family: var(--header-font); font-size: 1.5rem; color: var(--text-color);">${t('emptyTreeTitleNoAdmin')}</h3>
            <p style="font-size: 0.95rem; color: var(--text-color); opacity: 0.85;">${t('emptyTreeDescNoAdmin')}</p>
          </div>
        `;
      }
      document.getElementById('treeDetailsPanel').style.display = 'none';
      return;
    }

    renderFamilyTree('treeContainer', nodes, isEditMode, onTreeNodeClick);
    
    // Hide details panel initially
    document.getElementById('treeDetailsPanel').style.display = 'none';
  });
}

function onTreeNodeClick(node) {
  selectedTreeNode = node;
  const panel = document.getElementById('treeDetailsPanel');
  if (!node) {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = 'block';

  document.getElementById('treeDetailName').textContent = node.name + (node.deathYear && node.deathYear.trim() !== '' ? ' †' : '');
  document.getElementById('treeDetailDates').textContent = node.birthYear ? `${node.birthYear} - ${node.deathYear || ''}` : '';
  
  // Show Admin tree adjustment shortcuts if admin
  document.getElementById('treeAdminActions').style.display = isAdmin() ? 'flex' : 'none';
}

function openTreeNodeModal(mode) {
  if (!isAdmin()) {
    alert(t('adminOnly'));
    return;
  }
  if (mode !== 'edit' || !selectedTreeNode) return;
  const modal = document.getElementById('treeNodeModal');
  openModal('treeNodeModal');
  
  const form = document.getElementById('treeNodeForm');
  form.reset();
  
  const title = modal.querySelector('.modal-title');
  const parentGroup = document.getElementById('nodeParentSelectGroup');
  const spouseCheckbox = document.getElementById('nodeIsSpouseGroup');
  
  // Build parent options
  getTreeNodes().then(nodes => {
    const parentSelect = document.getElementById('nodeParentSelect');
    parentSelect.innerHTML = '<option value="">Geen / None</option>';
    nodes.filter(n => !n.isPartner && n.id !== selectedTreeNode.id).forEach(n => {
      parentSelect.innerHTML += `<option value="${n.id}">${n.name}</option>`;
    });

    title.textContent = t('editNode');
    form.nodeId.value = selectedTreeNode.id;
    form.nodeName.value = selectedTreeNode.name;
    form.nodeParentSelect.value = selectedTreeNode.parentId || '';
    form.nodeIsSpouse.checked = selectedTreeNode.isPartner || false;
    
    parentGroup.style.display = selectedTreeNode.isPartner ? 'none' : 'block';
    spouseCheckbox.style.display = 'block';
  });

  document.getElementById('deleteNodeBtn').style.display = 'inline-block';
}

async function openSelectMemberModal(relationType) {
  if (!isAdmin()) {
    alert(t('adminOnly'));
    return;
  }
  if (relationType !== 'root' && !selectedTreeNode) return;
  const modal = document.getElementById('selectMemberModal');
  openModal('selectMemberModal');

  const titleEl = document.getElementById('selectMemberModalTitle');
  const descEl = document.getElementById('selectMemberModalDesc');
  const listEl = document.getElementById('selectMemberList');
  listEl.innerHTML = '';

  if (relationType === 'child') {
    titleEl.textContent = t('selectMemberTitleChild');
    descEl.textContent = t('selectMemberDescChild').replace('{name}', selectedTreeNode.name);
  } else if (relationType === 'spouse') {
    titleEl.textContent = t('selectMemberTitleSpouse');
    descEl.textContent = t('selectMemberDescSpouse').replace('{name}', selectedTreeNode.name);
  } else if (relationType === 'root') {
    titleEl.textContent = t('selectMemberTitleRoot');
    descEl.textContent = t('selectMemberDescRoot');
  }

  try {
    const members = await getMembers();
    const treeNodes = await getTreeNodes();

    const treeNames = new Set(treeNodes.filter(n => n.name).map(n => n.name.trim().toLowerCase()));

    const availableMembers = members.filter(m => {
      const fullName = `${m.firstname || ''} ${m.insertion || ''} ${m.lastname || ''}`.replace(/\s+/g, ' ').trim().toLowerCase();
      return m.availableForTree !== false && !treeNames.has(fullName);
    });

    if (availableMembers.length === 0) {
      listEl.innerHTML = `<p class="no-data" style="padding: 1rem; text-align: center; font-size: 0.95rem; color: #ff4d4d; border: none; background: none;">${t('noAvailableMembers')}</p>`;
      return;
    }

    availableMembers.forEach(m => {
      let fullName = `${m.firstname || ''} ${m.insertion ? m.insertion + ' ' : ''}${m.lastname || ''}`.trim();
      if (m.deathYear && m.deathYear.trim() !== '') {
        fullName += ' †';
      }
      const item = document.createElement('div');
      item.className = 'select-member-item';
      item.textContent = fullName;
      item.addEventListener('click', () => {
        addMemberToTree(m, relationType).then(() => {
          closeModal('selectMemberModal');
        });
      });
      listEl.appendChild(item);
    });
  } catch (err) {
    console.error('Error loading available members:', err);
  }
}

async function addMemberToTree(member, relationType) {
  if (!isAdmin()) {
    alert(t('adminOnly'));
    return;
  }
  if (relationType !== 'root' && !selectedTreeNode) return;
  const targetNode = selectedTreeNode; // Capture selectedTreeNode to be resilient to async click resets
  const targetNodeId = targetNode ? Number(targetNode.id) : null;
  const name = `${member.firstname || ''} ${member.insertion ? member.insertion + ' ' : ''}${member.lastname || ''}`.trim();
  
  const nodeData = {
    name,
    birthYear: member.birthYear || '',
    deathYear: member.deathYear || ''
  };

  if (relationType === 'spouse') {
    nodeData.isPartner = true;
    nodeData.partnerId = targetNodeId;
  } else if (relationType === 'child') {
    nodeData.isPartner = false;
    nodeData.parentId = targetNodeId;
  } else if (relationType === 'root') {
    nodeData.isPartner = false;
  }

  try {
    const savedId = await saveTreeNode(nodeData);

    if (relationType === 'spouse' && targetNode) {
      const originalNode = {
        id: targetNodeId,
        name: targetNode.name,
        birthYear: targetNode.birthYear || '',
        deathYear: targetNode.deathYear || '',
        isPartner: targetNode.isPartner || false,
        partnerId: Number(savedId),
        spouse: name
      };
      if (targetNode.parentId && targetNode.parentId !== 'virtual_root_parent_node_id') {
        originalNode.parentId = Number(targetNode.parentId);
      }
      await saveTreeNode(originalNode);
    }

    // Set member availability to false in directory since they are now in the tree
    member.availableForTree = false;
    await saveMember(member);

    renderTreeTab();
    if (isAdmin()) updateLastUpdatedTimestamp();
  } catch (err) {
    console.error('Error adding member to tree:', err);
  }
}

// ----------------------------------------------------
// Tree Node & Member Sync Helpers
// ----------------------------------------------------
function parseFullName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) {
    return { firstname: '', insertion: '', lastname: '' };
  }
  if (parts.length === 1) {
    return { firstname: parts[0], insertion: '', lastname: '' };
  }
  const firstname = parts[0];
  const lastname = parts[parts.length - 1];
  const insertion = parts.slice(1, parts.length - 1).join(' ');
  return { firstname, insertion, lastname };
}

async function cascadeDeleteMemberAndTreeNode(targetNodeId, deleteMembersFromDb = false) {
  const targetId = Number(targetNodeId);
  const nodes = await getTreeNodes();
  const members = await getMembers();
  
  const targetNode = nodes.find(n => Number(n.id) === targetId);
  if (!targetNode) return;
  
  const toDeleteNodeIds = new Set([targetId]);
  let remainingNodes = nodes.filter(n => Number(n.id) !== targetId);
  
  // Connectivity Propagation Algorithm from Roots
  let connectedIds = new Set();
  remainingNodes.forEach(n => {
    if (!n.isPartner && !n.parentId) {
      connectedIds.add(Number(n.id));
    }
  });
  
  let added = true;
  while (added) {
    added = false;
    for (const n of remainingNodes) {
      const nid = Number(n.id);
      if (connectedIds.has(nid)) continue;
      
      if (!n.isPartner) {
        if (n.parentId && connectedIds.has(Number(n.parentId))) {
          connectedIds.add(nid);
          added = true;
        }
      } else {
        if (n.partnerId && connectedIds.has(Number(n.partnerId))) {
          connectedIds.add(nid);
          added = true;
        }
      }
    }
  }
  
  remainingNodes.forEach(n => {
    const nid = Number(n.id);
    if (!connectedIds.has(nid)) {
      toDeleteNodeIds.add(nid);
    }
  });
  
  // Collect names to delete in members store
  const namesToDelete = new Set();
  toDeleteNodeIds.forEach(id => {
    const node = nodes.find(n => Number(n.id) === id);
    if (node && node.name) {
      namesToDelete.add(node.name.trim().toLowerCase());
    }
  });
  
  const promises = [];
  // Unlink surviving partners
  nodes.forEach(n => {
    const nid = Number(n.id);
    if (!toDeleteNodeIds.has(nid)) {
      if (n.partnerId && toDeleteNodeIds.has(Number(n.partnerId))) {
        n.partnerId = undefined;
        n.spouse = undefined;
        promises.push(saveTreeNode(n));
      }
    }
  });
  
  // Delete tree nodes
  toDeleteNodeIds.forEach(id => {
    promises.push(deleteTreeNode(id));
  });
  
  // Handle corresponding members: delete them or just mark them as available
  members.forEach(m => {
    const memberName = `${m.firstname || ''} ${m.insertion || ''} ${m.lastname || ''}`.replace(/\s+/g, ' ').trim().toLowerCase();
    if (namesToDelete.has(memberName)) {
      if (deleteMembersFromDb) {
        promises.push(deleteMember(m.id));
      } else {
        m.availableForTree = true;
        promises.push(saveMember(m));
      }
    }
  });
  
  await Promise.all(promises);
}

async function syncSaveMemberToTree(oldName, member) {
  const newName = `${member.firstname || ''} ${member.insertion || ''} ${member.lastname || ''}`.replace(/\s+/g, ' ').trim();
  const treeNodes = await getTreeNodes();
  
  if (oldName) {
    const oldNameNorm = oldName.trim().toLowerCase();
    const node = treeNodes.find(n => n.name && n.name.trim().toLowerCase() === oldNameNorm);
    if (node) {
      node.name = newName;
      node.birthYear = member.birthYear || '';
      node.deathYear = member.deathYear || '';
      await saveTreeNode(node);
      
      // Update spouse references
      for (const n of treeNodes) {
        if (n.partnerId !== undefined && n.partnerId !== null && Number(n.partnerId) === Number(node.id)) {
          n.spouse = newName;
          await saveTreeNode(n);
        }
      }
    }
  }
}

async function syncSaveTreeToMember(oldName, node) {
  const newName = node.name ? node.name.trim() : '';
  const members = await getMembers();
  
  if (oldName) {
    const oldNameNorm = oldName.trim().toLowerCase();
    const m = members.find(item => {
      const itemFullName = `${item.firstname || ''} ${item.insertion || ''} ${item.lastname || ''}`.replace(/\s+/g, ' ').trim().toLowerCase();
      return itemFullName === oldNameNorm;
    });
    if (m) {
      const parsed = parseFullName(newName);
      m.firstname = parsed.firstname;
      m.insertion = parsed.insertion;
      m.lastname = parsed.lastname;
      await saveMember(m);
    }
  } else {
    const newNameNorm = newName.toLowerCase();
    const memberExists = members.some(item => {
      const itemFullName = `${item.firstname || ''} ${item.insertion || ''} ${item.lastname || ''}`.replace(/\s+/g, ' ').trim().toLowerCase();
      return itemFullName === newNameNorm;
    });
    if (!memberExists && newName) {
      const parsed = parseFullName(newName);
      const newMember = {
        firstname: parsed.firstname,
        insertion: parsed.insertion,
        lastname: parsed.lastname,
        email: '',
        mobile: '',
        landline: '',
        address1: '',
        address2: '',
        zip: '',
        city: '',
        state: '',
        country: ''
      };
      await saveMember(newMember);
    }
  }
}

// ----------------------------------------------------
// Event Handlers for Tree and Members
// ----------------------------------------------------
async function handleSaveTreeNodeSubmit(e) {
  e.preventDefault();
  if (!isAdmin()) {
    alert(t('adminOnly'));
    return;
  }
  const form = document.getElementById('treeNodeForm');
  const id = form.nodeId.value ? Number(form.nodeId.value) : undefined;
  const name = form.nodeName.value.trim();
  const parentId = form.nodeParentSelect.value ? Number(form.nodeParentSelect.value) : undefined;
  const isSpouse = form.nodeIsSpouse.checked;
  const targetNode = selectedTreeNode; // Capture selectedTreeNode to be resilient to async click resets

  if (!name) return;

  const nodeData = {
    name,
    birthYear: '',
    deathYear: ''
  };

  if (id) nodeData.id = id;

  if (isSpouse) {
    nodeData.isPartner = true;
    if (!id && targetNode) {
      nodeData.partnerId = Number(targetNode.id);
    } else if (id && targetNode) {
      nodeData.partnerId = targetNode.partnerId ? Number(targetNode.partnerId) : undefined;
    }
  } else {
    nodeData.isPartner = false;
    if (parentId) nodeData.parentId = Number(parentId);
  }

  try {
    let oldName = '';
    if (id) {
      const nodes = await getTreeNodes();
      const oldNode = nodes.find(n => Number(n.id) === Number(id));
      if (oldNode) {
        oldName = oldNode.name || '';
        nodeData.birthYear = oldNode.birthYear || '';
        nodeData.deathYear = oldNode.deathYear || '';
      }
    }

    const savedId = await saveTreeNode(nodeData);

    if (isSpouse && !id && targetNode) {
      const originalNode = {
        id: Number(targetNode.id),
        name: targetNode.name,
        birthYear: targetNode.birthYear || '',
        deathYear: targetNode.deathYear || '',
        isPartner: targetNode.isPartner || false,
        partnerId: Number(savedId),
        spouse: name
      };
      if (targetNode.parentId && targetNode.parentId !== 'virtual_root_parent_node_id') {
        originalNode.parentId = Number(targetNode.parentId);
      }
      await saveTreeNode(originalNode);
    }

    // Update partner spouse reference name
    const allTreeNodes = await getTreeNodes();
    for (const n of allTreeNodes) {
      if (n.partnerId !== undefined && n.partnerId !== null && Number(n.partnerId) === Number(savedId)) {
        n.spouse = name;
        await saveTreeNode(n);
      }
    }

    await syncSaveTreeToMember(oldName, nodeData);

    closeModal('treeNodeModal');
    renderTreeTab();
    renderMembers();
    if (isAdmin()) updateLastUpdatedTimestamp();
  } catch (err) {
    console.error('Error saving tree node:', err);
  }
}

function handleDeleteTreeNodeSubmit() {
  if (!isAdmin()) {
    alert(t('adminOnly'));
    return;
  }
  if (!selectedTreeNode) return;
  if (!confirm(t('deleteConfirm'))) return;

  cascadeDeleteMemberAndTreeNode(selectedTreeNode.id, false).then(() => {
    closeModal('treeNodeModal');
    renderTreeTab();
    renderMembers();
    if (isAdmin()) updateLastUpdatedTimestamp();
  }).catch(err => {
    console.error('Error deleting tree node:', err);
  });
}

// ----------------------------------------------------
// Family Members Tab Rendering
// ----------------------------------------------------
function renderMembers(filterQuery = '') {
  getMembers().then(members => {
    const list = document.getElementById('membersList');
    list.innerHTML = '';

    // Sort alphabetically
    members.sort((a, b) => {
      const nameA = `${a.firstname} ${a.lastname}`.toLowerCase();
      const nameB = `${b.firstname} ${b.lastname}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });

    // Filter
    const query = filterQuery.toLowerCase().trim();
    const filtered = members.filter(m => {
      const fullName = `${m.firstname} ${m.insertion} ${m.lastname}`.toLowerCase();
      return fullName.includes(query) || (m.email || '').toLowerCase().includes(query) || (m.mobile || '').includes(query);
    });

    if (filtered.length === 0) {
      list.innerHTML = '<p class="no-data" data-i18n="notPlanned">Geen resultaten gevonden.</p>';
      updateLanguageUI();
      return;
    }

    filtered.forEach(m => {
      const card = document.createElement('div');
      card.className = 'member-card';
      card.addEventListener('click', () => openMemberModal(m));

      let fullName = `${m.firstname} ${m.insertion ? m.insertion + ' ' : ''}${m.lastname}`;
      if (m.deathYear && m.deathYear.trim() !== '') {
        fullName += ' †';
      }
      
      card.innerHTML = `
        <div class="member-name">${fullName}</div>
        <div class="member-detail">
          <span style="font-weight:600">Email:</span> ${m.email || '-'}
        </div>
        <div class="member-detail">
          <span style="font-weight:600">Tel:</span> ${m.mobile || '-'}
        </div>
      `;

      list.appendChild(card);
    });
  });
}

function openMemberModal(member) {
  openModal('memberModal');
  const form = document.getElementById('memberForm');
  form.reset();

  const title = document.getElementById('memberPopupTitle');
  const deleteBtn = document.getElementById('deleteMemberBtn');
  const inviteBtn = document.getElementById('inviteMemberBtn');
  deleteBtn.style.display = (member && isAdmin()) ? 'inline-block' : 'none';
  inviteBtn.style.display = (member && member.email && isAdmin()) ? 'inline-block' : 'none';

  if (member) {
    title.textContent = t('contactPopupTitle');
    form.memberId.value = member.id;
    form.firstname.value = member.firstname || '';
    form.insertion.value = member.insertion || '';
    form.lastname.value = member.lastname || '';
    form.gender.value = member.gender || '';
    form.email.value = member.email || '';
    form.mobile.value = member.mobile || '';
    form.landline.value = member.landline || '';
    form.address1.value = member.address1 || '';
    form.address2.value = member.address2 || '';
    form.zip.value = member.zip || '';
    form.city.value = member.city || '';
    form.state.value = member.state || '';
    form.country.value = member.country || '';
    form.birthYear.value = member.birthYear || '';
    form.deathYear.value = member.deathYear || '';
    document.getElementById('availableForTree').checked = member.availableForTree !== false;
  } else {
    title.textContent = t('addMemberBtn');
    form.memberId.value = '';
    document.getElementById('availableForTree').checked = true;
  }

  // Auto-focus the first input field
  const firstnameInput = document.getElementById('firstname');
  if (firstnameInput) {
    firstnameInput.focus();
  }
}

function isValidDateOrYear(str) {
  if (!str) return true;
  if (/^\d{4}$/.test(str)) {
    const year = parseInt(str);
    return year > 1000 && year < 2100;
  }
  const match = str.match(/^(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{4})$/);
  if (match) {
    const day = parseInt(match[1]);
    const month = parseInt(match[2]);
    const year = parseInt(match[3]);
    if (month < 1 || month > 12) return false;
    if (day < 1 || day > 31) return false;
    if (year < 1000 || year > 2100) return false;
    const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (day > daysInMonth[month - 1]) return false;
    if (month === 2 && day === 29) {
      const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
      if (!isLeap) return false;
    }
    return true;
  }
  return false;
}

async function handleSaveMemberSubmit(e) {
  e.preventDefault();
  const form = document.getElementById('memberForm');
  const id = form.memberId.value ? Number(form.memberId.value) : undefined;

  const memberData = {
    firstname: form.firstname.value.trim(),
    insertion: form.insertion.value.trim(),
    lastname: form.lastname.value.trim(),
    gender: form.gender.value,
    email: form.email.value.trim(),
    mobile: form.mobile.value.trim(),
    landline: form.landline.value.trim(),
    address1: form.address1.value.trim(),
    address2: form.address2.value.trim(),
    zip: form.zip.value.trim(),
    city: form.city.value.trim(),
    state: form.state.value.trim(),
    country: form.country.value.trim(),
    birthYear: form.birthYear.value.trim(),
    deathYear: form.deathYear.value.trim(),
    availableForTree: document.getElementById('availableForTree').checked
  };

  if (id) memberData.id = id;

  if (!memberData.firstname || !memberData.lastname) {
    alert(t('requiredFieldsAlert'));
    return;
  }

  if (!isValidDateOrYear(memberData.birthYear) || !isValidDateOrYear(memberData.deathYear)) {
    alert(t('invalidDateFormatAlert'));
    return;
  }

  try {
    let oldName = '';
    let existingAvailableForTree = true;
    if (id) {
      const members = await getMembers();
      const oldMember = members.find(m => m.id === id);
      if (oldMember) {
        oldName = `${oldMember.firstname || ''} ${oldMember.insertion || ''} ${oldMember.lastname || ''}`.replace(/\s+/g, ' ').trim();
        existingAvailableForTree = oldMember.availableForTree;
      }
    }

    // Keep tree node status if not explicitly changed or we are creating new
    if (memberData.availableForTree === undefined) {
      memberData.availableForTree = existingAvailableForTree;
    }

    await saveMember(memberData);
    await syncSaveMemberToTree(oldName, memberData);

    closeModal('memberModal');
    renderMembers();
    renderTreeTab();
    if (isAdmin()) updateLastUpdatedTimestamp();
  } catch (err) {
    console.error('Error saving member:', err);
  }
}

async function handleDeleteMember() {
  const form = document.getElementById('memberForm');
  const idStr = form.memberId.value;
  if (!idStr) return;
  const id = Number(idStr);

  if (confirm(t('deleteConfirm'))) {
    try {
      const members = await getMembers();
      const member = members.find(m => m.id === id);
      if (member) {
        const memberName = `${member.firstname || ''} ${member.insertion || ''} ${member.lastname || ''}`.replace(/\s+/g, ' ').trim().toLowerCase();
        
        const treeNodes = await getTreeNodes();
        const treeNode = treeNodes.find(n => n.name && n.name.trim().toLowerCase() === memberName);
        
        if (treeNode) {
          await cascadeDeleteMemberAndTreeNode(treeNode.id, true);
        } else {
          await deleteMember(id);
        }
      }
      closeModal('memberModal');
      renderMembers();
      renderTreeTab();
      if (isAdmin()) updateLastUpdatedTimestamp();
    } catch (err) {
      console.error('Error deleting member:', err);
    }
  }
}

// ----------------------------------------------------
// Reunions Tab Rendering
// ----------------------------------------------------
function renderReunions() {
  getReunions().then(reunions => {
    // Sort reunions chronological order
    reunions.sort((a, b) => {
      const dateA = parseDate(a.date);
      const dateB = parseDate(b.date);
      return dateB - dateA; // newest first
    });

    const list = document.getElementById('reunionsTimeline');
    list.innerHTML = '<div class="timeline-line"></div>';

    if (reunions.length === 0) {
      list.innerHTML += '<p class="no-data">Geen reünies gevonden.</p>';
      return;
    }

    reunions.forEach((reunion, index) => {
      const item = document.createElement('div');
      item.className = 'timeline-item';
      item.style.animationDelay = `${index * 0.1}s`;

      const side = index % 2 === 0 ? 'even' : 'odd';

      item.innerHTML = `
        <div class="timeline-dot"></div>
        <div class="timeline-card">
          <div class="timeline-date">${reunion.date}</div>
          <div class="timeline-place">${reunion.place}</div>
        </div>
      `;

      item.querySelector('.timeline-card').addEventListener('click', () => {
        openReunionPage(reunion);
      });

      list.appendChild(item);
    });

    // If currently viewing a reunion detail page, re-render to update dynamic translations
    if (selectedReunion) {
      const updatedReunion = reunions.find(r => r.id === selectedReunion.id);
      if (updatedReunion) {
        selectedReunion = updatedReunion;
      }
      document.getElementById('reunionDetailTitle').textContent = `${selectedReunion.place} - ${selectedReunion.date}`;
      renderReunionPhotos();
    }
  });
}

function openReunionPage(reunion) {
  selectedReunion = reunion;
  
  document.getElementById('reunionTimelineView').style.display = 'none';
  document.getElementById('reunionDetailView').style.display = 'block';

  document.getElementById('reunionDetailTitle').textContent = `${reunion.place} - ${reunion.date}`;
  
  // Show edit details button only for Admin
  document.getElementById('editReunionDetailsBtn').style.display = isAdmin() ? 'inline-block' : 'none';
  
  renderReunionPhotos();
}

function renderReunionPhotos() {
  const grid = document.getElementById('photoGrid');
  grid.innerHTML = '';

  let selectAllBtn = document.getElementById('selectAllPhotosBtn');
  let downloadBtn = document.getElementById('downloadSelectedPhotosBtn');
  let deleteBtn = document.getElementById('deleteSelectedPhotosBtn');

  if (!selectedReunion.photos || selectedReunion.photos.length === 0) {
    grid.innerHTML = '<p class="no-data" style="grid-column:1/-1">Nog geen foto\'s geüpload voor deze reünie.</p>';
    selectAllBtn.style.display = 'none';
    downloadBtn.style.display = 'none';
    deleteBtn.style.display = 'none';
    return;
  }

  // Debug log to inspect database photo objects
  console.log('Reunion photos debug:', selectedReunion.photos.map(p => ({
    id: p.id,
    filename: p.filename,
    hasDataUrl: !!p.dataUrl,
    dataUrlLength: p.dataUrl ? p.dataUrl.length : 0,
    dataUrlPrefix: p.dataUrl ? p.dataUrl.slice(0, 60) : 'none'
  })));

  // Show selection actions buttons
  selectAllBtn.style.display = 'inline-block';
  selectAllBtn.textContent = t('selectAll');

  downloadBtn.style.display = 'inline-block';
  downloadBtn.textContent = t('downloadSelection');
  downloadBtn.disabled = true;

  deleteBtn.style.display = 'inline-block';
  deleteBtn.textContent = t('deleteSelection');
  deleteBtn.disabled = true;

  const selectedPhotoIds = new Set();

  selectedReunion.photos.forEach(photo => {
    const card = document.createElement('div');
    card.className = 'photo-card';
    card.dataset.photoId = photo.id;
    
    card.innerHTML = `
      <div class="photo-card-check">
        <span class="checkmark-icon">✓</span>
      </div>
      <img src="${photo.dataUrl}" alt="${photo.filename}">
      <div class="photo-actions">
        <button class="photo-action-btn" data-i18n="downloadOriginal">Download</button>
      </div>
    `;

    // Click check icon to select/deselect
    const checkCircle = card.querySelector('.photo-card-check');
    checkCircle.addEventListener('click', (e) => {
      e.stopPropagation();
      card.classList.toggle('selected');
      const isSelected = card.classList.contains('selected');
      
      if (isSelected) {
        selectedPhotoIds.add(photo.id);
      } else {
        selectedPhotoIds.delete(photo.id);
      }
      
      updateSelectionButtonsState();
    });

    // Lightbox view on card click
    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('photo-action-btn')) {
        e.stopPropagation();
        downloadImage(photo.dataUrl, photo.filename);
      } else if (!e.target.closest('.photo-card-check')) {
        openLightbox(photo, selectedReunion.photos);
      }
    });

    // Listen for image load error to debug broken images
    const imgEl = card.querySelector('img');
    imgEl.onerror = (err) => {
      console.error('Image load failed for:', photo.filename, 'dataUrl prefix:', photo.dataUrl ? photo.dataUrl.slice(0, 100) : 'none', 'error:', err);
    };

    grid.appendChild(card);
  });

  function updateSelectionButtonsState() {
    const totalPhotos = selectedReunion.photos.length;
    const selectedCount = selectedPhotoIds.size;

    downloadBtn.disabled = selectedCount === 0;
    deleteBtn.disabled = selectedCount === 0;

    if (selectedCount === totalPhotos) {
      selectAllBtn.textContent = t('deselectAll');
    } else {
      selectAllBtn.textContent = t('selectAll');
    }
  }

  // Re-bind Select All / Deselect All action
  const newSelectAllBtn = selectAllBtn.cloneNode(true);
  selectAllBtn.parentNode.replaceChild(newSelectAllBtn, selectAllBtn);
  selectAllBtn = newSelectAllBtn;
  selectAllBtn.addEventListener('click', () => {
    const totalPhotos = selectedReunion.photos.length;
    const selectedCount = selectedPhotoIds.size;

    if (selectedCount === totalPhotos) {
      // Deselect all
      selectedPhotoIds.clear();
      document.querySelectorAll('.photo-card').forEach(card => card.classList.remove('selected'));
    } else {
      // Select all
      selectedReunion.photos.forEach(p => selectedPhotoIds.add(p.id));
      document.querySelectorAll('.photo-card').forEach(card => card.classList.add('selected'));
    }
    updateSelectionButtonsState();
  });

  // Re-bind Download Selected action
  const newDownloadBtn = downloadBtn.cloneNode(true);
  downloadBtn.parentNode.replaceChild(newDownloadBtn, downloadBtn);
  downloadBtn = newDownloadBtn;
  downloadBtn.addEventListener('click', () => {
    if (selectedPhotoIds.size === 0) return;
    
    // Stagger downloads to prevent browsers from blocking multiple file downloads
    let index = 0;
    selectedPhotoIds.forEach(id => {
      const photo = selectedReunion.photos.find(p => p.id === id);
      if (photo) {
        setTimeout(() => {
          downloadImage(photo.dataUrl, photo.filename);
        }, index * 250); // 250ms stagger
        index++;
      }
    });
  });

  // Re-bind Delete Selected action
  const newDeleteBtn = deleteBtn.cloneNode(true);
  deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
  deleteBtn = newDeleteBtn;
  newDeleteBtn.addEventListener('click', () => {
    if (selectedPhotoIds.size === 0) return;
    if (confirm(t('deleteConfirm'))) {
      selectedReunion.photos = selectedReunion.photos.filter(p => !selectedPhotoIds.has(p.id));
      saveReunion(selectedReunion).then(() => {
        renderReunionPhotos();
        if (isAdmin()) updateLastUpdatedTimestamp();
      });
    }
  });

  updateLanguageUI();
}

function handleAddReunionSubmit(e) {
  e.preventDefault();
  const form = document.getElementById('reunionForm');
  const reunionId = form.reunionId.value ? Number(form.reunionId.value) : null;
  const dateVal = form.reunionDate.value; // YYYY-MM-DD
  const place = form.reunionPlace.value.trim();

  if (!dateVal || !place) return;

  // Format date to DD-MM-YYYY
  const parts = dateVal.split('-');
  const dateFormatted = `${parts[2]}-${parts[1]}-${parts[0]}`;

  if (reunionId && selectedReunion && selectedReunion.id === reunionId) {
    // Edit Mode: update viewed reunion directly
    selectedReunion.date = dateFormatted;
    selectedReunion.place = place;
    saveReunion(selectedReunion).then(() => {
      document.getElementById('reunionDetailTitle').textContent = `${place} - ${dateFormatted}`;
      closeModal('reunionModal');
      renderReunions();
      if (isAdmin()) updateLastUpdatedTimestamp();
    });
  } else {
    // Add Mode
    const reunionData = {
      date: dateFormatted,
      place: place,
      photos: []
    };
    saveReunion(reunionData).then(() => {
      closeModal('reunionModal');
      renderReunions();
      if (isAdmin()) updateLastUpdatedTimestamp();
    });
  }
}

function handlePhotoUpload(e) {
  const files = e.target.files;
  if (!files || files.length === 0 || !selectedReunion) return;

  const promises = [];
  const baseId = Date.now();
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const isHeic = file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif');
    const filename = isHeic ? file.name.replace(/\.(heic|heif)$/i, '.jpg') : file.name;
    const photoId = baseId + i + Math.floor(Math.random() * 100000);
    promises.push(
      compressImage(file).then(dataUrl => {
        if (!selectedReunion.photos) selectedReunion.photos = [];
        selectedReunion.photos.push({
          id: photoId,
          filename: filename,
          dataUrl: dataUrl
        });
      })
    );
  }

  Promise.all(promises).then(() => {
    return saveReunion(selectedReunion);
  }).then(() => {
    renderReunionPhotos();
    if (isAdmin()) updateLastUpdatedTimestamp();
    alert(t('uploadSuccess'));
  }).catch(err => {
    console.error('Error uploading photos:', err);
  });
}

// ----------------------------------------------------
// Custom Photo Albums Tab Rendering
// ----------------------------------------------------
function renderAlbums() {
  getAlbums().then(albums => {
    const grid = document.getElementById('albumsGrid');
    grid.innerHTML = '';

    if (!albums || albums.length === 0) {
      grid.innerHTML = `<p class="no-data">${t('noAlbumsYet')}</p>`;
      return;
    }

    // Sort albums: 'Algemeen' first, 'Wennink Historie' second, rest alphabetically
    albums.sort((a, b) => {
      const aName = a.name.trim().toLowerCase();
      const bName = b.name.trim().toLowerCase();
      
      if (aName === 'algemeen') return -1;
      if (bName === 'algemeen') return 1;
      
      if (aName === 'wennink historie') return -1;
      if (bName === 'wennink historie') return 1;
      
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    albums.forEach(album => {
      const card = document.createElement('div');
      card.className = 'album-card';
      
      let coverPhoto = null;
      if (album.coverPhotoId && album.photos) {
        coverPhoto = album.photos.find(p => p.id === album.coverPhotoId);
      }

      let coverHtml = '';
      if (coverPhoto) {
        coverHtml = `<img class="album-card-cover" src="${coverPhoto.dataUrl}" alt="${album.name}">`;
      } else {
        coverHtml = `<span class="album-card-no-cover">${t('defaultAlbumCoverText')}</span>`;
      }

      card.innerHTML = `
        <div class="album-card-header">
          <h3 class="album-card-title">${album.name}</h3>
        </div>
        <div class="album-card-cover-container">
          ${coverHtml}
        </div>
      `;

      card.addEventListener('click', () => {
        openAlbumDetail(album);
      });

      grid.appendChild(card);
    });
  });
}

function openAlbumDetail(album) {
  selectedAlbum = album;
  document.getElementById('albumsListView').style.display = 'none';
  document.getElementById('albumDetailView').style.display = 'block';
  document.getElementById('albumDetailTitle').textContent = album.name;
  
  // Hide edit/delete buttons for default albums
  const albumNameLower = album.name.trim().toLowerCase();
  const isDefaultAlbum = albumNameLower === 'algemeen' || albumNameLower === 'wennink historie';
  document.getElementById('editAlbumNameBtn').style.display = isDefaultAlbum ? 'none' : 'inline-block';
  document.getElementById('deleteAlbumBtn').style.display = isDefaultAlbum ? 'none' : 'inline-block';
  
  // Clear file input
  document.getElementById('albumPhotoUploadInput').value = '';
  
  renderAlbumPhotos();
}

function renderAlbumPhotos() {
  const grid = document.getElementById('albumPhotoGrid');
  grid.innerHTML = '';

  let selectAllBtn = document.getElementById('selectAllAlbumPhotosBtn');
  let downloadBtn = document.getElementById('downloadSelectedAlbumPhotosBtn');
  let deleteBtn = document.getElementById('deleteSelectedAlbumPhotosBtn');

  if (!selectedAlbum.photos || selectedAlbum.photos.length === 0) {
    grid.innerHTML = '<p class="no-data" style="grid-column:1/-1">Nog geen foto\'s geüpload voor dit album.</p>';
    selectAllBtn.style.display = 'none';
    downloadBtn.style.display = 'none';
    deleteBtn.style.display = 'none';
    return;
  }

  // Show selection actions buttons
  selectAllBtn.style.display = 'inline-block';
  selectAllBtn.textContent = t('selectAll');

  downloadBtn.style.display = 'inline-block';
  downloadBtn.textContent = t('downloadSelection');
  downloadBtn.disabled = true;

  deleteBtn.style.display = 'inline-block';
  deleteBtn.textContent = t('deleteSelection');
  deleteBtn.disabled = true;

  const selectedPhotoIds = new Set();

  selectedAlbum.photos.forEach(photo => {
    const card = document.createElement('div');
    card.className = 'photo-card';
    card.dataset.photoId = photo.id;

    const isCover = selectedAlbum.coverPhotoId && selectedAlbum.coverPhotoId === photo.id;
    const coverBadgeHtml = isCover ? `<div class="cover-badge">Cover ★</div>` : '';

    card.innerHTML = `
      <div class="photo-card-check">
        <span class="checkmark-icon">✓</span>
      </div>
      ${coverBadgeHtml}
      <img src="${photo.dataUrl}" alt="${photo.filename}">
      <div class="photo-actions" style="display:flex; gap:0.25rem; justify-content:center;">
        <button class="photo-action-btn download-photo-btn" data-i18n="downloadOriginal">Download</button>
        <button class="photo-action-btn set-cover-photo-btn" style="background:#ffcc00; color:#2b3a4f;">Cover</button>
      </div>
    `;

    // Click check icon to select/deselect
    const checkCircle = card.querySelector('.photo-card-check');
    checkCircle.addEventListener('click', (e) => {
      e.stopPropagation();
      card.classList.toggle('selected');
      const isSelected = card.classList.contains('selected');
      
      if (isSelected) {
        selectedPhotoIds.add(photo.id);
      } else {
        selectedPhotoIds.delete(photo.id);
      }
      
      updateSelectionButtonsState();
    });

    // Set cover photo click
    const coverBtn = card.querySelector('.set-cover-photo-btn');
    coverBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedAlbum.coverPhotoId = photo.id;
      saveAlbum(selectedAlbum).then(() => {
        renderAlbumPhotos();
      });
    });

    // Lightbox view on card click
    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('download-photo-btn')) {
        e.stopPropagation();
        downloadImage(photo.dataUrl, photo.filename);
      } else if (e.target.classList.contains('set-cover-photo-btn')) {
        // Handled by coverBtn listener
      } else if (!e.target.closest('.photo-card-check')) {
        openLightbox(photo, selectedAlbum.photos);
      }
    });

    grid.appendChild(card);
  });

  function updateSelectionButtonsState() {
    const totalPhotos = selectedAlbum.photos.length;
    const selectedCount = selectedPhotoIds.size;

    downloadBtn.disabled = selectedCount === 0;
    deleteBtn.disabled = selectedCount === 0;

    if (selectedCount === totalPhotos) {
      selectAllBtn.textContent = t('deselectAll');
    } else {
      selectAllBtn.textContent = t('selectAll');
    }
  }

  // Re-bind Select All / Deselect All action
  const newSelectAllBtn = selectAllBtn.cloneNode(true);
  selectAllBtn.parentNode.replaceChild(newSelectAllBtn, selectAllBtn);
  selectAllBtn = newSelectAllBtn;
  selectAllBtn.addEventListener('click', () => {
    const totalPhotos = selectedAlbum.photos.length;
    const selectedCount = selectedPhotoIds.size;

    if (selectedCount === totalPhotos) {
      selectedPhotoIds.clear();
      document.querySelectorAll('#albumPhotoGrid .photo-card').forEach(card => card.classList.remove('selected'));
    } else {
      selectedAlbum.photos.forEach(p => selectedPhotoIds.add(p.id));
      document.querySelectorAll('#albumPhotoGrid .photo-card').forEach(card => card.classList.add('selected'));
    }
    updateSelectionButtonsState();
  });

  // Re-bind Download Selected action
  const newDownloadBtn = downloadBtn.cloneNode(true);
  downloadBtn.parentNode.replaceChild(newDownloadBtn, downloadBtn);
  downloadBtn = newDownloadBtn;
  downloadBtn.addEventListener('click', () => {
    if (selectedPhotoIds.size === 0) return;
    
    let index = 0;
    selectedPhotoIds.forEach(id => {
      const photo = selectedAlbum.photos.find(p => p.id === id);
      if (photo) {
        setTimeout(() => {
          downloadImage(photo.dataUrl, photo.filename);
        }, index * 250);
        index++;
      }
    });
  });

  // Re-bind Delete Selected action
  const newDeleteBtn = deleteBtn.cloneNode(true);
  deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
  deleteBtn = newDeleteBtn;
  newDeleteBtn.addEventListener('click', () => {
    if (selectedPhotoIds.size === 0) return;
    if (confirm(t('deleteConfirm'))) {
      const deletedSomeCover = selectedAlbum.coverPhotoId && selectedPhotoIds.has(selectedAlbum.coverPhotoId);
      if (deletedSomeCover) {
        selectedAlbum.coverPhotoId = undefined;
      }
      selectedAlbum.photos = selectedAlbum.photos.filter(p => !selectedPhotoIds.has(p.id));
      saveAlbum(selectedAlbum).then(() => {
        renderAlbumPhotos();
        if (isAdmin()) updateLastUpdatedTimestamp();
      });
    }
  });

  updateLanguageUI();
}

function handleAddAlbumSubmit(e) {
  e.preventDefault();
  const nameInput = document.getElementById('newAlbumName');
  const newName = nameInput.value.trim();
  if (!newName) return;

  getAlbums().then(albums => {
    const normName = newName.toLowerCase();
    const exists = albums.some(a => a.name.trim().toLowerCase() === normName);
    if (exists) {
      alert(t('albumNameUniqueError'));
      return;
    }

    const albumData = {
      name: newName,
      photos: [],
      coverPhotoId: undefined
    };

    saveAlbum(albumData).then(() => {
      closeModal('newAlbumModal');
      renderAlbums();
      if (isAdmin()) updateLastUpdatedTimestamp();
    });
  });
}

function handleAlbumPhotoUpload(e) {
  const files = e.target.files;
  if (!files || files.length === 0 || !selectedAlbum) return;

  const promises = [];
  const baseId = Date.now();
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const isHeic = file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif');
    const filename = isHeic ? file.name.replace(/\.(heic|heif)$/i, '.jpg') : file.name;
    const photoId = baseId + i + Math.floor(Math.random() * 100000);
    promises.push(
      compressImage(file).then(dataUrl => {
        if (!selectedAlbum.photos) selectedAlbum.photos = [];
        selectedAlbum.photos.push({
          id: photoId,
          filename: filename,
          dataUrl: dataUrl
        });
      })
    );
  }

  Promise.all(promises).then(() => {
    return saveAlbum(selectedAlbum);
  }).then(() => {
    renderAlbumPhotos();
    if (isAdmin()) updateLastUpdatedTimestamp();
    alert(t('uploadSuccess'));
  }).catch(err => {
    console.error('Error uploading photos to album:', err);
  });
}

function handleRenameAlbumSubmit(e) {
  e.preventDefault();
  const nameInput = document.getElementById('renameAlbumName');
  const newName = nameInput.value.trim();
  if (!newName || !selectedAlbum) return;

  // If same name, just close modal
  if (newName === selectedAlbum.name) {
    closeModal('renameAlbumModal');
    return;
  }

  getAlbums().then(albums => {
    const normName = newName.toLowerCase();
    const exists = albums.some(a => a.id !== selectedAlbum.id && a.name.trim().toLowerCase() === normName);
    if (exists) {
      alert(t('albumNameUniqueError'));
      return;
    }

    selectedAlbum.name = newName;
    saveAlbum(selectedAlbum).then(() => {
      document.getElementById('albumDetailTitle').textContent = newName;
      closeModal('renameAlbumModal');
      if (isAdmin()) updateLastUpdatedTimestamp();
    });
  });
}

function handleDeleteAlbum() {
  if (!selectedAlbum) return;

  const albumNameLower = selectedAlbum.name.trim().toLowerCase();
  // Prevent deleting the default albums 'Algemeen' and 'Wennink Historie'
  if (albumNameLower === 'algemeen' || albumNameLower === 'wennink historie') {
    alert(t('cannotDeleteDefaultAlbum', { name: selectedAlbum.name }));
    return;
  }

  // Check if there are photos
  const hasPhotos = selectedAlbum.photos && selectedAlbum.photos.length > 0;

  if (hasPhotos) {
    if (!confirm(t('deleteAlbumWithPhotosWarning'))) {
      return;
    }

    // Move photos to the default album 'Algemeen'
    getAlbums().then(albums => {
      const defaultAlbum = albums.find(a => a.name.trim().toLowerCase() === 'algemeen');
      if (defaultAlbum) {
        if (!defaultAlbum.photos) defaultAlbum.photos = [];
        defaultAlbum.photos = [...defaultAlbum.photos, ...selectedAlbum.photos];
        
        return saveAlbum(defaultAlbum);
      }
    }).then(() => {
      // Proceed to delete selected album
      return deleteAlbum(selectedAlbum.id);
    }).then(() => {
      // Go back to list view
      document.getElementById('albumDetailView').style.display = 'none';
      document.getElementById('albumsListView').style.display = 'block';
      renderAlbums();
      if (isAdmin()) updateLastUpdatedTimestamp();
    }).catch(err => {
      console.error('Error deleting album and moving photos:', err);
    });
  } else {
    // Empty album: standard confirm
    if (!confirm(t('deleteConfirm'))) {
      return;
    }

    deleteAlbum(selectedAlbum.id).then(() => {
      document.getElementById('albumDetailView').style.display = 'none';
      document.getElementById('albumsListView').style.display = 'block';
      renderAlbums();
      if (isAdmin()) updateLastUpdatedTimestamp();
    }).catch(err => {
      console.error('Error deleting empty album:', err);
    });
  }
}

function ensureDefaultAlbumExists() {
  return getAlbums().then(albums => {
    const hasAlgemeen = albums.some(a => a.name.trim().toLowerCase() === 'algemeen');
    const hasHistorie = albums.some(a => a.name.trim().toLowerCase() === 'wennink historie');
    
    const promises = [];
    if (!hasAlgemeen) {
      promises.push(saveAlbum({
        name: 'Algemeen',
        photos: [],
        coverPhotoId: undefined
      }));
    }
    if (!hasHistorie) {
      promises.push(saveAlbum({
        name: 'Wennink Historie',
        photos: [],
        coverPhotoId: undefined
      }));
    }
    return Promise.all(promises);
  });
}

// ----------------------------------------------------
// Lightbox Photo Viewer
// ----------------------------------------------------
function openLightbox(photo, photosList = []) {
  currentLightboxPhotos = photosList.length > 0 ? photosList : [photo];
  const idx = currentLightboxPhotos.findIndex(p => p.id === photo.id);
  currentLightboxIndex = idx !== -1 ? idx : 0;

  openModal('lightboxModal');
  showLightboxPhoto(currentLightboxIndex);
}

function showLightboxPhoto(index) {
  if (!currentLightboxPhotos || currentLightboxPhotos.length === 0) return;
  if (index < 0 || index >= currentLightboxPhotos.length) return;
  
  currentLightboxIndex = index;
  const photo = currentLightboxPhotos[currentLightboxIndex];
  
  const img = document.getElementById('lightboxImg');
  img.src = photo.dataUrl;
  
  const dlBtn = document.getElementById('lightboxDownloadBtn');
  // Re-bind click
  const newDlBtn = dlBtn.cloneNode(true);
  dlBtn.parentNode.replaceChild(newDlBtn, dlBtn);
  newDlBtn.addEventListener('click', () => {
    downloadImage(photo.dataUrl, photo.filename);
  });
}

// ----------------------------------------------------
// History Document Rendering & Upload (MS-Word .docx & PDF)
// ----------------------------------------------------
function renderHistoryDoc() {
  const adminControls = document.getElementById('historyDocAdminControls');
  if (adminControls) {
    adminControls.style.display = isAdmin() ? 'flex' : 'none';
  }
  
  const adminListContainer = document.getElementById('adminHistoryFilesListContainer');
  if (adminListContainer) {
    adminListContainer.style.display = isAdmin() ? 'block' : 'none';
  }
  
  Promise.all([
    getSetting('historyDocuments'),
    getSetting('historyDocHtml')
  ]).then(([storedDocsJson, legacyHtml]) => {
    let docs = [];
    try {
      if (storedDocsJson) {
        docs = JSON.parse(storedDocsJson);
      }
    } catch(err) {
      console.error(err);
    }
    
    // Legacy migration check
    if (docs.length === 0 && legacyHtml) {
      docs = [{
        id: 'legacy-history',
        filename: 'Wennink Geschiedenis.docx',
        type: 'docx',
        content: legacyHtml,
        timestamp: Date.now() - 1000
      }];
    }
    
    const contentDiv = document.getElementById('historyDocContent');
    const tocContainer = document.getElementById('historyDocTOCContainer');
    const tocList = document.getElementById('historyDocTOC');
    const adminFilesList = document.getElementById('adminHistoryFilesList');
    
    if (!contentDiv) return;
    
    // Sort documents by timestamp (older first)
    docs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    
    if (docs.length === 0) {
      tocContainer.style.display = 'none';
      if (adminListContainer) adminListContainer.style.display = 'none';
      contentDiv.innerHTML = `<p class="no-data" data-i18n="noHistoryDocYet">${t('noHistoryDocYet')}</p>`;
      return;
    }
    
    // Render Table of Contents
    tocContainer.style.display = 'block';
    tocList.innerHTML = '';
    docs.forEach(doc => {
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.href = `#doc-${doc.id}`;
      link.textContent = doc.filename;
      link.style.color = 'var(--text-color)';
      link.style.textDecoration = 'underline';
      link.style.fontWeight = '500';
      link.style.cursor = 'pointer';
      
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetEl = document.getElementById(`doc-${doc.id}`);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth' });
        }
      });
      
      li.appendChild(link);
      tocList.appendChild(li);
    });
    
    // Render Admin Management List
    if (adminFilesList) {
      adminFilesList.innerHTML = '';
      docs.forEach(doc => {
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.alignItems = 'center';
        li.style.padding = '0.5rem 0.75rem';
        li.style.background = '#fff';
        li.style.borderRadius = '8px';
        li.style.border = '1px solid rgba(0,0,0,0.05)';
        li.style.fontSize = '0.9rem';
        
        li.innerHTML = `
          <span style="font-weight: 500; display:flex; align-items:center; gap:0.25rem;">
            <span>${doc.type === 'pdf' ? '📄' : '📝'}</span>
            ${doc.filename}
          </span>
          <button class="btn btn-danger delete-doc-btn" data-doc-id="${doc.id}" style="font-size: 0.8rem; padding: 0.25rem 0.5rem;">${t('deleteBtn')}</button>
        `;
        
        li.querySelector('.delete-doc-btn').addEventListener('click', () => {
          deleteHistoryDoc(doc.id);
        });
        
        adminFilesList.appendChild(li);
      });
      if (adminListContainer) {
        adminListContainer.style.display = isAdmin() ? 'block' : 'none';
      }
    }
    
    // Render Document Sections
    contentDiv.innerHTML = '';
    docs.forEach(doc => {
      const section = document.createElement('div');
      section.className = 'history-doc-section';
      section.id = `doc-${doc.id}`;
      section.style.marginBottom = '4rem';
      section.style.position = 'relative';
      section.style.borderBottom = '1px solid rgba(0,0,0,0.05)';
      section.style.paddingBottom = '2.5rem';
      
      section.innerHTML = `
        <h3 class="history-doc-section-title" style="font-size: 1.4rem; color: var(--text-color); margin-top: 0; margin-bottom: 1.2rem; border-bottom: 2px solid rgba(0,0,0,0.04); padding-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
          <span class="file-icon">${doc.type === 'pdf' ? '📄' : '📝'}</span>
          ${doc.filename}
        </h3>
        <div class="history-doc-body">
          ${doc.type === 'pdf' ? 
            `<iframe src="${doc.content}" width="100%" height="700px" style="border: none; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); background: #fff;"></iframe>` : 
            `<div class="word-document-content">${doc.content}</div>`
          }
        </div>
        <div style="display: flex; justify-content: flex-end; margin-top: 1.5rem;">
          <button class="btn btn-secondary back-to-top-btn" style="font-size: 0.85rem; padding: 0.4rem 0.8rem; display: flex; align-items: center; gap: 0.25rem;">
            ↑ <span>${t('backToTop')}</span>
          </button>
        </div>
      `;
      
      section.querySelector('.back-to-top-btn').addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      
      contentDiv.appendChild(section);
    });
  });
}

function handleHistoryDocUpload(e) {
  if (!isAdmin()) {
    alert(t('adminOnly'));
    return;
  }
  
  const file = e.target.files[0];
  if (!file) return;
  
  const isDocx = file.name.endsWith('.docx');
  const isPdf = file.name.endsWith('.pdf');
  
  if (!isDocx && !isPdf) {
    alert(t('historyInvalidFile'));
    e.target.value = '';
    return;
  }
  
  const reader = new FileReader();
  
  if (isDocx) {
    reader.onload = function(event) {
      const arrayBuffer = event.target.result;
      mammoth.convertToHtml({ arrayBuffer: arrayBuffer })
        .then(function(result) {
          const html = result.value;
          addHistoryDocument(file.name, 'docx', html);
          e.target.value = '';
        })
        .catch(function(err) {
          console.error(err);
          alert(t('historyUploadError') + ': ' + err.message);
          e.target.value = '';
        });
    };
    reader.readAsArrayBuffer(file);
  } else if (isPdf) {
    reader.onload = function(event) {
      const dataUrl = event.target.result;
      addHistoryDocument(file.name, 'pdf', dataUrl);
      e.target.value = '';
    };
    reader.readAsDataURL(file);
  }
}

function addHistoryDocument(filename, type, content) {
  getSetting('historyDocuments').then(storedDocsJson => {
    let docs = [];
    try {
      if (storedDocsJson) {
        docs = JSON.parse(storedDocsJson);
      }
    } catch(err) {
      console.error('Error parsing history documents:', err);
    }
    
    // Migration check: if no list exists but legacy HTML exists, import it first
    if (docs.length === 0) {
      getSetting('historyDocHtml').then(legacyHtml => {
        if (legacyHtml) {
          docs.push({
            id: 'legacy-history',
            filename: 'Wennink Geschiedenis.docx',
            type: 'docx',
            content: legacyHtml,
            timestamp: Date.now() - 1000 // slightly older
          });
        }
        
        appendAndSave();
      });
    } else {
      appendAndSave();
    }
    
    function appendAndSave() {
      const newDoc = {
        id: 'doc-' + Date.now(),
        filename: filename,
        type: type,
        content: content,
        timestamp: Date.now()
      };
      
      docs.push(newDoc);
      
      setSetting('historyDocuments', JSON.stringify(docs)).then(() => {
        alert(t('historyDocUploadSuccess'));
        renderHistoryDoc();
      });
    }
  });
}

function deleteHistoryDoc(id) {
  if (!isAdmin()) {
    alert(t('adminOnly'));
    return;
  }
  
  if (!confirm(t('deleteConfirm'))) {
    return;
  }
  
  getSetting('historyDocuments').then(storedDocsJson => {
    let docs = [];
    try {
      if (storedDocsJson) {
        docs = JSON.parse(storedDocsJson);
      }
    } catch(err) {
      console.error(err);
    }
    
    // Also check legacy if docs is empty and check if we are deleting it
    if (docs.length === 0 && id === 'legacy-history') {
      setSetting('historyDocHtml', '').then(() => {
        alert(t('historyDocDeleteSuccess'));
        renderHistoryDoc();
      });
      return;
    }
    
    const updatedDocs = docs.filter(d => d.id !== id);
    
    setSetting('historyDocuments', JSON.stringify(updatedDocs)).then(() => {
      if (id === 'legacy-history') {
        return setSetting('historyDocHtml', '');
      }
    }).then(() => {
      alert(t('historyDocDeleteSuccess'));
      renderHistoryDoc();
    });
  });
}

// ----------------------------------------------------
// Admin Tab Rendering
// ----------------------------------------------------
function renderAdmin() {
  getAllSettings().then(settings => {
    // Fill text inputs
    document.getElementById('adminLastDate').value = settings.lastReunionDate || '';
    document.getElementById('adminLastPlace').value = settings.lastReunionPlace || '';
    document.getElementById('adminNextDate').value = settings.nextReunionDate || '';
    document.getElementById('adminNextPlace').value = settings.nextReunionPlace || '';
    document.getElementById('adminUserGuideNl').value = settings.userGuideNl !== undefined ? settings.userGuideNl : t('defaultUserGuideNl');
    document.getElementById('adminUserGuideEn').value = settings.userGuideEn !== undefined ? settings.userGuideEn : t('defaultUserGuideEn');
    document.getElementById('adminHistoryNl').value = settings.historyNl !== undefined ? settings.historyNl : t('defaultHistoryNl');
    document.getElementById('adminHistoryEn').value = settings.historyEn !== undefined ? settings.historyEn : t('defaultHistoryEn');

    // Style elements
    document.getElementById('colorPrimary').value = settings.primaryColor || '#B2C9E4';
    document.getElementById('colorSecondary').value = settings.secondaryColor || '#E8F1FC';
    document.getElementById('colorHeader').value = settings.headerColor || '#7597C3';
    document.getElementById('colorText').value = settings.textColor || '#2B3A4F';
    document.getElementById('fontBodySelect').value = settings.bodyFont || 'Aptos, sans-serif';
    document.getElementById('fontHeaderSelect').value = settings.headerFont || 'Playfair Display, serif';
    document.getElementById('fontSizeInput').value = settings.bodyFontSize || '16px';

    // Load SMTP Settings
    document.getElementById('adminSmtpHost').value = settings.smtpHost || '';
    document.getElementById('adminSmtpPort').value = settings.smtpPort || '587';
    document.getElementById('adminSmtpSecure').checked = settings.smtpSecure === 'true' || settings.smtpSecure === true;
    document.getElementById('adminSmtpUser').value = settings.smtpUser || '';
    document.getElementById('adminSmtpPass').value = settings.smtpPass || '';
    document.getElementById('adminSmtpFrom').value = settings.smtpFrom || '';
  });
}

function handleSaveAdminSettings(e) {
  e.preventDefault();

  const settings = {
    lastReunionDate: document.getElementById('adminLastDate').value,
    lastReunionPlace: document.getElementById('adminLastPlace').value,
    nextReunionDate: document.getElementById('adminNextDate').value,
    nextReunionPlace: document.getElementById('adminNextPlace').value,
    userGuideNl: document.getElementById('adminUserGuideNl').value,
    userGuideEn: document.getElementById('adminUserGuideEn').value,
    historyNl: document.getElementById('adminHistoryNl').value,
    historyEn: document.getElementById('adminHistoryEn').value,
    primaryColor: document.getElementById('colorPrimary').value,
    secondaryColor: document.getElementById('colorSecondary').value,
    headerColor: document.getElementById('colorHeader').value,
    textColor: document.getElementById('colorText').value,
    bodyFont: document.getElementById('fontBodySelect').value,
    headerFont: document.getElementById('fontHeaderSelect').value,
    bodyFontSize: document.getElementById('fontSizeInput').value,
    
    // Save SMTP configurations
    smtpHost: document.getElementById('adminSmtpHost').value.trim(),
    smtpPort: document.getElementById('adminSmtpPort').value.trim(),
    smtpSecure: document.getElementById('adminSmtpSecure').checked,
    smtpUser: document.getElementById('adminSmtpUser').value.trim(),
    smtpPass: document.getElementById('adminSmtpPass').value.trim(),
    smtpFrom: document.getElementById('adminSmtpFrom').value.trim()
  };

  const promises = Object.entries(settings).map(([k, v]) => setSetting(k, v));

  Promise.all(promises).then(() => {
    updateTheme();
    return updateLastUpdatedTimestamp();
  }).then(() => {
    alert(t('savedSuccess'));
  });
}

function handleAdminImageUpload(e, settingKey) {
  const file = e.target.files[0];
  if (!file) return;

  readImageFile(file).then(dataUrl => {
    return setSetting(settingKey, dataUrl);
  }).then(() => {
    updateTheme();
    return updateLastUpdatedTimestamp();
  }).then(() => {
    alert(t('savedSuccess'));
  }).catch(err => {
    console.error('Image upload failed:', err);
  });
}

// Apply theme variables globally
function updateTheme() {
  getAllSettings().then(settings => {
    const root = document.documentElement;
    if (settings.primaryColor) root.style.setProperty('--primary-color', settings.primaryColor);
    if (settings.secondaryColor) root.style.setProperty('--secondary-color', settings.secondaryColor);
    if (settings.headerColor) root.style.setProperty('--header-color', settings.headerColor);
    if (settings.textColor) root.style.setProperty('--text-color', settings.textColor);
    if (settings.bodyFont) root.style.setProperty('--body-font', settings.bodyFont);
    if (settings.headerFont) root.style.setProperty('--header-font', settings.headerFont);
    
    // Apply body font size with user preference adjustment step
    const baselineStr = settings.bodyFontSize || '16px';
    const baseline = parseInt(baselineStr) || 16;
    const step = parseInt(getCookie('wennink_font_step')) || 0;
    const adjustedSize = baseline + (step * 2);
    root.style.setProperty('--body-font-size', adjustedSize + 'px');

    // Apply header crest image
    const crestContainer = document.getElementById('crestContainer');
    if (settings.familyCrest) {
      if (settings.familyCrest.startsWith('<svg')) {
        crestContainer.innerHTML = settings.familyCrest;
      } else {
        crestContainer.innerHTML = `<img src="${settings.familyCrest}" class="family-crest" alt="Familiewapen">`;
      }
    }

    // Refresh UI button states
    updateFontSizeButtons();
  });
}

function adjustFontSizeStep(delta) {
  const newStep = userFontSizeStep + delta;
  if (newStep >= -3 && newStep <= 3) {
    userFontSizeStep = newStep;
    setCookie('wennink_font_step', userFontSizeStep, 365);
    updateTheme();
  }
}

function updateFontSizeButtons() {
  const decBtn = document.getElementById('fontSizeDecBtn');
  const incBtn = document.getElementById('fontSizeIncBtn');
  if (decBtn && incBtn) {
    const step = parseInt(getCookie('wennink_font_step')) || 0;
    decBtn.disabled = (step <= -3);
    incBtn.disabled = (step >= 3);
  }
}

// ----------------------------------------------------
// Database Backup & Restore Handlers
// ----------------------------------------------------
function handleDatabaseExport() {
  exportDatabase().then(jsonStr => {
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wennink_family_database_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

function handleDatabaseImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    importDatabase(event.target.result).then(() => {
      alert(t('importSuccess'));
      location.reload();
    }).catch(err => {
      console.error(err);
      alert(t('importFailed'));
    });
  };
  reader.readAsText(file);
}

// ----------------------------------------------------
// Utility Functions
// ----------------------------------------------------
function updateLastUpdatedTimestamp() {
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  const dateStr = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}`;
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const ts = `${dateStr} ${timeStr}`;
  
  return setSetting('lastUpdated', ts).then(() => {
    document.querySelectorAll('.last-updated-val').forEach(el => el.textContent = ts);
  });
}

function parseDate(str) {
  // Parses DD-MM-YYYY format
  if (!str) return new Date(0);
  const parts = str.split('-');
  return new Date(parts[2], parts[1] - 1, parts[0]);
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

function compressImage(file, maxWidth = 1200, maxHeight = 1200, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const isHeic = file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif';

    if (isHeic && typeof heic2any === 'function') {
      console.log('Converting HEIC photo to JPEG:', file.name);
      heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: quality
      }).then(convertedBlob => {
        const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
        proceedWithCompression(blob, resolve, reject);
      }).catch(err => {
        console.error('HEIC conversion failed, falling back to normal read:', err);
        proceedWithCompression(file, resolve, reject);
      });
    } else {
      proceedWithCompression(file, resolve, reject);
    }
  });
}

function proceedWithCompression(blobOrFile, resolve, reject) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      const maxWidth = 1200;
      const maxHeight = 1200;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      resolve(dataUrl);
    };
    img.onerror = (err) => {
      console.warn('Image onload failed, falling back to original file read:', err);
      resolve(reader.result);
    };
    img.src = reader.result;
  };
  reader.onerror = (err) => reject(err);
  reader.readAsDataURL(blobOrFile);
}

function downloadImage(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Modal helper methods
function openModal(id) {
  const overlay = document.getElementById(id);
  if (overlay) {
    overlay.classList.add('active');
    const content = overlay.querySelector('.modal-content');
    if (content) {
      content.scrollTop = 0;
    }
  }
}

function closeModal(id) {
  const overlay = document.getElementById(id);
  if (overlay) overlay.classList.remove('active');
}

// ----------------------------------------------------
// User Invitation and Password Reset Handlers
// ----------------------------------------------------
async function handleInviteMemberClick() {
  const form = document.getElementById('memberForm');
  const email = form.email.value.trim();
  const firstname = form.firstname.value.trim();
  const insertion = form.insertion.value.trim();
  const lastname = form.lastname.value.trim();
  const fullName = `${firstname} ${insertion ? insertion + ' ' : ''}${lastname}`.trim();

  if (!email) {
    alert(t('enterEmailFirstAlert'));
    return;
  }

  const inviteLink = `${window.location.origin}${window.location.pathname}?invite=${encodeURIComponent(email)}`;

  const subject = currentLang === 'nl' 
    ? 'Uitnodiging: Familie Wennink Website' 
    : 'Invitation: Wennink Family Website';
  
  const text = currentLang === 'nl'
    ? `Beste ${fullName},\n\nU bent uitgenodigd om toegang te krijgen tot de Familie Wennink website.\n\nKlik op de onderstaande link om uw wachtwoord in te stellen:\n${inviteLink}\n\nMet vriendelijke groet,\nFamilie Wennink`
    : `Dear ${fullName},\n\nYou have been invited to access the Wennink Family website.\n\nClick the link below to set your password:\n${inviteLink}\n\nBest regards,\nWennink Family`;

  const settings = await getAllSettings();
  
  const statusBanner = document.getElementById('linkSimulationBanner');
  const simHref = statusBanner.querySelector('.link-sim-href');
  
  statusBanner.style.display = 'none';

  if (settings.smtpHost) {
    try {
      const response = await fetch('/api/send-tfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email,
          subject,
          text,
          smtpConfig: {
            host: settings.smtpHost,
            port: settings.smtpPort,
            secure: settings.smtpSecure,
            user: settings.smtpUser,
            pass: settings.smtpPass,
            from: settings.smtpFrom
          }
        })
      });
      const body = await response.json();
      if (response.ok && body.success) {
        alert(t('inviteSentAlert', { email }));
        closeModal('memberModal');
      } else {
        throw new Error(body.error || 'Unknown server error');
      }
    } catch (err) {
      console.error('Failed to send SMTP invite:', err);
      statusBanner.style.display = 'flex';
      simHref.textContent = inviteLink;
      simHref.href = inviteLink;
      alert(`${t('inviteSentAlert', { email })} (Simulated via top banner)`);
      closeModal('memberModal');
    }
  } else {
    statusBanner.style.display = 'flex';
    simHref.textContent = inviteLink;
    simHref.href = inviteLink;
    alert(`${t('inviteSentAlert', { email })} (Simulated via top banner)`);
    closeModal('memberModal');
  }
}

function openSetPasswordModal(email, type) {
  const title = document.getElementById('setPasswordTitle');
  const desc = document.getElementById('setPasswordDesc');
  
  document.getElementById('setPasswordEmail').value = email;
  document.getElementById('setPasswordType').value = type;
  document.getElementById('newPassword').value = '';
  document.getElementById('confirmPassword').value = '';

  if (type === 'invite') {
    title.textContent = currentLang === 'nl' ? 'Account Activeren' : 'Activate Account';
    desc.textContent = currentLang === 'nl' 
      ? `Welkom! Stel een wachtwoord in voor ${email} om toegang te krijgen tot de website.` 
      : `Welcome! Set a password for ${email} to access the website.`;
  } else {
    title.textContent = currentLang === 'nl' ? 'Wachtwoord Resetten' : 'Reset Password';
    desc.textContent = currentLang === 'nl' 
      ? `Stel een nieuw wachtwoord in voor ${email}.` 
      : `Set a new password for ${email}.`;
  }

  openModal('setPasswordModal');
}

async function handleSetPasswordSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('setPasswordEmail').value;
  const newPass = document.getElementById('newPassword').value;
  const confirmPass = document.getElementById('confirmPassword').value;

  if (newPass !== confirmPass) {
    alert(t('passwordMismatchAlert'));
    return;
  }

  try {
    await setPassword(email, newPass);
    alert(t('passwordSavedSuccess'));
    closeModal('setPasswordModal');
    checkAuthSession();
    switchTab('home');
  } catch (err) {
    console.error('Error setting password:', err);
    alert(err.message);
  }
}

function checkUrlQueryParams() {
  const urlParams = new URLSearchParams(window.location.search);
  const inviteEmail = urlParams.get('invite');
  const resetEmail = urlParams.get('reset');

  if (inviteEmail) {
    window.history.replaceState({}, document.title, window.location.pathname);
    openSetPasswordModal(inviteEmail, 'invite');
  } else if (resetEmail) {
    window.history.replaceState({}, document.title, window.location.pathname);
    openSetPasswordModal(resetEmail, 'reset');
  }
}
