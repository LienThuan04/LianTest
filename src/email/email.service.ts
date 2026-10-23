import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, {
  type SMTPSentMessageInfo,
  type Transporter,
} from 'nodemailer';
import ejs from 'ejs';
import path from 'path';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  // Khai báo kết quả SMTP để sendMail giữ kiểu của messageId.
  private readonly transporter: Transporter<SMTPSentMessageInfo>;
  private readonly appName: string;
  private readonly supportEmail: string;
  private readonly fromEmail: string;
  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('EMAIL_HOST');
    const port = Number(this.configService.get<string>('EMAIL_PORT') || '587');
    const authUser = this.configService.get<string>('EMAIL_AUTH_USER');
    const authPass = this.configService.get<string>('EMAIL_AUTH_PASS');
    this.fromEmail = this.configService.get<string>('EMAIL_FROM')!;
    this.supportEmail = this.configService.get<string>('SUPPORT_EMAIL')!;
    this.appName = this.configService.get<string>('APP_NAME') || 'Project UMC';

    if (
      !host ||
      !port ||
      !authUser ||
      !authPass ||
      !this.fromEmail ||
      !this.supportEmail
    ) {
      throw new Error(`
                ${!host ? 'EMAIL_HOST is not defined in the environment variables. ' : ''}
                ${!port ? 'EMAIL_PORT is not defined in the environment variables. ' : ''}
                ${!authUser ? 'EMAIL_AUTH_USER is not defined in the environment variables. ' : ''}
                ${!authPass ? 'EMAIL_AUTH_PASS is not defined in the environment variables.' : ''}
                ${!this.fromEmail ? 'EMAIL_FROM is not defined in the environment variables. ' : ''}
                ${!this.supportEmail ? 'SUPPORT_EMAIL is not defined in the environment variables. ' : ''}`);
    }
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: false, // true for 465, false for other ports
      auth: {
        user: authUser,
        pass: authPass,
      },
    });
  }

  async sendRegisterOtp(
    email: string,
    userName: string,
    otp: string,
    expireText: string,
  ): Promise<void> {
    const templatePath = path.join(
      process.cwd(),
      'src',
      'email',
      'templates',
      'register-otp.ejs',
    );
    const html = await ejs.renderFile(templatePath, {
      appName: this.appName,
      supportEmail: this.supportEmail,
      userName,
      otp,
      expireText,
    });

    const info = await this.transporter.sendMail({
      from: this.fromEmail,
      to: email,
      subject: `${this.appName} - OTP Verification`,
      html,
    });

    this.logger.log(`OTP email sent successfully: ${info.messageId}`);
  }

  async sendUpdateProfileOtp(
    email: string,
    userName: string,
    otp: string,
    expireText: string,
    changes: string[],
  ): Promise<void> {
    const templatePath = path.join(
      process.cwd(),
      'src',
      'email',
      'templates',
      'update-profile-otp.ejs',
    );
    const html = await ejs.renderFile(templatePath, {
      appName: this.appName,
      supportEmail: this.supportEmail,
      userName,
      otp,
      expireText,
      changes,
    });

    const info = await this.transporter.sendMail({
      from: this.fromEmail,
      to: email,
      subject: `${this.appName} - Verify Your Profile Update`,
      html,
    });

    this.logger.log(
      `Update profile OTP email sent successfully: ${info.messageId}`,
    );
  }

  async sendTestEmail(toEmail: string): Promise<void> {
    const templatePath = path.join(
      process.cwd(),
      'src',
      'email',
      'templates',
      'test-email.ejs',
    );
    const html = await ejs.renderFile(templatePath, {
      appName: this.appName,
      supportEmail: this.supportEmail,
      toEmail,
    });
    const info = await this.transporter.sendMail({
      from: this.fromEmail,
      to: toEmail,
      subject: `${this.appName} - Email Configuration Test`,
      html,
    });

    this.logger.log(`Test email sent successfully: ${info.messageId}`);
  }
}
