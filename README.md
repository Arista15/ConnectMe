# KBS Comptable v2 — Next.js + Supabase

Reconstruction de **kbs-comptable.org** (Kafaus Business Service SARL) : comptabilité SYSCOHADA révisé, multi-sites (Lubumbashi, Kolwezi…), en **USD et CDF**, pour les secteurs services, BTP et transport/logistique.

## Fonctionnalités

| Module                     | Détails                                                                                                                                                                                                  |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Journal & grand livre      | Partie double (date, pièce, comptes débit/crédit), écritures types par secteur, recherche/filtres, contre-passation, impression                                                                       |
| Factures clients           | Numérotation `FA-<SITE>-<AAAA>-<NNNN>`, écriture auto 411 / 7xx / 4431, règlements partiels, annulation par écriture inverse, facture imprimable                                                    |
| Factures fournisseurs      | Reçu en photo, PDF ou texte → analyse par l'API Claude (fournisseur, montants, **compte de charge proposé**) → brouillon → **validation par le comptable** → écriture 6xx / 4452 / 401 |
| Dépenses, caisse & banque | Dépenses comptant, recettes journalières, règlements, soldes par caisse/banque, **rapprochement**, suivi par fournisseur                                                                         |
| États financiers          | Balance, grand livre, compte de résultat, bilan — par site ou consolidé, par période ; **rapport mensuel imprimable en PDF**                                                                    |
| Rappels e-mail             | Chaque jour à 7 h (Lubumbashi) : factures en retard et à échéance sous 7 jours (clients et fournisseurs)                                                                                              |
| Multi-sites                | Sites séparés + consolidation ; un comptable ne voit que ses sites ; **taux USD/CDF par site**, chaque document garde son taux historique ; écarts de change en 676/776                          |
| Accès                     | Pas d'inscription libre : invitation par l'admin, mot de passe personnel, **code d'accès par site valable 12 h** (5 essais / 15 min)                                                               |
| Audit                      | Qui a comptabilisé quelle écriture, quand, sur quel site, dans quels comptes ; ouvertures de site, codes refusés, changements de taux                                                                  |

## Architecture

- **Next.js 15** (App Router, Server Components, Server Actions), sans dépendance UI.
- **Supabase** : Auth, Postgres, Storage (bucket privé `pieces`).
- **Sécurité au niveau de la base** : RLS sur toutes les tables ; les données comptables sont en lecture seule côté client, toute écriture passe par des fonctions `SECURITY DEFINER` qui vérifient l'accès au site, l'équilibre débit = crédit (en devise **et** en USD), puis journalisent l'audit. Le hash du code d'accès n'est jamais lisible.
- États calculés en SQL (`report_trial_balance`, `report_ledger`, `report_site_summary`), montants en USD au taux historique.

```
app/
  page.tsx                 accueil
  auth/                    connexion, confirmation des liens e-mail
  premiere-connexion/     changement obligatoire des identifiants du premier admin
  mot-de-passe-oublie/     nouveau-mot-de-passe/    connexion-site/    guide-comptables/
  espace/                  application (journal, factures, trésorerie, états, admin…)
  rapport/                 rapport mensuel imprimable
  api/analyse-recu/        analyse des reçus (Claude)
  api/cron/rappels/        rappels quotidiens (Resend)
supabase/migrations/       0001 schéma · 0002 RLS + RPC · 0003 plan SYSCOHADA · 0004 stockage · 0005 premier admin
supabase/test/             scénario de test SQL (Postgres local)
```

## Installation

### 1. Supabase

1. Créez un projet Supabase.
2. Exécutez dans l'ordre les fichiers `supabase/migrations/0001…0005` (SQL Editor, ou `supabase db push`).
3. **Authentication → Providers → Email** : désactivez « Allow new users to sign up ».
4. **Authentication → URL Configuration** : Site URL = `https://kbs-comptable.com` ; ajoutez `https://kbs-comptable.com/auth/confirm` aux Redirect URLs.
5. **Authentication → Email Templates** :
   - *Invite user* : lien `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/nouveau-mot-de-passe`
   - *Reset password* : lien `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/nouveau-mot-de-passe`
6. Configurez un SMTP (Resend conseillé) dans Authentication → SMTP pour que les invitations partent de votre domaine.

### 2. Premier administrateur

Sur une base sans utilisateur, connectez-vous avec le nom d'utilisateur `Admin` et le mot de passe temporaire `admin1234*`. La première connexion impose de choisir un nom complet, un nouveau nom d'utilisateur et un mot de passe (10 caractères minimum). Après cette étape, l'espace directeur s'ouvre et permet de créer le premier site. Les autres comptables s'invitent ensuite depuis **Administration → Comptables**.

### 3. Variables d'environnement

Copiez `.env.example` en `.env.local` et renseignez les clés (Supabase, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET`). Sans clé Anthropic, les reçus sont stockés et saisis à la main.

### 4. Lancer

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start
```

### 5. Déploiement (Vercel)

Importez le dépôt, ajoutez les variables d'environnement, déployez. `vercel.json` programme `/api/cron/rappels` à 05:00 UTC (07:00 à Lubumbashi) ; Vercel envoie `Authorization: Bearer $CRON_SECRET`.

## Règles comptables appliquées

- Une écriture comptabilisée ne se modifie pas : contre-passation (écritures manuelles) ou annulation (facture client non réglée).
- Les règlements se font dans la devise de la facture ; l'écart entre le taux de la facture et le taux du jour est passé en **676 Pertes de change / 776 Gains de change** (en contre-valeur USD).
- Comptes de trésorerie créés par site : 5711 Caisse USD, 5712 Caisse CDF, 5211 Banque USD, 5212 Banque CDF. Pour plusieurs banques, créez des sous-comptes distincts.
- Bilan : classes 1 à 5 cumulées + résultat depuis le 1er janvier. **Clôture d'exercice** : passez l'affectation du résultat (12/13) au journal AN en début d'année.

## Tests

`supabase/test/10_scenario.sql` puis `20_annulation.sql` rejouent un mois complet (sites, codes, factures CDF avec changement de taux, reçu fournisseur, dépenses, recettes, contre-passation, annulation, changement de code, contrôles RLS) sur un Postgres local avec `00_shim.sql` (simulation minimale de Supabase).

## Reprise des données de l'ancienne application

Non incluse : exportez les écritures de l'ancienne base (CSV) puis importez-les via une écriture d'à-nouveaux (journal AN) par site, ou demandez un script d'import adapté au format d'export.
#� �K�B�S�-�C�O�M�P�T�A�B�L�E�
�
�

## Mise à jour 0006 — parité avec kbs-comptable.com

Exécuter une fois `supabase/migrations/0006_parite_kbs_reference.sql` dans l'éditeur SQL de Supabase
(déjà inclus à la fin de `INSTALLER_SUPABASE.sql` pour une nouvelle installation). Il ajoute :
devis clients, acomptes clients (4191) et leur imputation, comptes par secteur, mentions légales des
sites sur les factures (adresse, RCCM, Id. nat., NIF), modification/suppression des écritures manuelles.
