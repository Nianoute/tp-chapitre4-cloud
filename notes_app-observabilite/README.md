# TP Observabilité — Notes App

Implémentation d'une application Node.js/Express avec observabilité complète : **logs structurés**, **métriques Prometheus** et **health checks**.

## Table des matières

1. [Installation et lancement](#installation-et-lancement)
2. [Architecture d'observabilité](#architecture-dobservabilité)
3. [Partie 1 : Logger structuré (Pino)](#partie-1--logger-structuré-pino)
4. [Partie 2 : HTTP Logging (pino-http)](#partie-2--http-logging-pino-http)
5. [Partie 3 : Métriques Prometheus](#partie-3--métriques-prometheus)
6. [Partie 4 : Health Check](#partie-4--health-check)

---

## Installation et lancement

### Prérequis

- Docker et Docker Compose
- Node.js 18+ (pour développement local)

### Démarrage

```bash
# Installer les dépendances
npm install

# Lancer l'application avec Docker Compose
docker-compose up --build
```

L'API sera accessible sur `http://localhost:3000`.

### Variables d'environnement

```bash
LOG_LEVEL=info          # Niveau de log (debug, info, warn, error)
PORT=3000              # Port de l'API
DB_HOST=db             # Host PostgreSQL
DB_PORT=5432           # Port PostgreSQL
DB_NAME=notes_app      # Nom de la base de données
DB_USER=postgres       # Utilisateur PostgreSQL
DB_PASSWORD=secret     # Mot de passe PostgreSQL
```

---

## Architecture d'observabilité

L'observabilité implémentée repose sur trois piliers :

1. **Logs structurés** (Pino) : Logs JSON formatés de manière structurée
2. **Métriques** (Prometheus) : Temps de réponse et volume de requêtes
3. **Health checks** : Vérification de l'état du service et de la base de données

### Fichiers clés

- `src/logger.js` → Configuration du logger Pino
- `src/metrics.js` → Collecte des métriques Prometheus
- `src/app.js` → Application Express avec middlewares d'observabilité
- `src/server.js` → Démarrage du serveur
- `src/db.js` → Gestion de la connexion PostgreSQL

---

## Partie 1 : Logger structuré (Pino)

### Objectif
Remplacer `console.log` par des logs structurés en JSON avec Pino.

### Implémentation

**Fichier : `src/logger.js`**

```javascript
import pino from "pino";

const logLevel = process.env.LOG_LEVEL || "info";

export const logger = pino({
  level: logLevel,
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
    },
  },
});
```

**Utilisation dans le code :**

```javascript
logger.info("Fetching all notes");
logger.warn("Note creation failed: title is required", { title });
logger.error("Database not reachable after retries");
```

### Questions théoriques

#### Q1. À quoi ressemblent les logs produits par Pino ?

**Réponse :**
Les logs de Pino sont émis en JSON structuré :

```json
{"level":30,"time":1712966400000,"pid":1234,"hostname":"api","msg":"Note created","id":5}
```

Avec pino-pretty (pour développement), ils s'affichent de manière lisible :

```
[13:36:40] INFO: Note created
  id: 5
```

#### Q2. En quoi ce format diffère-t-il d'un console.log classique ?

**Réponse :**

| Aspect | console.log | Pino JSON |
|--------|-------------|-----------|
| Format | Texte libre | JSON structuré |
| Recherche/Filtrage | Difficile (regex) | Facile (filtre sur champ) |
| Parsing | Impossible | Automatique |
| Métadonnées | Non | Oui (pid, hostname, timestamp précis) |
| Contexte | Difficile à préserver | Automatique par contexte |
| Agrégation | Compliquée | Triviale |

#### Q3. Que se passe-t-il avec LOG_LEVEL=warn ?

**Réponse :**

Avec `LOG_LEVEL=warn` :

- ✅ **Affichés** : Logs `warn` et `error`
- ❌ **Supprimés** : Logs `debug` et `info`

Résultat : Seules les situations anormales s'affichent.

```bash
LOG_LEVEL=warn npm start
# Affichera uniquement les avertissements et erreurs
```

#### Q4. Pourquoi ne peut-on pas stocker ces logs sur le cloud ?

**Réponse :**

Impossibilité de stocker directement in-memory les logs sur le cloud :
- **Perte de données** : Si l'application crash, les logs en mémoire disparaissent
- **Pas de persistance** : Chaque conteneur a son propre système de fichiers éphémère
- **Scalabilité** : Impossible de corréler les logs entre plusieurs instances

**Solution :** Utiliser un système centralisé (ELK, CloudWatch, Datadog, etc.)

#### Q5. Quelle information dans les logs peut servir à la corrélation (style OTel) ?

**Réponse :**

Pino génère un **`pid`** (Process ID) et un **`req_id`** (via pino-http) qui permettent de corréler une requête unique. Avec OpenTelemetry, on ajouterait un `trace_id` global.

---

## Partie 2 : HTTP Logging (pino-http)

### Objectif
Enrichir les logs avec le contexte HTTP de chaque requête.

### Implémentation

**Dans `src/app.js` :**

```javascript
import pinoHttp from "pino-http";

app.use(
  pinoHttp(
    {
      logger,
      customSuccessMessage: (req, res) => 
        `${req.method} ${req.url} - ${res.statusCode}`,
      customErrorMessage: (req, res, error) => 
        `${req.method} ${req.url} - ${res.statusCode}`,
      customLogLevel: (req, res) => {
        if (res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      },
    },
    logger,
  ),
);
```

### Questions théoriques

#### Q1. Logs sans configuration : quels champs apparaissent ?

**Réponse :**

Par défaut, pino-http fournit :

```json
{
  "level": 30,
  "time": 1712966400000,
  "pid": 1234,
  "req": {
    "id": 1,
    "method": "GET",
    "url": "/notes",
    "remoteAddress": "127.0.0.1",
    "userAgent": "curl/7.64.1"
  },
  "res": {
    "statusCode": 200,
    "responseTime": 45.23
  },
  "msg": "request completed"
}
```

#### Q2. Quelles informations manquent pour diagnostiquer une requête en erreur ?

**Réponse :**

Sans configuration additionnelle, manquent :
- ❌ Message d'erreur explicite (pourquoi a échoué ?)
- ❌ Validation du corps de la requête
- ❌ Distinction 400 (erreur client) vs 500 (erreur serveur)
- ❌ Raison métier de l'erreur

#### Q3. Logs avec erreur métier (e.g., "title required")

**Réponse :**

```json
{
  "level": 30,
  "time": 1712966400000,
  "method": "POST",
  "url": "/notes",
  "statusCode": 400,
  "msg": "title is required",
  "title": null
}
```

#### Q4. Logs avec ressource not found (404)

**Réponse :**

```json
{
  "level": 30,
  "time": 1712966400000,
  "method": "GET",
  "url": "/notes/999",
  "statusCode": 404,
  "msg": "Note not found",
  "id": "999"
}
```

#### Q5. Niveaux de log par code HTTP

**Réponse :**

| Code | Niveau | Raison |
|------|--------|--------|
| 2xx  | `info` | Succès normal |
| 4xx  | `warn` | Erreur client (validation, non-trouvé) |
| 5xx  | `error` | Erreur serveur (critique) |

Cette distinction permet de filtrer les vrais problèmes (erreurs 5xx).

---

## Partie 3 : Métriques Prometheus

### Objectif
Exposer des métriques temps réel exploitables par Prometheus.

### Implémentation

**Fichier : `src/metrics.js`**

```javascript
import promClient from "prom-client";

// Collecte des métriques par défaut du process
promClient.collectDefaultMetrics();

// Counter : volume total de requêtes
export const httpRequestsTotal = new promClient.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status"],
});

// Histogram : distribution des temps de réponse
export const httpRequestDuration = new promClient.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status"],
  buckets: [0.001, 0.01, 0.1, 0.5, 1, 2, 5],
});

// Middleware pour tracker les métriques
export function metricsMiddleware() {
  return (req, res, next) => {
    const start = Date.now();
    const originalEnd = res.end;
    
    res.end = function (...args) {
      const duration = (Date.now() - start) / 1000;
      const route = req.route?.path || req.path;
      const status = res.statusCode;

      httpRequestsTotal.labels(req.method, route, status).inc();
      httpRequestDuration.labels(req.method, route, status).observe(duration);

      originalEnd.apply(res, args);
    };
    next();
  };
}
```

### Questions théoriques

#### Q1. Métriques sans requêtes : qu'est-ce qui apparaît déjà ?

**Réponse :**

Consultez l'endpoint `/metrics` :

```
# Métriques du process Node.js
process_cpu_seconds_total 2.345
process_resident_memory_bytes 65536000
process_uptime_seconds 1234.56
nodejs_heap_size_total_bytes 2147483648
nodejs_eventloop_delay_seconds_bucket{le="0.001"} 5
```

Ces métriques viennent de `collectDefaultMetrics()` qui enregistre les données du process automatiquement.

#### Q2. Counter reqêtes HTTP après appels

**Réponse :**

```
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",route="/notes",status="200"} 2
http_requests_total{method="POST",route="/notes",status="201"} 1
http_requests_total{method="GET",route="/notes/:id",status="200"} 1
http_requests_total{method="GET",route="/notes/:id",status="404"} 1
http_requests_total{method="GET",route="/metrics",status="200"} 3
```

Labels affichés : `method`, `route`, `status`

#### Q3. Counter vs Histogram

**Réponse :**

| Type | Cas d'usage | Exemple |
|------|-------------|---------|
| **Counter** | Compter les événements | "J'ai eu 100 requêtes" |
| **Histogram** | Mesurer une distribution | "99% des requêtes < 100ms" |

Pour le temps de réponse, Histogram est meilleur car il fournit **percentiles** et **moyennes**, pas juste le total.

#### Q4. Comment le middleware sait que la requête est terminée ?

**Réponse :**

Le middleware **wrapper** `res.end()` pour capturer le moment où Express ferme la connexion. C'est le seul signal fiable de fin de requête.

```javascript
const originalEnd = res.end;
res.end = function (...args) {
  // La requête est terminée maintenant !
  recordMetric();
  originalEnd.apply(res, args);
};
```

#### Q5. Trois approches pour mesurer le temps de réponse

**Réponse :**

1. **Wrapper sur `res.end()` (✅ UTILISÉE)**
   - ✅ Capture le vrai moment de fin
   - ✅ Inclut l'I/O DB
   - ⚠️ Peu invasive

2. **Via un middleware `next()`**
   - ❌ Mesure mal (ne capture pas toute la durée)
   - ❌ Requêtes async échouées

3. **Via `res.on('finish')`**
   - ✅ Fiable
   - ✅ Moins invasive
   - ❌ Peut ne pas se déclencher sur tous les types d'erreurs

**Classement : Wrapper > res.on('finish') > middleware next()**

---

## Partie 4 : Health Check

### Objectif
Signaler l'état du service à un orchestrateur (Kubernetes, load balancer, etc.).

### Implémentation

**Dans `src/app.js` :**

```javascript
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({
      status: "OK",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error("Health check failed: database connection error", {
      error: err.message,
    });
    res.status(503).json({
      status: "ERROR",
      database: "disconnected",
      timestamp: new Date().toISOString(),
    });
  }
});
```

**Accès :**

```bash
curl http://localhost:3000/health
```

### Questions théoriques

#### Q1. Réponses quand tout fonctionne

**Réponse :**

Endpoint `/health` (tout OK) :
```json
HTTP 200 OK
{
  "status": "OK",
  "database": "connected",
  "timestamp": "2024-04-12T14:36:40Z"
}
```

Endpoint `/metrics` :
```
process_uptime_seconds 1234.56
http_requests_total{...} 42
...
```

#### Q2. Réponses quand la DB est down

**Réponse :**

```json
HTTP 503 Service Unavailable
{
  "status": "ERROR",
  "database": "disconnected",
  "timestamp": "2024-04-12T14:36:41Z"
}
```

**Les codes HTTP changent** : 200 → 503. C'est crucial !

#### Q3. Importance du code HTTP (vs JSON)

**Réponse :**

- **Pourquoi pas juste le JSON ?**
  - Un load balancer regarde **le code HTTP** (pas le JSON !)
  - Kubernetes évalue la `readinessProbe` via le **status code**
  - Impossible de réagir automatiquement au JSON seul

**Exemple Kubernetes :**
```yaml
readinessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10
```

Kubernetes relance le pod si le status n'est pas 200-299.

#### Q4. Différence livenessProbe vs readinessProbe

**Réponse :**

| Probe | Objectif | Réaction | Endpoint |
|-------|----------|----------|----------|
| **Liveness** | "L'app répond ?" | Redémarrer le pod | `/health` simple |
| **Readiness** | "Prêt à recevoir ?" | Retirer du load balancer | `/health` + DB check |

**Notre implémentation** = **readinessProbe** (inclut la BD)

---

## Guide d'utilisation

### Tester les logs

```bash
# Niveau INFO (défaut)
npm start

# Obtenir seulement les avertissements
LOG_LEVEL=warn npm start

# Obtenir tous les détails
LOG_LEVEL=debug npm start
```

### Tester les métriques

```bash
# Faire quelques requêtes
curl http://localhost:3000/notes

# Consulter les métriques
curl http://localhost:3000/metrics | grep http_requests_total
```

### Tester le health check

```bash
# Quand tout fonctionne
curl -i http://localhost:3000/health

# Simuler une DB down (arrêter PostgreSQL)
# Puis réessayer
curl -i http://localhost:3000/health
```

---

## Endpoints disponibles

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/notes` | Récupérer toutes les notes |
| POST | `/notes` | Créer une note |
| GET | `/notes/:id` | Récupérer une note |
| PUT | `/notes/:id` | Modifier une note |
| DELETE | `/notes/:id` | Supprimer une note |
| GET | `/health` | Health check (inclut DB) |
| GET | `/metrics` | Métriques Prometheus |

---

## Technologies utilisées

- **Express.js** : Framework web
- **Pino** : Logger structuré JSON
- **pino-http** : Middleware HTTP logging
- **prom-client** : Client Prometheus
- **PostgreSQL** : Base de données
- **Docker** : Containerisation

---

## Observabilité en production

### Pour les logs

Utiliser un système centralisé :
- **ELK Stack** (Elasticsearch, Logstash, Kibana)
- **Datadog**
- **CloudWatch** (AWS)
- **GCP Logging**

### Pour les métriques

- **Prometheus** : Scraper `/metrics` toutes les 15 secondes
- **Grafana** : Visualiser les métriques
- **Alertes** : Si les requêtes > 5s en moyenne

### Pour la haute disponibilité

- **Kubernetes** : Utiliser les `readinessProbe` et `livenessProbe`
- **Load balancer** : Vérifier `/health` régulièrement

---

## Notes supplémentaires

- Les logs JSON complètent les métriques (contexte vs quantitatif)
- Les health checks réagissent VITE aux problèmes (vs métriques qui sont réactives)
- Pino est pensé pour la production (low overhead)
