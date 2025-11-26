# 🗑️ Zarządzanie plikami - Lokalne i GoPro

## 📋 Przegląd

System zarządza plikami w dwóch miejscach:

1. **Pliki na kamerach GoPro** (karty SD)
2. **Pliki lokalne** (pobrane do `./downloads/`)

## 🔄 Automatyczny workflow (cron)

### Harmonogram:

```
20:05 - Download files z kamer do ./downloads/
20:06 - Upload do S3 + automatyczne usuwanie lokalnych plików (tylko jeśli sukces!)
23:00 - Delete files z kamer GoPro
```

### Logika usuwania:

#### 1. **Pliki lokalne - usuwane TYLKO po sukcesie upload**

```typescript
// W cron-handler.ts:
exec("npm run upload-files -- --delete-after-upload", ...)
```

**Scenariusz A: Upload sukces dla wszystkich kamer**

```
📷 Camera 192.168.1.100: ✅ Upload 50 plików
  🗑️ Usunięto 50 plików lokalnych
  ✓ Usunięto pusty katalog

📷 Camera 192.168.1.101: ✅ Upload 48 plików
  🗑️ Usunięto 48 plików lokalnych
  ✓ Usunięto pusty katalog

Rezultat: ./downloads/ PUSTE
```

**Scenariusz B: Upload failnął dla jednej kamery**

```
📷 Camera 192.168.1.100: ✅ Upload 50 plików
  🗑️ Usunięto 50 plików lokalnych

📷 Camera 192.168.1.101: ❌ S3 error
  ⚠️ Pliki lokalne ZACHOWANE (można spróbować ponownie)

Rezultat: ./downloads/192_168_1_101/ ZACHOWANE
```

**Korzyści:**

- ✅ Możesz spróbować upload ponownie dla failed kamery
- ✅ Nie tracisz danych jeśli S3 padnie
- ✅ Bezpieczne - pliki usuwane tylko po potwierdzeniu upload

#### 2. **Pliki na kamerach - usuwane o stałej godzinie**

```typescript
// W cron-handler.ts:
const DELETE_TIME = "23:00"; // 3h po download
```

**Dlaczego niezależnie od upload?**

- Karta SD ma ograniczoną pojemność
- Nawet jeśli upload failnął, musisz zwolnić miejsce
- Pliki lokalne są już pobrane (backup)

**WAŻNE:**

- ⏰ DELETE_TIME powinno być kilka godzin po DOWNLOAD_TIME
- ⏰ Daje to czas na upload + ewentualne retry
- ⏰ Zalecane: min 3h buffer (np. download 20:05, delete 23:00)

---

## 🛠️ Komendy manualne

### 1. Upload z automatycznym usuwaniem lokalnych plików

```bash
npm run upload-files -- --delete-after-upload
```

**Co robi:**

- Upload plików do S3
- Usuwa pliki lokalne **tylko dla kamer gdzie upload się powiódł**
- Zachowuje pliki dla kamer gdzie upload failnął

**Przykład output:**

```
=== Upload Summary ===
Total files uploaded: 150
Successful cameras: 2/3
Local files deleted for: 2 camera(s)
⚠️  Local files PRESERVED for 1 failed camera(s) - można spróbować ponownie!
```

### 2. Upload bez usuwania lokalnych plików

```bash
npm run upload-files
```

**Co robi:**

- Upload plików do S3
- **NIE** usuwa plików lokalnych
- Użyteczne do testów lub jeśli chcesz zachować local backup

### 3. Manualne czyszczenie plików lokalnych

```bash
npm run clean-local
```

**Co robi:**

- Pokazuje ile plików i miejsca
- Wymaga potwierdzenia `--confirm`

**Przykład:**

```bash
$ npm run clean-local

⚠️  WARNING: This will delete ALL local downloaded files!
Found 150 file(s) in 3 camera directory(ies)
Total size: 750.50 MB

To confirm, run with --confirm flag:
npm run clean-local -- --confirm
```

**Z potwierdzeniem:**

```bash
npm run clean-local -- --confirm

Deleting 150 file(s) (750.50 MB)...

📷 Camera: 192.168.1.100
  ✓ Deleted 50 file(s) and directory
📷 Camera: 192.168.1.101
  ✓ Deleted 48 file(s) and directory
📷 Camera: 192.168.1.102
  ✓ Deleted 52 file(s) and directory

✓ Cleaned 150 file(s) and 3 director(ies)
```

### 4. Usuwanie plików z kamer GoPro

```bash
npm run delete-files -- --confirm
```

**Co robi:**

- Usuwa **wszystkie** pliki ze **wszystkich** kamer
- Wymaga `--confirm` (bezpieczeństwo)
- **Nie** usuwa plików lokalnych

---

## 🔍 Sprawdzanie stanu

### Pliki lokalne:

```bash
ls -lh ./downloads/
du -sh ./downloads/*/
```

### Pliki na kamerach:

```bash
npm run list-files
```

### Status i wolne miejsce:

```bash
npm run status
```

---

## 🎯 Best practices

### 1. **Zawsze testuj upload przed delete**

❌ **ŹLE:**

```bash
npm run download-files
npm run delete-files -- --confirm  # Upload nie wykonany!
```

✅ **DOBRZE:**

```bash
npm run download-files
npm run upload-files -- --delete-after-upload
# Jeśli upload OK, pliki lokalne automatycznie usunięte
npm run delete-files -- --confirm  # Czyści kamery
```

### 2. **Retry upload jeśli failnął**

```bash
# Pierwsze podejście
npm run upload-files -- --delete-after-upload

# Jeśli failnął dla niektórych kamer:
# Pliki dla failed kamer są zachowane w ./downloads/

# Spróbuj ponownie:
npm run upload-files -- --delete-after-upload
# Wgra tylko pliki które zostały (dla failed kamer)
```

### 3. **Backup przed czyszczeniem**

Jeśli chcesz być extra ostrożny:

```bash
# Download
npm run download-files

# Upload BEZ usuwania lokalnych
npm run upload-files

# Sprawdź S3 czy wszystko jest
aws s3 ls s3://bucket/path/

# Dopiero potem usuń lokalne
npm run clean-local -- --confirm

# I na końcu czyść kamery
npm run delete-files -- --confirm
```

### 4. **Monitoruj miejsce na dysku**

```bash
# Sprawdź lokalne miejsce
df -h .

# Sprawdź rozmiar downloads
du -sh ./downloads/

# Jeśli brakuje miejsca, usuń stare pliki
npm run clean-local -- --confirm
```

---

## ⚠️ Ostrzeżenia

### 1. **Delete z kamer jest nieodwracalne!**

```bash
npm run delete-files -- --confirm
# Pliki znikają NA ZAWSZE z kamer!
# Upewnij się że są w S3 lub lokalnie!
```

### 2. **Upload + delete lokalnych = ryzyko**

```bash
npm run upload-files -- --delete-after-upload
# Jeśli upload failnął i nie zauważysz...
# ...i potem jeszcze delete z kamer...
# = UTRATA DANYCH!
```

**Mitygacja:**

- ✅ Notyfikacje email/SMS przy błędach upload
- ✅ Pliki lokalne zachowane dla failed kamer
- ✅ Buffer czasowy między download a delete z kamer (3h)

### 3. **Brak miejsca na lokalnym dysku**

```bash
# Jeśli download failnął przez brak miejsca:
npm run clean-local -- --confirm  # Usuń stare
npm run download-files             # Spróbuj ponownie
```

---

## 🔄 Przykładowe scenariusze

### Scenariusz 1: Normalny workflow (automatyczny)

```
20:05 - Download (150 plików, 750MB)
20:30 - Upload start + delete lokalnych po sukcesie
22:00 - Upload zakończony, pliki lokalne usunięte
23:00 - Delete z kamer
```

### Scenariusz 2: Upload częściowo failed

```
20:05 - Download (150 plików z 3 kamer)
20:30 - Upload:
  - Camera 1: ✅ Success → lokalne usunięte
  - Camera 2: ✅ Success → lokalne usunięte
  - Camera 3: ❌ Failed → lokalne ZACHOWANE

📧 Notyfikacja: "Upload failed for Camera 3"

Akcja:
1. Sprawdź co się stało (S3? network?)
2. Napraw problem
3. Ręczny retry:
   npm run upload-files -- --delete-after-upload
   # Wgra tylko Camera 3 (pliki zachowane)

23:00 - Delete z kamer (wszystkie 3 kamery)
```

### Scenariusz 3: Internet padł podczas uploadu

```
20:05 - Download (150 plików)
20:30 - Upload start
20:45 - Internet padł ❌
20:50 - Upload timeout

Rezultat:
- Pliki lokalne: ZACHOWANE (wszystkie 150)
- Pliki w S3: Częściowo (może 50/150)
- Pliki na kamerach: Nadal są

📧 Notyfikacja: "Upload failed for all cameras"

Akcja:
1. Internet wrócił
2. Retry upload:
   npm run upload-files -- --delete-after-upload
3. Wszystkie pliki lokalne nadal są
4. Upload dokończy pracę
5. Po sukcesie pliki lokalne usunięte

23:00 - Delete z kamer (mamy backup w S3!)
```

### Scenariusz 4: Testowanie przed produkcją

```bash
# 1. Download test
npm run download-files

# 2. Sprawdź co pobrano
ls -lh ./downloads/

# 3. Upload test (BEZ usuwania lokalnych)
npm run upload-files

# 4. Sprawdź S3
aws s3 ls s3://bucket/gopro-footage/

# 5. Wszystko OK? Usuń lokalnie
npm run clean-local -- --confirm

# 6. Czyść kamery
npm run delete-files -- --confirm
```

---

## 📊 Monitoring

### Co monitorować:

1. **Wolne miejsce lokalne:**

   ```bash
   df -h .
   ```

2. **Rozmiar downloads:**

   ```bash
   du -sh ./downloads/
   ```

3. **Pliki na kamerach:**

   ```bash
   npm run list-files
   ```

4. **S3 storage:**
   ```bash
   aws s3 ls s3://bucket/gopro-footage/ --summarize --recursive
   ```

### Alarmy:

- ⚠️ Lokalny dysk >80% pełny → `npm run clean-local`
- ⚠️ Kamera >90% pełna → zwiększ częstotliwość delete
- ⚠️ Upload failures → sprawdź S3 credentials / network

---

## ✅ Podsumowanie

**Kluczowe zasady:**

1. ✅ **Pliki lokalne** = usuwane tylko po sukcesie upload (per-kamera)
2. ✅ **Pliki na kamerach** = usuwane o stałej godzinie (3h po download)
3. ✅ **Buffer czasowy** = min 3h między download a delete z kamer
4. ✅ **Notyfikacje** = dostajesz info o każdym błędzie
5. ✅ **Retry możliwe** = pliki dla failed upload są zachowane lokalnie
6. ✅ **Bezpieczeństwo** = wymaga `--confirm` dla delete

**Bezpieczny workflow:**

```
Download → Upload (z auto-delete lokalnych) → Czekaj 3h → Delete z kamer
```

Pytania? Sprawdź logi lub uruchom `npm run <komenda> --help`
