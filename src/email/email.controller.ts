import { Body, Controller, Post } from '@nestjs/common';
import { EmailService } from '@/email/email.service';
import { ApiOperation } from '@nestjs/swagger';
import {
  SendEmailDto,
  TestSendRegisterOtpDto,
} from '@/email/dto/create-email.dto';
import { IApiResponse } from '@/common/interceptors/transform.interceptor';

@Controller('email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  // @Public()
  @ApiOperation({ summary: 'Send a test email to verify email configuration' })
  @Post('test-email')
  async testEmail(@Body() body: SendEmailDto): Promise<IApiResponse<any>> {
    const result = await this.emailService.sendTestEmail(body.toEmail);
    return {
      statusCode: 200,
      message: 'Test email sent successfully',
      data: result,
    };
  }

  // @Public()
  @ApiOperation({ summary: 'Send a registration OTP email to a user' })
  @Post('send-register-otp')
  async sendRegisterOtp(
    @Body() body: TestSendRegisterOtpDto,
  ): Promise<IApiResponse<any>> {
    await this.emailService.sendRegisterOtp(
      body.email,
      body.userName,
      body.otp,
      body.expireText,
    );
    return {
      statusCode: 200,
      message: 'Registration OTP email sent successfully',
      data: null,
    };
  }
}
