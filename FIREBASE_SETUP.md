# Firebase Setup (Momentum)

Diese App ist eine reine Static-Web-App (HTML/CSS/JS, ES-Module).  
Sie nutzt **Firebase Authentication (Email/Passwort)** und **Cloud Firestore** im **Spark (gratis) Plan**.

## 1) Firebase Projekte (empfohlen: DEV + PROD)

Empfehlung: **zwei Firebase Projekte** anlegen:

- `momentum-dev` (Probe-/Demo-Daten, Tests)
- `momentum-prod` (echte Daten)

Das trennt Daten sauber und ist die übliche Vorgehensweise.

### 1.1 Projekt anlegen + Web-App registrieren

1. Firebase Console → **Add project**
2. Im Projekt: **Project settings** → **Your apps** → **Web-App hinzufügen**
3. Firebase zeigt dir eine `firebaseConfig` (apiKey, projectId, appId, …).  
   Diese Werte brauchst du für `firebase.config.js`.

## 2) Authentication (Email/Passwort) – nur Login, kein Signup

1. Firebase Console → **Build → Authentication**
2. Tab **Sign-in method** → **Email/Password aktivieren**
3. Tab **Users** → **Add user**  
   Lege dort die User manuell an (Email + Passwort).

Hinweis: Für Deployments auf eigener Domain musst du ggf. unter  
**Authentication → Settings → Authorized domains** deine Domain hinzufügen.

## 3) Firestore anlegen

1. Firebase Console → **Build → Firestore Database**
2. **Create database** → Mode: **Production mode** (nicht Test Mode)
3. Location wählen → fertig.

## 4) App konfigurieren

### 4.1 `firebase.config.js` ausfüllen

Öffne `firebase.config.js` und trage deine Konfigurationen ein:

- `FIREBASE_PROJECTS.prod = { ... }`
- `FIREBASE_PROJECTS.dev = { ... }`

### 4.2 DEV/PROD umschalten

Die App wählt die Umgebung so:

1. URL-Parameter `?env=dev` oder `?env=prod`
2. `localStorage["momentum.env"]`
3. Fallback `DEFAULT_ENV` in `firebase.config.js`

Du kannst in der UI (Login-Screen oder Topbar) zwischen DEV und PROD umschalten.

## 5) Firestore Datenmodell

Die App speichert pro User:

- `/users/{uid}/books/{bookId}`

Ein `book` Dokument enthält u.a.:

```json
{
  "title": "…",
  "author": "…",
  "totalPages": 320,
  "initialPage": 0,
  "createdAt": "2025-12-20T12:00:00.000Z",
  "history": [
    {"date":"2025-12-18","page":50},
    {"date":"2025-12-19","page":70}
  ]
}
```

**Wichtig:** Die Logik „Vergangenheit nachtragen / Einträge korrigieren“ bleibt erhalten,
weil `history` wie bisher vom Client gepflegt wird.

## 6) Demo-Daten (DEV)

In `app.js` gibt es weiterhin die Demo-Daten-Flags:

- `ENABLE_DEMO_DATA`
- `DEMO_OVERWRITE_EXISTING`
- `DEMO_ONLY_IN_DEV`

Wenn aktiviert, lädt die App Demo-Daten **nur in DEV**.

## 7) Security Rules (empfohlen)

Diese Rules sperren alles, außer der eingeloggte User greift auf seine eigenen Dokumente zu.  
Zusätzlich gibt es eine Basisschema-Validierung (Strings/Längen, Zahlenbereiche, history als Liste).

### Firestore Rules

```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn() {
      return request.auth != null;
    }

    function isOwner(userId) {
      return signedIn() && request.auth.uid == userId;
    }

    function isValidBook(data) {
      return data.keys().hasOnly(['title','author','totalPages','initialPage','createdAt','history','updatedAt'])
        && data.title is string && data.title.size() > 0 && data.title.size() <= 200
        && data.author is string && data.author.size() <= 200
        && data.totalPages is int && data.totalPages >= 1 && data.totalPages <= 100000
        && data.initialPage is int && data.initialPage >= 0 && data.initialPage <= data.totalPages
        && data.createdAt is string && data.createdAt.size() <= 40
        && data.history is list
        && data.history.size() <= 5000;
        // Hinweis: Vollständige Validierung jedes history-Items ist in Rules nur eingeschränkt möglich,
        // da es keine Schleifen über Listen gibt.
    }

    match /users/{userId} {
      allow read, write: if false; // direkter Zugriff auf user doc ist nicht nötig

      match /books/{bookId} {
        allow read: if isOwner(userId);
        allow create: if isOwner(userId) && isValidBook(request.resource.data);
        allow update: if isOwner(userId) && isValidBook(request.resource.data);
        allow delete: if isOwner(userId);
      }
    }
  }
}
```

## 8) Lokal starten

Firebase Auth/Firestore funktionieren **nicht zuverlässig über `file://`**.  
Starte einen lokalen Webserver:

```bash
python -m http.server 8080
# öffnen: http://localhost:8080/?env=dev
```

## 9) Deployment

- Hoste die Dateien z.B. auf Firebase Hosting oder einem beliebigen Static Host.
- Domain als Authorized Domain in Firebase Auth eintragen.
