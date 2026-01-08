# Mintleaf

## Mobilapp előkészítés
Ez a projekt elő van készítve Capacitor integrációra.
A folyamat indítása előtt futtasd:
```bash
npm run build
npx cap init
```

## Beosztáskészítő – PNG export zebra csíkozás tesztelése
1. Telepítsd a függőségeket, majd indítsd a fejlesztői szervert:
   ```bash
   npm install
   npm run dev
   ```
2. Nyisd meg a böngészőben a `http://localhost:5173/?demo=true` címet, így a demó adatok automatikusan betöltődnek.
3. A bal oldali menüben válaszd a **Beosztás** appot (vagy a kezdőoldali „Beosztásom megtekintése” gombot).
4. Kattints az **Export** gombra, majd válaszd a **PNG** lehetőséget és erősítsd meg.
5. A letöltött képen ellenőrizd, hogy a tábla sorai váltakozó (zebra) háttérszínűek, a név oszlop pedig szintén váltakozó árnyalatot kap, miközben a „Szabadnap”/„Szabi” jelölések háttérszíne megmarad.

## Deploy sorrend (Cloudflare Pages + Firestore rules)
1. Cloudflare Pages: deployold a frontendet.
2. Firebase: deployold a szabályokat a megfelelő projektre:
   ```bash
   firebase deploy --only firestore:rules --project <PROJECT_ID>
   ```
3. Ellenőrizd, hogy a frontend ugyanahhoz a Firebase projekthez van konfigurálva, mint ahová a szabályokat telepítetted.

### Firebase projekt kiválasztása (Pages)
Jelenleg a Firebase projekt konfigurációja a kódban van rögzítve:
- `src/core/firebase/config.ts`
- `src/ui/components/apps/AddUserModal.tsx`

Nincsenek VITE_* környezeti változók, amelyek ezt felülírnák; ha projektet váltasz, ezeket a konfigurációkat kell módosítani.
