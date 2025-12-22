// firebase.js
// Firebase bootstrap + Auth helpers + DEV/PROD environment switch.

import { FIREBASE_PROJECTS, DEFAULT_ENV, ENV_STORAGE_KEY } from "./firebase.config.js";

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

export function getEnv() {
  const url = new URL(window.location.href);
  const p = (url.searchParams.get("env") || "").toLowerCase();
  if (p === "dev" || p === "prod") return p;

  const ls = (localStorage.getItem(ENV_STORAGE_KEY) || "").toLowerCase();
  if (ls === "dev" || ls === "prod") return ls;

  return DEFAULT_ENV;
}

export function setEnv(env) {
  if (env !== "dev" && env !== "prod") throw new Error("Invalid env: " + env);
  localStorage.setItem(ENV_STORAGE_KEY, env);
}

export function toggleEnv() {
  const cur = getEnv();
  const next = cur === "prod" ? "dev" : "prod";
  setEnv(next);
  // Hard reload: ensures we re-init the correct Firebase project.
  window.location.reload();
}

export function getServices(env = getEnv()) {
  const cfg = FIREBASE_PROJECTS?.[env];
  if (!cfg || !cfg.apiKey || !cfg.projectId || !cfg.appId) {
    throw new Error(
      `Firebase config for env="${env}" is missing. Please fill firebase.config.js (FIREBASE_PROJECTS.${env}).`
    );
  }

  const appName = `momentum-${env}`;
  const apps = getApps();
  const app = apps.find(a => a.name === appName) ? getApp(appName) : initializeApp(cfg, appName);
  const auth = getAuth(app);
  const db = getFirestore(app);

  return { env, app, auth, db };
}

export function watchAuth(auth, cb) {
  return onAuthStateChanged(auth, cb);
}

export async function loginWithEmailPassword(auth, email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function logout(auth) {
  return signOut(auth);
}
