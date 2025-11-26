import axios from "axios";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

export interface NotificationConfig {
  enabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  emailTo?: string;
  emailFrom?: string;
  phoneNumber?: string;
  webhookUrl?: string; // Opcjonalny webhook (np. do Slack, Discord, ntfy.sh)
  awsRegion: string;
}

export function loadNotificationConfig(): NotificationConfig {
  return {
    enabled: process.env.NOTIFICATIONS_ENABLED === "true",
    emailEnabled: process.env.EMAIL_NOTIFICATIONS === "true",
    smsEnabled: process.env.SMS_NOTIFICATIONS === "true",
    emailTo: process.env.NOTIFICATION_EMAIL_TO,
    emailFrom: process.env.NOTIFICATION_EMAIL_FROM,
    phoneNumber: process.env.NOTIFICATION_PHONE,
    webhookUrl: process.env.NOTIFICATION_WEBHOOK_URL,
    awsRegion: process.env.AWS_REGION || "us-east-1",
  };
}

export class NotificationHandler {
  private config: NotificationConfig;
  private sesClient: SESClient;
  private snsClient: SNSClient;

  constructor(config: NotificationConfig) {
    this.config = config;
    this.sesClient = new SESClient({ region: config.awsRegion });
    this.snsClient = new SNSClient({ region: config.awsRegion });
  }

  async sendError(
    action: string,
    error: string,
    cameraIp?: string
  ): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const timestamp = new Date().toLocaleString("pl-PL", {
      dateStyle: "short",
      timeStyle: "medium",
    });

    const subject = `🚨 GoPro Error: ${action}`;
    const message = this.formatErrorMessage(action, error, timestamp, cameraIp);

    const promises: Promise<void>[] = [];

    // Webhook (najprostsze - ntfy.sh, Slack, Discord)
    if (this.config.webhookUrl) {
      promises.push(this.sendWebhook(subject, message));
    }

    // Email przez AWS SES / SendGrid / inne
    if (this.config.emailEnabled && this.config.emailTo) {
      promises.push(this.sendEmail(subject, message));
    }

    // SMS przez AWS SNS / Twilio
    if (this.config.smsEnabled && this.config.phoneNumber) {
      promises.push(this.sendSMS(message));
    }

    try {
      await Promise.allSettled(promises);
    } catch (err) {
      console.error("Failed to send notification:", err);
    }
  }

  private formatErrorMessage(
    action: string,
    error: string,
    timestamp: string,
    cameraIp?: string
  ): string {
    let message = `❌ GoPro Error Alert\n\n`;
    message += `⏰ Time: ${timestamp}\n`;
    message += `🎬 Action: ${action}\n`;
    if (cameraIp) {
      message += `📷 Camera: ${cameraIp}\n`;
    }
    message += `\n❗ Error:\n${error}`;
    return message;
  }

  private async sendWebhook(subject: string, message: string): Promise<void> {
    if (!this.config.webhookUrl) return;

    try {
      // Uniwersalny format - dostosuj do swojego webhooków
      // ntfy.sh format:
      if (this.config.webhookUrl.includes("ntfy.sh")) {
        await axios.post(this.config.webhookUrl, message, {
          headers: {
            Title: subject,
            Priority: "urgent",
            Tags: "rotating_light,camera",
          },
        });
      }
      // Slack format:
      else if (this.config.webhookUrl.includes("slack.com")) {
        await axios.post(this.config.webhookUrl, {
          text: `${subject}\n\n${message}`,
        });
      }
      // Discord format:
      else if (this.config.webhookUrl.includes("discord.com")) {
        await axios.post(this.config.webhookUrl, {
          content: `${subject}\n\`\`\`\n${message}\n\`\`\``,
        });
      }
      // Generic webhook
      else {
        await axios.post(this.config.webhookUrl, {
          subject,
          message,
        });
      }

      console.log("✓ Webhook notification sent");
    } catch (error) {
      console.error("Failed to send webhook:", error);
    }
  }

  private async sendEmail(subject: string, message: string): Promise<void> {
    if (!this.config.emailTo || !this.config.emailFrom) {
      console.error(
        "Email configuration missing (NOTIFICATION_EMAIL_TO or NOTIFICATION_EMAIL_FROM)"
      );
      return;
    }

    try {
      const command = new SendEmailCommand({
        Source: this.config.emailFrom,
        Destination: {
          ToAddresses: [this.config.emailTo],
        },
        Message: {
          Subject: {
            Data: subject,
            Charset: "UTF-8",
          },
          Body: {
            Text: {
              Data: message,
              Charset: "UTF-8",
            },
          },
        },
      });

      await this.sesClient.send(command);
      console.log("✓ Email notification sent");
    } catch (error) {
      console.error(
        "Failed to send email:",
        error instanceof Error ? error.message : error
      );
    }
  }

  private async sendSMS(message: string): Promise<void> {
    if (!this.config.phoneNumber) {
      console.error("SMS configuration missing (NOTIFICATION_PHONE)");
      return;
    }

    try {
      // Skróć wiadomość do 160 znaków (limit SMS)
      const shortMessage =
        message.length > 160 ? message.substring(0, 157) + "..." : message;

      const command = new PublishCommand({
        PhoneNumber: this.config.phoneNumber,
        Message: shortMessage,
      });

      await this.snsClient.send(command);
      console.log("✓ SMS notification sent");
    } catch (error) {
      console.error(
        "Failed to send SMS:",
        error instanceof Error ? error.message : error
      );
    }
  }
}

// Singleton instance
let notificationHandler: NotificationHandler | null = null;

export function getNotificationHandler(): NotificationHandler {
  if (!notificationHandler) {
    const config = loadNotificationConfig();
    notificationHandler = new NotificationHandler(config);
  }
  return notificationHandler;
}
