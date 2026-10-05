/**
 * One message, already rendered. Subjects and bodies are generic (section
 * 10.2 of the architecture record): a link and a sentence, never anything
 * about what the person tracks.
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string | undefined;
}

/**
 * The transport Better Auth's callbacks hand their messages to. Resend
 * arrives in task C5 behind this interface and stays out of this package;
 * previews and local runs keep the console transport so a seeded persona can
 * never receive real mail.
 */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/**
 * Renders mail to stdout, the development and test transport. The address
 * and the link are printed because a developer needs to click the link; no
 * health data ever reaches these callbacks, so nothing else can leak here.
 */
export class ConsoleMailer implements Mailer {
  constructor(private readonly write: (line: string) => void = (line) => console.log(line)) {}

  async send(message: MailMessage): Promise<void> {
    this.write(`mail to=${message.to} subject=${JSON.stringify(message.subject)}`);
    this.write(message.text);
  }
}

/**
 * Keeps the most recent messages in memory for the `E2E_MAIL_CAPTURE`
 * endpoint (task C5), which returns the last verification link to a browser
 * test. Oldest messages fall off once `capacity` is reached.
 */
export class CaptureMailer implements Mailer {
  readonly messages: MailMessage[] = [];

  constructor(private readonly capacity = 20) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError("CaptureMailer capacity must be a positive integer");
    }
  }

  async send(message: MailMessage): Promise<void> {
    this.messages.push(message);
    if (this.messages.length > this.capacity) {
      this.messages.splice(0, this.messages.length - this.capacity);
    }
  }

  /** The newest message, optionally the newest one sent to `to`. */
  last(to?: string): MailMessage | undefined {
    for (let i = this.messages.length - 1; i >= 0; i -= 1) {
      const message = this.messages[i];
      if (message && (to === undefined || message.to === to)) return message;
    }
    return undefined;
  }

  clear(): void {
    this.messages.length = 0;
  }
}
