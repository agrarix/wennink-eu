// auth.js - Authentication, TFA, and Password Reset controller

import { getMembers, saveMember, getSetting, setSetting } from './db.js';

let currentUser = null;
let currentTfaCode = null;
let currentTfaEmail = null;
let failedAttemptsMap = {};

// Read session from sessionStorage to survive page refreshes
const sessionUser = sessionStorage.getItem('wennink_session_user');
if (sessionUser) {
  currentUser = JSON.parse(sessionUser);
}

export async function login(email, password) {
  const adminEmail = 'pjheise@gmail.com';
  const adminPass = 'admin123';
  const userEmail = 'user@wennink.nl';
  const userPass = 'user123';

  // Normalize
  const normEmail = email.trim().toLowerCase();

  // If already locked out (attempts >= 3)
  if (failedAttemptsMap[normEmail] >= 3) {
    return {
      status: 'failed',
      attempts: failedAttemptsMap[normEmail],
      maxAttemptsReached: true
    };
  }

  // Get custom passwords from settings
  let customAdminPass = adminPass;
  let customUserPass = userPass;
  try {
    const customAdmin = await getSetting('admin_custom_password');
    const customUser = await getSetting('user_custom_password');
    if (customAdmin) customAdminPass = customAdmin;
    if (customUser) customUserPass = customUser;
  } catch (err) {
    console.error('Error reading settings for custom passwords:', err);
  }

  // Validate credentials
  let role = null;
  if (normEmail === adminEmail && password === customAdminPass) {
    role = 'admin';
  } else if (normEmail === userEmail && password === customUserPass) {
    role = 'user';
  } else {
    // Check dynamic users in IndexedDB
    try {
      const members = await getMembers();
      const member = members.find(m => m.email && m.email.trim().toLowerCase() === normEmail);
      if (member && member.password && member.password === password) {
        role = 'user';
      }
    } catch (err) {
      console.error('Error fetching members during login:', err);
    }
  }

  if (!role) {
    failedAttemptsMap[normEmail] = (failedAttemptsMap[normEmail] || 0) + 1;
    const maxAttemptsReached = failedAttemptsMap[normEmail] >= 3;
    return {
      status: 'failed',
      attempts: failedAttemptsMap[normEmail],
      maxAttemptsReached
    };
  }

  // Credentials are correct, reset failed attempts
  failedAttemptsMap[normEmail] = 0;

  // Check if browser is trusted
  const isTrusted = localStorage.getItem(`trustedBrowser_${normEmail}`) === 'true';

  if (isTrusted) {
    // Directly log in
    currentUser = { email: normEmail, role };
    sessionStorage.setItem('wennink_session_user', JSON.stringify(currentUser));
    return { status: 'success', user: currentUser };
  } else {
    // Generate 5-digit TFA code - Temporarily set to '12345' for debugging
    currentTfaCode = '12345';
    currentTfaEmail = normEmail;
    
    return {
      status: 'tfa_required',
      email: normEmail,
      role: role,
      code: currentTfaCode // Expose code to show on screen for user testing
    };
  }
}

export function verifyTFA(code, trustBrowser) {
  if (!currentTfaCode || !currentTfaEmail) {
    return { success: false, message: 'No TFA session active.' };
  }

  if (code.trim() === currentTfaCode) {
    const role = currentTfaEmail === 'pjheise@gmail.com' ? 'admin' : 'user';
    currentUser = { email: currentTfaEmail, role };
    sessionStorage.setItem('wennink_session_user', JSON.stringify(currentUser));

    if (trustBrowser) {
      localStorage.setItem(`trustedBrowser_${currentTfaEmail}`, 'true');
    }

    // Reset TFA variables
    currentTfaCode = null;
    currentTfaEmail = null;

    return { success: true, user: currentUser };
  } else {
    return { success: false, message: 'Invalid TFA code.' };
  }
}

export function logout() {
  const wasAdmin = isAdmin();
  currentUser = null;
  sessionStorage.removeItem('wennink_session_user');
  currentTfaCode = null;
  currentTfaEmail = null;
  return wasAdmin; // Return true if admin logged out, to update timestamp
}

export function isAuthenticated() {
  return currentUser !== null;
}

export function isAdmin() {
  return currentUser && currentUser.role === 'admin';
}

export function getCurrentUser() {
  return currentUser;
}

export function getFailedAttempts(email) {
  if (email) {
    return failedAttemptsMap[email.trim().toLowerCase()] || 0;
  }
  const values = Object.values(failedAttemptsMap);
  return values.length > 0 ? Math.max(...values) : 0;
}

export function resetFailedAttempts(email) {
  if (email) {
    failedAttemptsMap[email.trim().toLowerCase()] = 0;
  } else {
    failedAttemptsMap = {};
  }
}

export async function setPassword(email, password) {
  const normEmail = email.trim().toLowerCase();
  
  if (normEmail === 'pjheise@gmail.com') {
    await setSetting('admin_custom_password', password);
  } else if (normEmail === 'user@wennink.nl') {
    await setSetting('user_custom_password', password);
  } else {
    const members = await getMembers();
    const member = members.find(m => m.email && m.email.trim().toLowerCase() === normEmail);
    if (!member) {
      throw new Error('Email not found in members directory.');
    }
    member.password = password;
    await saveMember(member);
  }

  // Reset failed attempts for this email
  failedAttemptsMap[normEmail] = 0;

  // Automatically log in the user after setting the password
  const role = normEmail === 'pjheise@gmail.com' ? 'admin' : 'user';
  currentUser = { email: normEmail, role };
  sessionStorage.setItem('wennink_session_user', JSON.stringify(currentUser));
  return currentUser;
}
