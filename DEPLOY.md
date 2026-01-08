# Deploy sorrend (Cloudflare Pages + Firestore rules)

## Cloudflare Pages
1. Deployold a frontendet Cloudflare Pages-re.

## Firebase Firestore rules
1. Válaszd ki a projektet:
   ```bash
   firebase use <PROJECT_ID>
   ```
2. Deployold a Firestore rules-t:
   ```bash
   firebase deploy --only firestore:rules
   ```

## Megjegyzés
A Preview környezet eltérő Firebase projektre is mutathat. Ilyenkor a rules-t arra a projektre is deployolni kell, ahol a frontend fut.
