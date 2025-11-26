# 📋 Dokumentacja Workflow - System GoPro

## 🎯 Przegląd

System automatycznie zarządza wieloma kamerami GoPro zgodnie z harmonogramem cron. Kluczowe usprawnienia:

1. ✅ **Zbiorcze notyfikacje** - jedna notyfikacja dla wszystkich błędów zamiast osobnej dla każdej kamery
2. ✅ **Warunkowe wykonywanie** - kolejne akcje wykonują się tylko jeśli poprzednie się powiodły
3. ✅ **Kody wyjścia** - wszystkie komendy zwracają odpowiedni exit code (0 = sukces, 1 = błąd)

---

## 🔄 Workflow automatyczny (cron-handler.ts)

### Harmonogram:

```
10:50 - Keep-alive (sprawdzenie statusu)
11:00 - Start timelapse
11:20 - Automatyczny status check
11:50 - Automatyczny status check
12:00 - Stop timelapse
12:05 - Download files → Upload to S3 (automatycznie!)
12:20 - Automatyczny status check
12:50 - Automatyczny status check
13:00 - Delete files from cameras
```

### Warunki zależności:

#### 1. **Download → Upload (sekwencyjnie)**

```
Download files (12:05)
  ├─ ✅ Sukces → Upload to S3
  └─ ❌ Błąd → Upload NIE wykonuje się
```

**Dlaczego?** Nie ma sensu uploadować plików, których nie udało się pobrać.

#### 2. **Delete files (niezależnie)**

```
Delete files (13:00)
  └─ Wykonuje się zawsze o 13:00, niezależnie od download/upload
```

**Dlaczego?** Nawet jeśli download się nie powiódł, możemy chcieć wyczyścić stare pliki z kamer.

---

## 📧 System notyfikacji

### Zbiorcze notyfikacje:

Zamiast wysyłać osobną notyfikację dla każdej kamery:

```
❌ Camera 192.168.1.100 failed
❌ Camera 192.168.1.101 failed
❌ Camera 192.168.1.102 failed
```

System wysyła **jedną zbiorczą notyfikację**:

```
🚨 GoPro Error: download-files

Problemy podczas pobierania z 3 z 5 kamer

📷 192.168.1.100: Connection timeout
📷 192.168.1.101: File not found
📷 192.168.1.102: Network error
```

### Kiedy wysyłane są notyfikacje:

- ❌ Błędy w `start-timelapse` (zbiorcza dla wszystkich kamer)
- ❌ Błędy w `stop-timelapse` (zbiorcza dla wszystkich kamer)
- ❌ Błędy w `download-files` (zbiorcza dla wszystkich kamer)
- ❌ Błędy w `upload-files` (zbiorcza dla wszystkich kamer)
- ❌ Błędy w `delete-files` (zbiorcza dla wszystkich kamer)
- ❌ Błędy w `status` check (co 30 min)

---

## 🔧 Komendy CLI

Wszystkie komendy można uruchamiać ręcznie:

### Start timelapse

```bash
npm run start-timelapse
```

- Exit code 0 = wszystkie kamery started ✅
- Exit code 1 = przynajmniej jedna kamera failed ❌

### Stop timelapse

```bash
npm run stop-timelapse
```

- Exit code 0 = wszystkie kamery stopped ✅
- Exit code 1 = przynajmniej jedna kamera failed ❌

### Download files

```bash
npm run download-files
```

- Exit code 0 = wszystkie pliki pobrane ✅
- Exit code 1 = przynajmniej jeden plik/kamera failed ❌

### Upload to S3

```bash
npm run upload-files
```

- Exit code 0 = wszystkie pliki uploaded ✅
- Exit code 1 = przynajmniej jeden plik/kamera failed ❌

### Delete files

```bash
npm run delete-files -- --confirm
```

- Exit code 0 = wszystkie pliki usunięte ✅
- Exit code 1 = przynajmniej jedna kamera failed ❌

### Status check

```bash
npm run status
```

- Pokazuje status wszystkich kamer
- Wysyła notyfikację przy błędzie

---

## 🔗 Łańcuch zależności w cron

### Przykład sukcesu:

```
12:05 - Download files
  ├─ 📷 192.168.1.100: ✅ Downloaded 50 files
  ├─ 📷 192.168.1.101: ✅ Downloaded 48 files
  └─ 📷 192.168.1.102: ✅ Downloaded 52 files

  ✅ Exit code 0 → Uruchamiam upload

12:05 - Upload to S3
  ├─ 📷 192.168.1.100: ✅ Uploaded 50 files
  ├─ 📷 192.168.1.101: ✅ Uploaded 48 files
  └─ 📷 192.168.1.102: ✅ Uploaded 52 files

  ✅ Exit code 0
```

### Przykład błędu:

```
12:05 - Download files
  ├─ 📷 192.168.1.100: ✅ Downloaded 50 files
  ├─ 📷 192.168.1.101: ❌ Connection timeout
  └─ 📷 192.168.1.102: ✅ Downloaded 52 files

  ❌ Exit code 1 → Upload ANULOWANY
  📧 Wysłano notyfikację email + SMS

⚠️  Upload nie wykonuje się!
```

---

## ⚙️ Konfiguracja

### Zmiana godzin w cron-handler.ts:

```typescript
const KEEP_ALIVE_TIME = "10:50";
const START_TIME = "11:00";
const STOP_TIME = "12:00";
const DOWNLOAD_TIME = "12:05";
const DELETE_TIME = "13:00";
```

### Zmiana interwału status check:

```typescript
const STATUS_CHECK_INTERVAL_MINUTES = 30; // domyślnie 30 min
```

---

## 🧪 Testowanie

### Test pojedynczej komendy:

```bash
npm run download-files
echo $?  # Pokaże exit code (0 lub 1)
```

### Test łańcucha w bash:

```bash
npm run download-files && npm run upload-files
# Upload wykona się TYLKO jeśli download zwróci exit code 0
```

### Test cron handlera:

```bash
# Zmień interwał na 1 minutę dla testów:
const STATUS_CHECK_INTERVAL_MINUTES = 1;

# Uruchom:
ts-node cron-handler.ts
```

---

## 📊 Monitoring

### Logi z timestampem:

```
[26.11.2025, 12:05:30] 📥 Pobieram zdjęcia z GoPro...
[26.11.2025, 12:06:15] ✅ Zdjęcia pobrane pomyślnie
[26.11.2025, 12:06:16] ☁️ Uploaduję pliki do S3...
[26.11.2025, 12:07:45] ✅ Upload do S3 zakończony pomyślnie
```

### Notyfikacje:

- 📧 Email (AWS SES)
- 📱 SMS (AWS SNS)
- 🔔 Push (ntfy.sh/Slack/Discord)

---

## 🚨 Troubleshooting

### Upload nie wykonuje się mimo że download się powiódł:

**Sprawdź logi:**

```bash
tail -f /path/to/logs
```

**Możliwe przyczyny:**

1. Download zwrócił exit code 1 mimo częściowego sukcesu
2. stderr zawierał słowo "Error"
3. Błąd w kodzie upload

### Notyfikacje nie przychodzą:

**Test notyfikacji:**

```bash
npm run test-notifications
```

**Sprawdź konfigurację:**

```bash
cat .env | grep NOTIFICATIONS
```

### Kamery nie odpowiadają:

**Sprawdź status:**

```bash
npm run status
```

**Keep-alive:**

- Wykonuje się o 10:50 (10 min przed startem)
- Co 30 min między 10:50-13:00
- Wysyła notyfikację przy błędzie

---

## 📝 Najlepsze praktyki

1. ✅ **Zawsze testuj ręcznie** przed ustawieniem crona
2. ✅ **Monitoruj notyfikacje** - sprawdź czy przychodzą
3. ✅ **Sprawdzaj kody wyjścia** - `echo $?` po każdej komendzie
4. ✅ **Dostosuj godziny** do swoich potrzeb
5. ✅ **Zachowaj margines czasu** między download a delete (55 min domyślnie)

---

## 🎬 Produkcyjne wdrożenie

### 1. Skonfiguruj notyfikacje:

```bash
cp .env.example .env
# Edytuj .env zgodnie z AWS-SETUP-GUIDE.md
```

### 2. Przetestuj workflow:

```bash
npm run start-timelapse
npm run stop-timelapse
npm run download-files
npm run upload-files
npm run delete-files -- --confirm
```

### 3. Uruchom cron handler:

```bash
ts-node cron-handler.ts
```

### 4. (Opcjonalnie) Dodaj do systemowego crona:

```bash
crontab -e

# Dodaj linię:
@reboot cd /path/to/gopro && npm start
```

---

**Gotowe!** 🎉 System automatycznie zarządza kamerami i powiadamia o problemach.
