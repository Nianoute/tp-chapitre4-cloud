# TP — Observabilité (Logs + Metrics + Health) — Node/Express/Postgres (Docker)

## Partie 1 — Remplacer `console.log` par un logger (Pino)

> Objectif : passer de “texte brut” à **logs structurés JSON**.

### Travail demandé

* Installer [Pino](https://getpino.io/#/)
* Créer un logger
  * Création du fichier `src/logger.js`
  * Exposition d'une fonction `logger` qui pourra être utilisée dans toute l'application et génère des JSON de log
* Utiliser le logger
  * Remplacer dans le code les `console.log` par `logger`
* Comparer avec `console.log`

### Niveaux de logs
- `info` pour le flux normal
- `warn` si un param est suspect
- `error` pour exception/500

Tester en changeant `LOG_LEVEL=warn` dans les variables d'environements.

### Questions théoriques

1. Montrez les logs produit par `logger`, à quoi ressemble-t-il ?
2. En quoi ce format diffère-t-il d'un `console.log` classique ?
3. Que se passe-t-il si vous passez `LOG_LEVEL=warn` ? Quels logs disparaissent et pourquoi ?
4. Pourquoi ne peut-on pas stocker ces logs dans un fichier sur le cloud ?
5. Y a-t-il une information, dans les logs fournis par pino, que l'on pourrait utiliser pour corréler nos logs comme le ferait OTel ?

## Partie 2 — Utiliser `pino-http` pour logger les requêtes HTTP

> Objectif : enrichir les logs avec le contexte HTTP de chaque requête et réponse.

### Travail demandé

* Installer et brancher le middleware [`pino-http`](https://github.com/pinojs/pino-http) dans `app.js`
* Sans configuration, le middleware ne fournit pas d'informations précises sur l'issue d'une requête. En vous appuyant sur la documentation, personnaliser son comportement pour :
  * Identifier si une requête a échoué (e.g. règle métier `title required`)
  * Inclure un message explicite décrivant la raison de l'échec
  * Adapter le niveau de log au statut HTTP de la réponse

### Questions théoriques

1. Montrez les logs produit par `pino-http` sans configuration, quels champs apparaissent ?
2. Quelles informations manquent pour diagnostiquer une requête en erreur ?
3. Montrer les logs obtenus lors d'un appel échoué à cause d'une règle métier, qu'est-ce qui a changé ?
4. Et maintenant ceux d'une `ressource not found`
5. Quel niveau de log est utilisé pour une réponse `400` ? Pour une `200` ? Pourquoi cette distinction est-elle utile ?

## Partie 3 — Metrics Prometheus dans une API Node.js

> Objectif : Instrumenter une API Node.js pour exposer des métriques exploitables par Prometheus.

### Travail demandé

À l’aide de la bibliothèque Node.js [prom-client](https://github.com/siimon/prom-client) :

* Créer un module dédié aux métriques
* Collecter les métriques techniques par défaut du process
* Ajouter au moins :
  * une métrique représentant le volume total de requêtes HTTP
  * une métrique représentant la distribution des temps de réponse
* Ces métriques doivent être segmentées par :
  * méthode HTTP
  * route
  * code de statut
* Brancher un middleware qui met à jour ces métriques à la fin du traitement de chaque requête
* Exposer un endpoint `/metrics`

### Questions théoriques

1. Appelez `/metrics` sans avoir fait d’autres requêtes, quelles métriques apparaissent déjà ? D’où viennent-elles ?
2. Après plusieurs appels à l’API, montrez le Counter de requêtes HTTP, quels labels apparaissent ?
3. Quelle différence entre un `Counter` et un `Histogram` ? Pourquoi utiliser un Histogram pour le temps de réponse plutôt qu’un Counter ?
4. Comment votre middleware sait-il que la requête est terminée avant d’enregistrer la métrique ?
5. Donnez trois approches pour mesurer un temps de réponse, commentez-les et classez-les (précision, performance, fiabilité).

## Partie 4 — Health check `/health` (simple puis DB-ready)

> Objectif : permettre à une application de signaler son état à un système externe (load balancer, orchestrateur, etc.).

### Travail demandé

* Implémenter un endpoint `/health` indiquant que l’application est en fonctionnement
* Ajouter la vérification de la base de données comme dépendance critique
* L’endpoint doit être capable de distinguer :
  * un service actif et opérationnel
  * un service incapable de répondre correctement aux requêtes

### Questions théoriques

1. Montrer les réponses de vos endpoints quand tout fonctionne, quel statut HTTP et quel corps de réponse ?
2. Montrer les réponses quand la base de données est down, les statuts HTTP ont-il changé ?
3. Pourquoi est-il important que le statut HTTP reflète l’état du service, et pas seulement le corps JSON ?
4. Quelle différence entre une `livenessProbe` et une `readinessProbe` ? Lequel de vos endpoints correspond à chacune ?

