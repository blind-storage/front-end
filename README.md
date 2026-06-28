# Blind Storage — Frontend

Interface web Zero Knowledge pour le stockage chiffré de fichiers. Toute la cryptographie s'exécute dans le navigateur via la **Web Crypto API** — le serveur ne reçoit jamais le mot de passe maître ni les clés privées en clair.

## Principe de fonctionnement

Le frontend est le seul composant qui manipule les données sensibles en clair. La clé privée RSA déchiffrée est conservée **uniquement en mémoire RAM** (React Context) et n'est jamais persistée sur disque ou dans `localStorage`. Un rechargement de page efface la clé privée : l'utilisateur doit resaisir son mot de passe maître.

| Ce qui est persisté (localStorage) | Ce qui reste en RAM uniquement |
|---|---|
| JWT (`blind_token`) | Clé privée RSA déchiffrée |
| `salt_mp`, `salt_rc` (par username) | KEK_1 (AES-GCM-256) |
| — | FEK, TEK en clair |

## Stack technique

| Couche | Technologie |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19 + Tailwind CSS 4 |
| Cryptographie | Web Crypto API (natif navigateur) |
| Types partagés | `@blind-storage/types` (package local) |
| QR Code | qrcode |

---

## Structure du projet

```
front-end/
├── app/                  # Pages Next.js (App Router)
│   ├── (auth)/           # Pages publiques : login, register
│   └── (app)/            # Pages protégées : dashboard, settings
├── components/           # Composants React réutilisables
├── context/
│   └── auth.tsx          # AuthContext — token, user, privateKey (RAM)
└── lib/
    ├── crypto.ts         # Toute la cryptographie (Web Crypto API)
    ├── api.ts            # Client HTTP vers le backend
    └── storage.ts        # Helpers localStorage (token, sels)
```

### `lib/crypto.ts` — fonctions principales

| Fonction | Description |
|---|---|
| `deriveMasterKeys(password, salt_mp)` | PBKDF2 → 512 bits → KEK_1 (AES-GCM) + auth_hash |
| `deriveRecoveryKey(rc, salt_rc)` | PBKDF2 → 256 bits → KEK_2 (AES-GCM) |
| `generateKeyPair()` | RSA-OAEP 2048 bits (SHA-256) |
| `encryptPrivateKey(privKey, kek)` | AES-GCM(kek, PKCS8) → `base64(iv):base64(ct)` |
| `decryptPrivateKey(encrypted, kek)` | Inverse — retourne une `CryptoKey` |
| `generateTEK()` | AES-GCM-256 aléatoire (pour l'arbre ou les fichiers) |
| `encryptTEK(tek, pubKey)` | RSA-OAEP(pubKey, raw TEK) → base64 |
| `aesEncrypt(key, data)` | AES-GCM → `base64(iv):base64(ct)` |
| `aesDecrypt(key, encoded)` | AES-GCM ← `base64(iv):base64(ct)` |
| `generateRecoveryCode()` | 128 bits CSPRNG → format `XXXX-XXXX×8` |
| `generateSalt()` | 32 octets CSPRNG |

---

## Démarrage rapide

### Prérequis

- Node.js ≥ 20
- Backend Blind Storage démarré (par défaut sur `http://localhost:3000`)

### Installation

```bash
cd front-end
npm install
```

### Lancer en développement

```bash
npm run dev
# → http://localhost:8000
```

### Build de production

```bash
npm run build
npm start
```

### Variable d'environnement

| Variable | Description | Défaut |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | URL du backend NestJS | `http://localhost:3000` |

---

## Flux d'authentification

### Inscription

1. L'utilisateur saisit un mot de passe maître (MP).
2. `deriveMasterKeys(MP, salt_mp)` → `KEK_1` (en mémoire) + `auth_hash` (envoyé au serveur).
3. `generateRecoveryCode()` → RC affiché **une seule fois**, à conserver hors ligne.
4. `deriveRecoveryKey(RC, salt_rc)` → `KEK_2`.
5. `generateKeyPair()` → paire RSA-OAEP 2048 bits.
6. `encryptPrivateKey(privKey, KEK_1)` → `priv_key_enc_1`.
7. `encryptPrivateKey(privKey, KEK_2)` → `priv_key_enc_2`.
8. `generateTEK()` + `encryptTEK(tek, pubKey)` → `tree_enc_key`.
9. `POST /users` avec tous les artefacts chiffrés.

### Connexion locale

1. Lecture de `salt_mp` depuis `localStorage`.
2. `deriveMasterKeys(MP, salt_mp)` → `KEK_1` (en mémoire) + `auth_hash`.
3. `POST /auth/login { username, password: auth_hash }`.
4. JWT stocké dans `localStorage`, `KEK_1` reste en RAM.

### Connexion OIDC (Google / Rezel / Dropbox)

1. Redirection vers le fournisseur → callback → `pending_token`.
2. `POST /auth/oidc/challenge` → `encrypted_challenge` + `priv_key_enc_1`.
3. L'utilisateur saisit son MP → `KEK_1` → déchiffre `priv_key_enc_1` → clé privée RSA.
4. RSA-OAEP déchiffre `encrypted_challenge` → nonce.
5. `POST /auth/oidc/verify { nonce_token, plaintext }` → JWT complet.

---

## Sécurité

- **Clé privée en mémoire uniquement** : la `CryptoKey` non-extractable est détruite au rechargement.
- **Aucun secret dans `localStorage`** : seuls le JWT et les sels (non secrets) y sont stockés.
- **`auth_hash` ≠ mot de passe** : le serveur ne reçoit jamais le MP — uniquement un dérivé PBKDF2 à 600 000 itérations.
- **IV unique par chiffrement** : chaque appel `aesEncrypt` génère un IV de 96 bits par CSPRNG.
- **Isolation des clés** : KEK_1, KEK_2, TEK, FEK sont des clés distinctes à usage limité.

---

## Contributeurs

- **Thomas Cadegros** — Étudiant cycle ingénieur cybersécurité, Télécom Paris — [thomas.cadegros@telecom-paris.fr](mailto:thomas.cadegros@telecom-paris.fr)
- **Amine Slaoui** — Étudiant cycle ingénieur cybersécurité, Télécom Paris — [amine.slaoui@telecom-paris.fr](mailto:amine.slaoui@telecom-paris.fr)
