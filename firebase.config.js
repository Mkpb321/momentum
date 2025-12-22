// firebase.config.js
// Trage hier deine Firebase Web-App Konfigurationen ein.
// Empfehlung: 2 Firebase Projekte (DEV + PROD), jeweils im Spark (gratis) Plan.
// Wenn du nur 1 Projekt nutzen willst, kannst du prod und dev auf die gleiche Config setzen,
// dann sind DEV/PROD nur logisch getrennt (nicht echte Isolation).

export const FIREBASE_PROJECTS = {
  prod: {
    apiKey: "AIzaSyDCY8U13fv4NsNTJuEoa8QJma4MduYdTWs",
    authDomain: "momentum-prod-e1882.firebaseapp.com",
    projectId: "momentum-prod-e1882",
    storageBucket: "momentum-prod-e1882.firebasestorage.app",
    messagingSenderId: "997699362484",
    appId: "1:997699362484:web:2ca50b07a3415b2cca01e1"
  },
  dev: {
    apiKey: "AIzaSyAHQ5MacGOgLAnM6KNWOeAL4hb9CkaQPgA",
    authDomain: "momentum-dev-7e5fa.firebaseapp.com",
    projectId: "momentum-dev-7e5fa",
    storageBucket: "momentum-dev-7e5fa.firebasestorage.app",
    messagingSenderId: "262554294380",
    appId: "1:262554294380:web:85046fde648cbcac2de049"
  }
};

// Fallback, wenn weder URL-Parameter noch localStorage gesetzt sind.
export const DEFAULT_ENV = "prod";

// localStorage Key für die Env-Auswahl
export const ENV_STORAGE_KEY = "momentum.env";
