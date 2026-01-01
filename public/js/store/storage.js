export function readSessionValue(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSessionValue(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // ignore session storage errors
  }
}

export function clearSessionValue(key) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore session storage errors
  }
}

export function readLocalValue(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocalValue(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore local storage errors
  }
}

export function clearLocalValue(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore local storage errors
  }
}
