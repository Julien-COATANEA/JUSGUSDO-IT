# JuGus Do-It — Guide de déploiement Railway

## 1. Créer le projet Railway

1. Va sur [railway.app](https://railway.app) et crée un projet
2. Ajoute un service **PostgreSQL** depuis le dashboard
3. Ajoute un service **Node.js/Web** (GitHub ou upload manuel)

## 2. Variables d'environnement

Dans ton service Node.js sur Railway, ajoute ces variables :

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | Copie depuis le service PostgreSQL Railway (onglet "Connect") |
| `JWT_SECRET` | Une chaîne aléatoire longue (ex: `openssl rand -hex 32`) |
| `NODE_ENV` | `production` |
| `PORT` | Railway injecte automatiquement, ne pas le mettre manuellement |

## 3. Initialiser la base de données

Une fois le service PostgreSQL lancé, exécute le schéma SQL :

```bash
# Depuis Railway CLI ou le Query Editor dans le dashboard
psql $DATABASE_URL < server/db/schema.sql
```

Ou copie-colle le contenu de `server/db/schema.sql` dans l'éditeur SQL de Railway.

## 4. Créer le premier admin

Après avoir créé un compte via l'interface, transforme-le en admin :

```sql
UPDATE users SET is_admin = TRUE WHERE username = 'ton_username';
```

## 5. Déployer

```bash
# Installer les dépendances
npm install

# Démarrer en production
npm start
```

Railway détecte automatiquement `npm start` depuis le `package.json`.

## 6. Développement local

```bash
# Copier le fichier d'environnement
cp .env.example .env
# Remplir .env avec tes valeurs locales

# Démarrer en mode dev (avec rechargement automatique)
npm run dev
```
