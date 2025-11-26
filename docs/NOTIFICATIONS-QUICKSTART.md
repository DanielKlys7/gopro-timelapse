# 🔔 System Notyfikacji - Szybki Start

## Najszybsza metoda: ntfy.sh (2 minuty) 🚀

1. **Pobierz aplikację ntfy na telefon:**

   - [Android](https://play.google.com/store/apps/details?id=io.heckel.ntfy)
   - [iOS](https://apps.apple.com/app/ntfy/id1625396347)

2. **Wybierz unikalny temat** (topic), np.: `gopro-alerts-daniel-2025`

3. **W aplikacji ntfy:**

   - Kliknij "+" (dodaj subskrypcję)
   - Wpisz swój temat: `gopro-alerts-daniel-2025`
   - Kliknij "Subscribe"

4. **Skonfiguruj `.env`:**

   ```bash
   cp .env.example .env
   ```

   Edytuj `.env`:

   ```bash
   NOTIFICATIONS_ENABLED=true
   NOTIFICATION_WEBHOOK_URL=https://ntfy.sh/gopro-alerts-daniel-2025
   ```

5. **Testuj:**

   ```bash
   npm run test-notifications
   ```

   Powinieneś dostać powiadomienie push na telefon! 🎉

---

## Metoda AWS SES + SNS (bardziej zaawansowana)

Pełna instrukcja: [AWS-SETUP-GUIDE.md](./AWS-SETUP-GUIDE.md)

**Podstawowa konfiguracja `.env`:**

```bash
# Włącz notyfikacje
NOTIFICATIONS_ENABLED=true

# AWS Credentials
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=twoj-access-key
AWS_SECRET_ACCESS_KEY=twoj-secret-key

# Email przez AWS SES
EMAIL_NOTIFICATIONS=true
NOTIFICATION_EMAIL_FROM=twoj-zweryfikowany-email@gmail.com
NOTIFICATION_EMAIL_TO=email-gdzie-chcesz-dostawac-alerty@gmail.com

# SMS przez AWS SNS (opcjonalnie)
SMS_NOTIFICATIONS=true
NOTIFICATION_PHONE=+48123456789
```

**Testuj:**

```bash
npm run test-notifications
```

---

## Jak to działa?

System automatycznie wysyła powiadomienia gdy:

- ❌ Start timelapse się nie powiedzie
- ❌ Stop timelapse się nie powiedzie
- ❌ Pobieranie plików z kamery się nie powiedzie
- ❌ Upload do S3 się nie powiedzie
- ❌ Status check kamery się nie powiedzie
- ❌ Usuwanie plików się nie powiedzie

**Możesz włączyć wszystkie 3 metody naraz:**

- 📧 Email (AWS SES)
- 📱 SMS (AWS SNS)
- 🔔 Push notifications (ntfy.sh/Slack/Discord)

---

## Przykładowe powiadomienie

```
🚨 GoPro Error Alert

⏰ Time: 26.11.2025, 14:30:15
🎬 Action: start-timelapse
📷 Camera: 192.168.1.100

❗ Error:
Connection timeout - camera not responding
```

---

## Wyłączanie notyfikacji

W `.env`:

```bash
NOTIFICATIONS_ENABLED=false
```

Lub wyłącz konkretną metodę:

```bash
EMAIL_NOTIFICATIONS=false
SMS_NOTIFICATIONS=false
```

---

## Troubleshooting

### Notyfikacje nie przychodzą:

1. **Sprawdź konfigurację:**
   ```bash
   npm run test-notifications
   ```
2. **ntfy.sh nie działa:**

   - ✅ Sprawdź czy temat w aplikacji zgadza się z `.env`
   - ✅ Sprawdź połączenie internetowe
   - ✅ Testuj ręcznie: `curl -d "Test" https://ntfy.sh/twoj-temat`

3. **AWS SES/SNS nie działa:**
   - ✅ Sprawdź [AWS-SETUP-GUIDE.md](./AWS-SETUP-GUIDE.md)
   - ✅ Zweryfikuj email w AWS SES Console
   - ✅ Sprawdź czy klucze AWS są poprawne
   - ✅ Sprawdź czy jesteś poza Sandbox Mode

---

## Koszty

| Metoda          | Koszt                                  |
| --------------- | -------------------------------------- |
| ntfy.sh         | **DARMOWE** ✅                         |
| AWS SES (email) | **DARMOWE** dla <62k emaili/miesiąc ✅ |
| AWS SNS (SMS)   | ~$0.006-0.08 za SMS (Polska) 💰        |

Przy 5-10 błędów dziennie:

- ntfy.sh: **$0/miesiąc**
- AWS SES: **$0/miesiąc**
- AWS SNS: **~$1-5/miesiąc**

---

## Rekomendacja ⭐

**Start:** Użyj **ntfy.sh** - działa od razu, zero konfiguracji!

**Produkcja:**

- **ntfy.sh** (push notifications) + **AWS SES** (email)
- Opcjonalnie dodaj **AWS SNS** (SMS) dla krytycznych błędów
